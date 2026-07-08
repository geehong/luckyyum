import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

# Project root path resolution
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "app" / "src" / "data"
OUTPUT_FILE = OUTPUT_DIR / "dialogues.json"

# Load environment variables
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("GOOGLE_API_KEY is not set in .env")

client = genai.Client(api_key=api_key)


# Pydantic schema for structured output
class DialogueChoice(BaseModel):
    text: str
    trait: str  # one of E, I, S, N, T, F, J, P


class DialogueResponse(BaseModel):
    situation: str
    choices: list[DialogueChoice]


VALID_TRAITS = {"E", "I", "S", "N", "T", "F", "J", "P"}

# 유년기(Baby/Teen) MBTI 판별용 상황 테마. 성체용 대사는 생성하지 않음 —
# 성체 대화는 런타임에 Gemini Live로 대체 (계획 문서 참고).
SITUATION_THEMES = [
    "주인님이 오랫동안 놀아주지 않아서 심심할 때",
    "낯선 장난감이나 물건을 처음 발견했을 때",
    "친구 펫이 실수로 내 밥을 먹었을 때",
    "주인님이 오늘 하루 계획을 물어봤을 때",
    "처음 보는 다른 동물을 만났을 때",
    "갑자기 비가 쏟아지기 시작했을 때",
    "주인님이 며칠 집을 비운다고 했을 때",
    "숨겨진 간식을 발견했을 때",
    "다른 펫과 장난감을 두고 다퉜을 때",
    "새로운 곳으로 산책을 나갔을 때",
    "주인님이 슬퍼 보일 때",
    "예상치 못한 큰 소리를 들었을 때",
    "혼자 있는 시간이 길어질 때",
    "처음 해보는 놀이를 제안받았을 때",
    "정해진 일과가 갑자기 바뀌었을 때",
    "주인님이 칭찬해줬을 때",
]

MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-3-flash-preview",
]


def generate_dialogues():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    results = []
    existing_ids = set()

    # 1. Load existing data to prevent duplicates (idempotent, generate_fortunes.py 패턴과 동일)
    if OUTPUT_FILE.exists():
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                results = json.load(f)
                for item in results:
                    if "id" in item:
                        existing_ids.add(item["id"])
            print(f"Loaded {len(existing_ids)} existing dialogues.")
        except json.JSONDecodeError:
            print("Existing JSON is invalid. Starting fresh.")

    count = 0

    for idx, theme in enumerate(SITUATION_THEMES, start=1):
        d_id = f"baby-situation-{idx:02d}"
        if d_id in existing_ids:
            continue  # Skip already generated

        prompt = (
            "사주 명리학 기반의 펫 다마고치 앱에 들어갈, 유년기 펫의 MBTI 성향 판별용 대화를 작성해주세요.\n"
            f"- 상황: {theme}\n"
            "지침:\n"
            "1. situation은 펫이 주인에게 건네는 1~2문장의 귀여운 대사로 작성할 것 (질문형으로 끝날 것).\n"
            "2. choices는 정확히 3개, 서로 다른 반응/선택지를 제공할 것.\n"
            "3. 각 choice의 text는 펫의 반응을 1문장으로 서술할 것 (예: '밖으로 나가서 친구를 찾아본다').\n"
            "4. 각 choice의 trait는 그 반응이 드러내는 성향 하나를 다음 8개 중에서 정확히 골라 표기할 것: "
            "E(외향), I(내향), S(감각), N(직관), T(사고), F(감정), J(판단), P(인식).\n"
            "5. 3개의 choice는 서로 다른 trait를 가져야 하며, 같은 축(예: E/I)이 아니어도 됨."
        )

        print(f"Generating: {d_id} ...")

        success = False
        while not success and MODELS:
            current_model = MODELS[0]
            try:
                response = client.models.generate_content(
                    model=current_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=DialogueResponse,
                        temperature=0.8,
                    ),
                )

                data = json.loads(response.text)
                choices = data.get("choices", [])

                if len(choices) != 3 or any(c.get("trait") not in VALID_TRAITS for c in choices):
                    raise ValueError(f"Invalid choices payload: {choices}")

                new_item = {
                    "id": d_id,
                    "situation": data.get("situation", ""),
                    "choices": choices,
                }
                results.append(new_item)
                existing_ids.add(d_id)
                count += 1

                # Save immediately after each successful generation to prevent data loss
                with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)

                # Sleep 4.5 seconds to stay under 15 RPM limit
                time.sleep(4.5)
                success = True

            except Exception as e:
                err_msg = str(e)
                print(f"Error generating {d_id} with {current_model}: {err_msg}")
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
                    if "GenerateRequestsPerMinute" in err_msg or "retry in" in err_msg:
                        print(f"[!] Hit RPM limit for {current_model}. Waiting 10 seconds before retrying...")
                        time.sleep(10)
                    else:
                        print(f"[!] Hit Daily/Total Quota for {current_model}. Switching to next model...")
                        MODELS.pop(0)
                        if not MODELS:
                            print("All models exhausted! Stopping.")
                            return
                        time.sleep(2)
                else:
                    print(f"[!] Error for {current_model}. Retrying after 10 seconds...")
                    time.sleep(10)

    if count == 0:
        print("\nAll dialogues are already generated!")
    else:
        print(f"\nDone! Generated {count} NEW dialogues in {OUTPUT_FILE}")


if __name__ == "__main__":
    generate_dialogues()
