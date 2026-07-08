# LuckyYum — 펫 대화 & MBTI 성격 형성 시스템 To-Do List

> 출처: [implementation_plan.md](file:///home/geehong/.gemini/antigravity-ide/brain/73b4ccde-621e-467b-b73f-6674cc0513c6/implementation_plan.md) (최종본 v3)
> **범례**: [x] = 코드 작성 완료 + 가능한 방식으로 실측 검증(tsc/eslint/실제 API·WS 호출) 완료 · [x]⚠ = 코드 작성은 완료했지만 이 환경(Android SDK/에뮬레이터/기기 없음)에서는 실행 검증이 불가능해 미검증 상태

## 0. 착수 전 결정 필요 (User Review Required) — 전부 해결됨
- [x] Gemini Live 모델 ID 확정 — `.env`의 실제 키로 ListModels/세션 연결까지 실측. `gemini-2.5-flash-native-audio-latest`는 `response_modalities=["TEXT"]`를 지원하지 않는 걸 API 에러로 직접 확인. 대신 `response_modalities=["AUDIO"] + output_audio_transcription`으로 텍스트 트랜스크립트를 받는 방식으로 전환해 실제 한국어 응답까지 확인함.
- [x] "아픈데는 없어?" health 스탯 — 신설하지 않고 `fullness`+`cleanliness`+`isDead` 조합의 "컨디션" 문구로 대체 (v1 스코프대로 구현).
- [x] 레벨업/게임 시스템 — 이번 스코프에서 완전히 제외, 손대지 않음.

---

## 1. 상태 관리 기반 — 완료 (tsc/eslint 통과)
#### [userStore.ts](file:///home/geehong/LuckyYum/app/src/store/userStore.ts)
- [x] `mbtiScores`/`finalizedMbti`/`dailyDialogueUsage`/`petCount` 상태 추가
- [x] `answerDialogue(traits)` 액션 (날짜 리셋 + 1시간 쿨타임 + 일일 5회 제한)
- [x] `pet()` 액션 (intimacy +5, 무한클릭 방지)
- [x] `hatchEgg`/`gachaEgg`/`resetPet`에 신규 필드 리셋 추가
- [x] 성체 전환 시 `finalizedMbti` 고정(Locking)

#### [mbtiCalculator.ts](file:///home/geehong/LuckyYum/app/src/utils/mbtiCalculator.ts)
- [x] `finalizedMbti` 우선 반환, 없으면 `mbtiScores` + 케어 카운트 타이브레이커로 계산

---

## 2. 유년기 대화 — MBTI 판별 — 완료 (실제 생성까지 확인)
#### [generate_mbti_dialogues.py](file:///home/geehong/LuckyYum/backend/scripts/generate_mbti_dialogues.py)
- [x] 프롬프트 작성 + **실제 Gemini API로 실행해 16/16 상황 생성 성공**, `app/src/data/dialogues.json`에 저장됨

#### [PetDialogue.tsx](file:///home/geehong/LuckyYum/app/src/components/PetDialogue.tsx)
- [x] 질문/3지선다 모달 UI + `answerDialogue()` 연동, 쿨타임/일일한도 UI 반영

#### [App.tsx](file:///home/geehong/LuckyYum/app/App.tsx)
- [x] '대화하기 💬' / '쓰다듬기 🤗' 버튼 추가

---

## 3. 오버레이 제스처 재설계 (네이티브, Kotlin) — 코드 작성 완료, 기기 미검증 ⚠
> 이 환경에 Android SDK/adb/에뮬레이터가 전혀 없어 컴파일·실기기 테스트가 불가능합니다. 기존 파일 패턴을 그대로 따라 작성했고 수동으로 문법을 재검토했지만, **실제 빌드/제스처 동작은 아직 한 번도 검증되지 않았습니다.**

#### [OverlayService.kt](file:///home/geehong/LuckyYum/app/android/app/src/main/java/com/app/OverlayService.kt)
- [x]⚠ 제스처 판정(ACTION_DOWN 타임스탬프·좌표 기록) 작성
- [x]⚠ 쓰다듬기(스와이프, 펫 크기 범위 이내): `intimacy` +5, `petCount` +1, 원위치 스냅 — 단, 하트 파티클 애니메이션은 TODO로 남겨둠(미구현)
- [x]⚠ 드래그(이동): 기존 로직 유지
- [x]⚠ 롱프레스(2초): `Handler.postDelayed` 타이머, 이동/UP 시 취소
- [x]⚠ 스팸 검사: `dailyDialogueUsage` 확인 후 초과 시 메뉴 대신 `Toast`로 "..." 표시 (말풍선 대신 Toast로 단순화)

#### `overlay_menu.xml` + 메뉴 로직
- [x]⚠ 2버튼 팝업("💬 말걸기" / "📊 상태보기") 레이아웃 + `Intent(MainActivity, overlay_route=...)` 호출 + 3초 자동 dismiss

#### [MainActivity.kt](file:///home/geehong/LuckyYum/app/android/app/src/main/java/com/app/MainActivity.kt) / [OverlayModule.kt](file:///home/geehong/LuckyYum/app/android/app/src/main/java/com/app/OverlayModule.kt)
- [x]⚠ `onNewIntent` + `companion object pendingOverlayRoute` 로 라우트 보관
- [x]⚠ `OverlayModule.getInitialRoute()` RN 브릿지 메서드로 1회성 소비 방식 구현

---

## 4. 말걸기 서브메뉴 & 라우팅 — 완료 (tsc/eslint 통과)
#### [TalkMenuScreen.tsx](file:///home/geehong/LuckyYum/app/src/components/TalkMenuScreen.tsx)
- [x] `petStage` 기준으로 유년기(성향 대화/안부 묻기) vs 성체(일상대화/안부 묻기) 라벨 분기

#### [App.tsx](file:///home/geehong/LuckyYum/app/App.tsx)
- [x] 오버레이 intent extra는 `OverlayModuleSafe.getInitialRoute()`로 읽어 `talk`이면 `TalkMenuScreen` 오픈 (계획의 `overlayEntry` state 대신 `isTalkMenuVisible`/`activeDialogueScreen` 두 state로 구현 — 기능은 동일)
- [x] `TalkMenuScreen` → `petStage` 분기 → `PetDialogue`/`LiveTalkScreen`/`CheckInScreen` 라우팅

---

## 5. 성체 자유 대화 — Gemini Live — 완료 (실제 WS 릴레이까지 실측)
#### [adultFallbackLines.ts](file:///home/geehong/LuckyYum/app/src/data/adultFallbackLines.ts)
- [x] MBTI 16종 로컬 폴백 문구 하드코딩

#### [live.py](file:///home/geehong/LuckyYum/backend/app/routers/live.py)
- [x] `/ws/live-talk` 웹소켓 엔드포인트 작성 + `main.py` 라우터 등록
- [x] **실제 backend 컨테이너에 배포하고 재시작 후, Python WS 클라이언트로 end-to-end 테스트 통과** — INTP 페르소나 시스템 프롬프트 주입 → "안녕. 편안해. 너는?" 같은 실제 한국어 응답을 스트리밍으로 수신 확인
- [x] (설계 변경) `response_modalities=["TEXT"]`는 이 모델에서 미지원임을 실측으로 확인 → `AUDIO` + `output_audio_transcription`으로 텍스트만 추출해 전달하는 방식으로 구현

#### [LiveTalkScreen.tsx](file:///home/geehong/LuckyYum/app/src/components/LiveTalkScreen.tsx)
- [x] 텍스트 입력창 + 대화 스크롤 UI, `live.py` 프로토콜(`{text}`/`{done}`/`{error}`)에 맞춰 스트리밍 누적 구현
- [x] 마이크 버튼은 자리만 배치(비활성) — 실제 캡처/재생 로직은 범위 밖으로 명시
- [x] 5초 연결 타임아웃/에러 시 에러 노출 없이 `adultFallbackLines.ts`로 조용히 전환

---

## 6. 안부 묻기 (Check-in) — 완료 (tsc/eslint 통과)
#### [CheckInScreen.tsx](file:///home/geehong/LuckyYum/app/src/components/CheckInScreen.tsx)
- [x] 질문 3종 버튼 UI, `fullness`/`cleanliness`/`isDead` 조합으로 순수 조회형 대사 분기 (스탯 자체는 변경 없음)

---

## 7. 검증 (Verification)
- [x] `generate_mbti_dialogues.py` 실제 실행 → `dialogues.json` 16개 정상 생성 확인
- [x] 전체 RN 앱 `npx tsc --noEmit` 통과 (남은 에러 1건은 손대지 않은 기존 테스트 파일의 깨진 import, 무관)
- [x] 전체 RN 앱 `npx eslint` 통과 (남은 이슈는 전부 이번에 손대지 않은 기존 코드 라인)
- [x] `live.py`를 실제 백엔드에 배포 + 재시작 후 실제 Gemini Live 세션 end-to-end 검증
- [x] **[verify_all_features.py](file:///home/geehong/LuckyYum/backend/scripts/verify_all_features.py) 작성 — `userStore.ts`/`mbtiCalculator.ts`/`CheckInScreen.tsx` 로직을 Python으로 이식해 실제 실행 가능한 회귀 테스트로 만듦. 케어/진화, 대화 스팸방지(쿨타임·일일한도), MBTI 확정 후 불변성, 환생 리셋, 안부묻기 대사 분기, dialogues.json 스키마, 백엔드 헬스체크, Gemini Live WS까지 **31개 항목 전부 실제 실행하여 PASS 확인**
- [x] 쿨타임/일일 제한 — `verify_all_features.py`의 Python 시뮬레이션으로 1시간 쿨타임·일일 5회 상한 로직을 실제 실행해 확인 (RN 런타임 자체의 자정 리셋은 여전히 미검증, 로직은 검증됨)
- [x] `hatchEgg` 시 대화 상태 초기화 — 시뮬레이션으로 실제 확인
- [x] Adult 전환 시 `finalizedMbti` 확정 및 이후 불변성 — 시뮬레이션으로 실제 확인
- [x] **Gemini Live 실제 운영 도메인(`luckyyum.firemarkets.net`) 연동 — 최초엔 HTTP 404로 실패했으나, 원인이 Nginx Proxy Manager의 `luckyyum.firemarkets.net` 프록시 호스트에 WebSocket 업그레이드 헤더가 누락된 것으로 밝혀짐. "Websockets Support" 토글 저장 후 conf 파일 재생성 확인, 이후 재검증하여 정상 동작 확인.**
- [ ] [tester.html](file:///home/geehong/LuckyYum/backend/app/pages/tester.html)에 이번에 추가된 기능(말걸기 서브메뉴/안부묻기/Live)은 반영 안 함 — 기존 MBTI 시뮬레이션만 있는 상태로 남아있음
- [ ] **실기기 스와이프/드래그/롱프레스 제스처 구분 — 에뮬레이터/기기가 전혀 없어 검증 불가능. 코드 작성만 완료.**
- [ ] **롱프레스 메뉴 선택 시 앱 포그라운드 진입 — 위와 동일한 이유로 검증 불가.**
- [ ] Live 연결 실패 시 로컬 폴백 — 코드 로직(5초 타임아웃)은 작성했으나, RN 런타임에서 강제 실패를 재현하는 실행 검증은 불가
- [ ] `TalkMenuScreen`/`CheckInScreen` 실제 화면 렌더링 — tsc/eslint 및 로직 시뮬레이션까지만 확인, 실기기/에뮬레이터에서의 시각적 확인은 불가

---

## 보류 — 별도 계획으로 분리 예정
- [ ] 프린세스 메이커류 레벨업/스탯 성장 게임 시스템 (경험치, 등급, 신규 스탯 등) — 별도 계획 문서에서 설계 시작
