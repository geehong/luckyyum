"""LuckyYum 펫 대화 & MBTI 성격 형성 시스템 — 전체 기능 검증 스크립트.

RN 앱(App.tsx / userStore.ts / mbtiCalculator.ts)의 게임 로직을 Python으로 그대로
이식(포트)해서 실행 가능한 형태로 검증한다. 안드로이드 SDK/에뮬레이터가 없는 환경에서도
"밥주기→진화→대화→MBTI 확정→안부묻기" 전체 흐름이 의도한 대로 동작하는지 확인할 수 있다.

검증 범위:
  1. 케어 액션 (feed/play/clean/pet) + 알→성체 단계 진화
  2. 대화(대화하기) — mbtiScores 누적, 쿨타임(1시간)/일일 한도(5회) 스팸 방지
  3. 성체 전환 시 MBTI 확정(Locking) 및 이후 불변성
  4. 환생(hatchEgg) 시 대화/MBTI 상태 초기화
  5. 안부 묻기(CheckInScreen) 대사 분기 로직
  6. generate_mbti_dialogues.py 산출물(dialogues.json) 스키마
  7. 백엔드 헬스체크 / 테스터 페이지 응답 (실제 HTTP)
  8. Gemini Live WS 릴레이(/ws/live-talk) 실제 왕복 (실제 네트워크 호출, 네트워크/쿼터
     문제 시 SKIP 처리 — 이 항목만 프로젝트 상태가 아니라 외부 API 가용성에 좌우됨)

실행:
    python3 verify_all_features.py [--skip-live] [--base-url http://luckyyum.firemarkets.net]

의존성: websockets (Gemini Live 검증에만 필요, 없으면 해당 항목만 자동 SKIP)
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DIALOGUES_PATH = PROJECT_ROOT / "app" / "src" / "data" / "dialogues.json"

DEFAULT_BASE_URL = "http://luckyyum.firemarkets.net"

ONE_HOUR_MS = 60 * 60 * 1000
DAILY_DIALOGUE_LIMIT = 5
VALID_TRAITS = {"E", "I", "S", "N", "T", "F", "J", "P"}


# ────────────────────────────────────────────────────────────────────────
# 리포팅 유틸
# ────────────────────────────────────────────────────────────────────────
results: List[Dict[str, Any]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append({"name": name, "status": status, "detail": detail})
    icon = "✅" if condition else "❌"
    print(f"{icon} {name}" + (f" — {detail}" if detail and not condition else ""))
    if not condition and detail:
        print(f"    detail: {detail}")


def skip(name: str, reason: str) -> None:
    results.append({"name": name, "status": "SKIP", "detail": reason})
    print(f"⚠️  SKIP {name} — {reason}")


def section(title: str) -> None:
    print(f"\n=== {title} ===")


# ────────────────────────────────────────────────────────────────────────
# userStore.ts / mbtiCalculator.ts 를 그대로 이식한 Python 시뮬레이터
# ────────────────────────────────────────────────────────────────────────
class PetState:
    def __init__(self) -> None:
        self.pet_stage = "egg"
        self.fullness = 50
        self.intimacy = 50
        self.cleanliness = 100
        self.is_dead = False
        self.feed_count = 0
        self.play_count = 0
        self.clean_count = 0
        self.pet_count = 0
        self.mbti_scores = {t: 0 for t in VALID_TRAITS}
        self.finalized_mbti: Optional[str] = None
        self.daily_dialogue_usage: Optional[Dict[str, Any]] = None  # {date, count, lastDialogueTime}

    # ---- 케어 액션 (userStore.ts 그대로) ----
    def feed(self) -> None:
        if self.is_dead:
            return
        if self.fullness >= 100 and self.pet_stage != "egg":
            return

        new_fullness = min(100, self.fullness + 20)
        new_intimacy = min(100, self.intimacy + 5)

        new_stage = self.pet_stage
        if new_stage == "egg":
            new_stage = "baby"
        elif new_stage == "baby" and new_fullness > 70:
            new_stage = "teen"
        elif new_stage == "teen" and new_fullness > 90:
            new_stage = "adult"

        # 성체 전환 시 MBTI 확정(Locking)
        if new_stage == "adult" and self.pet_stage != "adult" and not self.finalized_mbti:
            self.finalized_mbti = compute_mbti(self, override_fullness=new_fullness, override_intimacy=new_intimacy)

        self.fullness = new_fullness
        self.intimacy = new_intimacy
        self.pet_stage = new_stage
        self.feed_count += 1

    def play(self) -> None:
        if self.is_dead:
            return
        if self.intimacy >= 100 or self.fullness <= 10:
            return
        self.intimacy = min(100, self.intimacy + 15)
        self.fullness = max(0, self.fullness - 5)
        self.play_count += 1

    def clean(self) -> None:
        if self.is_dead:
            return
        if self.cleanliness >= 100:
            return
        self.cleanliness = 100
        self.intimacy = min(100, self.intimacy + 5)
        self.clean_count += 1

    def pet(self) -> None:
        if self.is_dead:
            return
        if self.intimacy >= 100:
            return
        self.intimacy = min(100, self.intimacy + 5)
        self.pet_count += 1

    # ---- 대화 (answerDialogue) ----
    def answer_dialogue(self, traits: List[str], now_ms: Optional[int] = None) -> bool:
        """성공하면 True, 스팸 방지에 걸려 무시되면 False."""
        if self.is_dead:
            return False

        now = now_ms if now_ms is not None else int(time.time() * 1000)
        today = time.strftime("%Y-%m-%d", time.gmtime(now / 1000))

        usage = self.daily_dialogue_usage
        if not usage or usage["date"] != today:
            usage = {"date": today, "count": 0, "lastDialogueTime": 0}

        if usage["count"] >= DAILY_DIALOGUE_LIMIT:
            return False
        if usage["lastDialogueTime"] and now - usage["lastDialogueTime"] < ONE_HOUR_MS:
            return False

        for trait in traits:
            if trait in self.mbti_scores:
                self.mbti_scores[trait] += 1

        self.daily_dialogue_usage = {"date": today, "count": usage["count"] + 1, "lastDialogueTime": now}
        return True

    # ---- 환생/리셋 (hatchEgg 등) ----
    def hatch_egg(self) -> None:
        self.pet_stage = "baby"
        self.fullness = 50
        self.intimacy = 50
        self.cleanliness = 100
        self.is_dead = False
        self.feed_count = 0
        self.play_count = 0
        self.clean_count = 0
        self.mbti_scores = {t: 0 for t in VALID_TRAITS}
        self.finalized_mbti = None
        self.daily_dialogue_usage = None
        self.pet_count = 0


def compute_mbti(state: PetState, override_fullness: Optional[int] = None, override_intimacy: Optional[int] = None) -> str:
    """mbtiCalculator.ts의 calculateMBTI를 그대로 이식."""
    if state.finalized_mbti:
        return state.finalized_mbti

    fullness = override_fullness if override_fullness is not None else state.fullness
    intimacy = override_intimacy if override_intimacy is not None else state.intimacy
    total_actions = state.feed_count + state.play_count + state.clean_count

    def pick(a: str, b: str, tiebreak: str) -> str:
        if state.mbti_scores[a] == state.mbti_scores[b]:
            return tiebreak
        return a if state.mbti_scores[a] > state.mbti_scores[b] else b

    is_e = pick("E", "I", "E" if state.play_count > (state.feed_count + state.clean_count) / 2 else "I")
    is_s = pick("S", "N", "S" if total_actions and state.clean_count > total_actions * 0.2 else "N")
    is_t = pick("T", "F", "T" if state.feed_count > state.play_count else "F")
    is_j = pick("J", "P", "J" if intimacy > 50 and fullness > 50 else "P")

    return is_e + is_s + is_t + is_j


# ---- CheckInScreen.tsx 그대로 이식 ----
def get_hunger_line(fullness: int) -> str:
    if fullness < 30:
        return "배고파요, 밥 주세요 🥺"
    if fullness >= 70:
        return "든든해요!"
    return "그냥 그래요."


def get_cleanliness_line(cleanliness: int) -> str:
    if cleanliness < 30:
        return "음... 저 좀 더러운 것 같아요, 목욕시켜주세요 🛁"
    if cleanliness >= 70:
        return "깨끗해요! 걱정 마세요 ✨"
    return "적당해요."


def get_condition_line(fullness: int, cleanliness: int, is_dead: bool) -> str:
    if is_dead:
        return "..."
    if fullness < 30 or cleanliness < 30:
        return "음... 몸이 좀 찌뿌둥해요. 밥도 부족하고 씻지도 못했거든요 😢"
    if fullness >= 70 and cleanliness >= 70:
        return "완전 쌩쌩해요! 걱정 마세요 😊"
    return "그럭저럭 괜찮아요!"


# ────────────────────────────────────────────────────────────────────────
# 1~5. 게임 로직 시뮬레이션 검증
# ────────────────────────────────────────────────────────────────────────
def test_care_and_evolution() -> None:
    section("1. 케어 액션 & 알→성체 진화")
    s = PetState()
    check("초기 상태는 egg", s.pet_stage == "egg")

    s.feed()
    check("첫 밥주기 후 baby로 진화", s.pet_stage == "baby", f"stage={s.pet_stage}")

    s.feed()
    check("두 번째 밥주기 후 teen으로 진화 (fullness>70)", s.pet_stage == "teen", f"stage={s.pet_stage}, fullness={s.fullness}")

    s.feed()
    check("세 번째 밥주기 후 adult로 진화 (fullness>90)", s.pet_stage == "adult", f"stage={s.pet_stage}, fullness={s.fullness}")
    check("성체 전환과 동시에 finalizedMbti 확정", s.finalized_mbti is not None, f"finalizedMbti={s.finalized_mbti}")

    fullness_before = s.fullness
    s.feed()
    check("포만감 100(egg 아님)에서 추가 밥주기는 무시됨", s.fullness == fullness_before, f"fullness={s.fullness}")

    s2 = PetState()
    s2.play()
    check("놀아주기: intimacy +15, fullness -5", s2.intimacy == 65 and s2.fullness == 45, f"intimacy={s2.intimacy}, fullness={s2.fullness}")

    s3 = PetState()
    s3.pet()
    check("쓰다듬기: intimacy +5, petCount +1", s3.intimacy == 55 and s3.pet_count == 1, f"intimacy={s3.intimacy}, petCount={s3.pet_count}")
    s3.intimacy = 100
    s3.pet()
    check("친밀도 100일 때 쓰다듬기는 petCount 증가 안 함", s3.pet_count == 1, f"petCount={s3.pet_count}")


def test_dialogue_and_mbti() -> None:
    section("2~3. 대화(MBTI 판별) & 스팸 방지 & MBTI 확정")
    s = PetState()
    now = int(time.time() * 1000)

    ok1 = s.answer_dialogue(["E"], now_ms=now)
    check("첫 대화 답변 성공 & mbtiScores 반영", ok1 and s.mbti_scores["E"] == 1, f"ok={ok1}, E={s.mbti_scores['E']}")

    ok_cooldown = s.answer_dialogue(["I"], now_ms=now + 1000)  # 1초 후, 쿨타임(1시간) 이내
    check("1시간 쿨타임 이내 재대화는 차단됨", ok_cooldown is False, f"ok={ok_cooldown}")

    # 쿨타임을 넘겨서 5회까지 채움
    t = now
    success_count = 1
    for i in range(10):
        t += ONE_HOUR_MS + 1000
        if s.answer_dialogue(["I"], now_ms=t):
            success_count += 1
    check("일일 최대 5회로 제한됨 (쿨타임은 계속 통과시켜도)", success_count == DAILY_DIALOGUE_LIMIT, f"success_count={success_count}")

    s2 = PetState()
    t = now
    for _ in range(3):
        s2.answer_dialogue(["E"], now_ms=t)
        t += ONE_HOUR_MS + 1000
    for _ in range(2):
        s2.answer_dialogue(["S"], now_ms=t)
        t += ONE_HOUR_MS + 1000
    mbti = compute_mbti(s2)
    check("mbtiScores 기반 MBTI 계산에 대화 결과가 반영됨", mbti[0] == "E" and mbti[1] == "S", f"mbti={mbti}, scores={s2.mbti_scores}")

    # 성체 전환 후 MBTI가 고정되어 이후 행동에 흔들리지 않는지
    s3 = PetState()
    t = now
    for _ in range(4):
        s3.answer_dialogue(["I"], now_ms=t)
        t += ONE_HOUR_MS + 1000
    s3.feed(); s3.feed(); s3.feed()  # egg -> baby -> teen -> adult
    locked = s3.finalized_mbti
    check("성체 전환 시 그 시점 MBTI로 고정됨", locked is not None and locked[0] == "I", f"locked={locked}")

    for _ in range(4):
        s3.answer_dialogue(["E"], now_ms=t)
        t += ONE_HOUR_MS + 1000
    still_locked = compute_mbti(s3)
    check("성체 전환 후 추가 대화가 있어도 MBTI가 흔들리지 않음", still_locked == locked, f"before={locked}, after={still_locked}")


def test_reset_on_reincarnation() -> None:
    section("4. 환생(hatchEgg) 시 초기화")
    s = PetState()
    now = int(time.time() * 1000)
    s.answer_dialogue(["E"], now_ms=now)
    s.feed(); s.feed(); s.feed()
    s.pet()
    had_progress = s.finalized_mbti is not None and sum(s.mbti_scores.values()) > 0 and s.pet_count > 0
    check("환생 전 진행 상태가 실제로 쌓여있었는지 사전 확인", had_progress, f"finalized={s.finalized_mbti}, scores_sum={sum(s.mbti_scores.values())}, petCount={s.pet_count}")

    s.hatch_egg()
    check(
        "환생 후 mbtiScores/finalizedMbti/dailyDialogueUsage/petCount 전부 초기화",
        sum(s.mbti_scores.values()) == 0 and s.finalized_mbti is None and s.daily_dialogue_usage is None and s.pet_count == 0,
        f"scores_sum={sum(s.mbti_scores.values())}, finalized={s.finalized_mbti}, usage={s.daily_dialogue_usage}, petCount={s.pet_count}",
    )


def test_checkin_lines() -> None:
    section("5. 안부 묻기(CheckInScreen) 대사 분기")
    check("배고픔(fullness=10) → 배고파요 문구", "배고파요" in get_hunger_line(10))
    check("배부름(fullness=90) → 든든해요 문구", get_hunger_line(90) == "든든해요!")
    check("보통(fullness=50) → 중립 문구", get_hunger_line(50) == "그냥 그래요.")
    check("더러움(cleanliness=10) → 목욕 요청 문구", "목욕" in get_cleanliness_line(10))
    check("깨끗함(cleanliness=90) → 깨끗해요 문구", "깨끗해요" in get_cleanliness_line(90))
    check("컨디션 나쁨(fullness=10,cleanliness=10) → 컨디션 저하 문구", "찌뿌둥" in get_condition_line(10, 10, False))
    check("컨디션 좋음(fullness=90,cleanliness=90) → 쌩쌩해요 문구", "쌩쌩" in get_condition_line(90, 90, False))
    check("사망 상태는 별도 처리", get_condition_line(90, 90, True) == "...")


# ────────────────────────────────────────────────────────────────────────
# 6. dialogues.json 스키마 검증 (generate_mbti_dialogues.py 산출물)
# ────────────────────────────────────────────────────────────────────────
def test_dialogues_json() -> None:
    section("6. generate_mbti_dialogues.py 산출물 (dialogues.json)")
    if not DIALOGUES_PATH.exists():
        check("dialogues.json 존재", False, f"경로 없음: {DIALOGUES_PATH}")
        return

    with open(DIALOGUES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    check("dialogues.json 로드 성공 & 리스트 형식", isinstance(data, list) and len(data) > 0, f"{len(data)}개 항목")

    all_valid = True
    for item in data:
        choices = item.get("choices", [])
        if len(choices) != 3 or not item.get("situation") or not item.get("id"):
            all_valid = False
            break
        for c in choices:
            if c.get("trait") not in VALID_TRAITS or not c.get("text"):
                all_valid = False
                break
    check("모든 항목이 id/situation/choices(3개, 유효한 trait) 스키마를 만족", all_valid)

    ids = [item.get("id") for item in data]
    check("id 중복 없음", len(ids) == len(set(ids)))


# ────────────────────────────────────────────────────────────────────────
# 7. 백엔드 헬스체크 / 테스터 페이지
# ────────────────────────────────────────────────────────────────────────
def http_get(url: str, timeout: int = 8) -> Optional[int]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status
    except urllib.error.URLError:
        return None


def test_backend_http(base_url: str) -> None:
    section("7. 백엔드 HTTP 엔드포인트")
    health_status = http_get(f"{base_url}/health")
    check("/health 200 응답", health_status == 200, f"status={health_status}")

    tester_status = http_get(f"{base_url}/text")
    check("/text (tester.html) 200 응답", tester_status == 200, f"status={tester_status}")


# ────────────────────────────────────────────────────────────────────────
# 8. Gemini Live WS 릴레이 (실제 네트워크 호출)
# ────────────────────────────────────────────────────────────────────────
def test_live_ws(base_url: str, skip_live: bool) -> None:
    section("8. Gemini Live WS 릴레이 (/ws/live-talk)")

    if skip_live:
        skip("Live WS 왕복 테스트", "--skip-live 옵션으로 건너뜀")
        return

    try:
        import asyncio
        import websockets
    except ImportError:
        skip("Live WS 왕복 테스트", "websockets 패키지 미설치 (pip install websockets)")
        return

    ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws/live-talk"

    async def run() -> Optional[str]:
        async with websockets.connect(ws_url, open_timeout=10) as ws:
            await ws.send(json.dumps({"type": "init", "mbti": "INTP"}))
            await ws.send(json.dumps({"type": "message", "text": "안녕! 짧게 인사해줘."}))
            full_text = ""
            for _ in range(200):
                raw = await asyncio.wait_for(ws.recv(), timeout=20)
                data = json.loads(raw)
                if "error" in data:
                    raise RuntimeError(data["error"])
                if data.get("text"):
                    full_text += data["text"]
                if data.get("done"):
                    return full_text
            return full_text or None

    try:
        transcript = asyncio.run(run())
        check("Live WS 연결 & 텍스트 트랜스크립트 수신", bool(transcript), f"transcript={transcript!r}")
    except Exception as e:
        msg = str(e)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
            skip("Live WS 왕복 테스트", f"Gemini API 쿼터 초과로 스킵: {msg[:120]}")
        else:
            check("Live WS 연결 & 텍스트 트랜스크립트 수신", False, msg[:200])


# ────────────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="LuckyYum 전체 기능 검증 스크립트")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="백엔드 base URL")
    parser.add_argument("--skip-live", action="store_true", help="Gemini Live WS 테스트 건너뛰기 (쿼터 절약)")
    args = parser.parse_args()

    print(f"LuckyYum 전체 기능 검증 시작 (base_url={args.base_url})")

    test_care_and_evolution()
    test_dialogue_and_mbti()
    test_reset_on_reincarnation()
    test_checkin_lines()
    test_dialogues_json()
    test_backend_http(args.base_url)
    test_live_ws(args.base_url, args.skip_live)

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    skipped = sum(1 for r in results if r["status"] == "SKIP")

    print(f"\n{'=' * 50}")
    print(f"결과: {passed} PASS / {failed} FAIL / {skipped} SKIP (총 {len(results)}개)")
    if failed:
        print("\n실패 항목:")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  - {r['name']}: {r['detail']}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
