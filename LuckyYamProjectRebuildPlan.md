# LuckyYum — 진화 분기(Evolution Branching) 시스템 도입 계획

## 📌 전체 흐름 요약 (여기만 봐도 감 잡히게)

**한 줄 요약**: 케어 액션 4개가 스탯 8개를 바꾸고 → 스탯은 시간이 지나면 자동으로 깎이면서 병을 만들기도 하고 → 정해진 시점(체크포인트)마다 그동안의 돌봄 품질을 종합해서 "외형/성격/생사"를 확정한다.

### 1) 스탯 변수 — petStore에 들어갈 것들

| 변수 | 뜻 | 뭘 하면 오르나 | 가만두면(시간경과) |
|---|---|---|---|
| `physical_fullness` | 포만감 (기존) | `feed()` | −5/h |
| `spirit_intimacy` | 유대감·장기 (기존) | `feed`/`play`/`pet` 소폭 + **대화하기(성향대화/일상대화) 소폭** 🆕 | −2/h |
| `spirit_happiness` 🆕 | 기분 — **저장은 되지만 액션이 직접 못 건드리는 반(半)파생값** | 없음(직접 조작 불가) — 매 체크 시점마다 `physical_fullness`/`physical_cleanliness`/`spirit_intimacy`/`physical_health`/`physical_weight정상여부` 기반 목표치 쪽으로 EMA로 서서히 수렴(`h=h*0.7+target*0.3`) | 자체 선형 decay는 없지만, 입력 스탯들이 나빠지면 목표치가 낮아져서 서서히 같이 떨어짐(즉시 X, 관성 있음) |
| `physical_cleanliness` | 청결도 (기존, "펫 몸 자체가 깨끗한가") | `bathe()` 🆕(목욕시키기) | −3/h (응가 방치 시 −6/h), **`play()`(산책/놀이) 시 추가로 −10** 🆕 |
| `physical_weight` 🆕 | 체중 | `feed()`+ / `play()`− | 자연감소 없음 |
| `env_poopCount` 🆕 | 응가 개수("집 안 환경") | `feed()` 시 확률 발생 | `clean()`(청소하기)으로만 0 — `bathe()`와는 별개 |
| `physical_health` 🆕 | 건강 상태(`'healthy'\|'sick'`, 기존 `isSick` boolean에서 이름·타입 변경) | `applyDegradation()`이 확률로 `'sick'` 판정 | `giveMedicine()`으로만 `'healthy'` 복귀 |
| `physical_evolutionGrade` 🆕 | 확정된 외형 등급(poor/normal/good) | 체크포인트마다 `computeCareQualityIndex()`(아래 표 참고, 저장 안 되는 즉석 계산)로 산출 | teen→adult 이후 고정(락) |
| `spirit_finalizedMbti` | 확정 성격 (기존) | 대화 선택 누적(`spirit_mbtiScores`) | 성체 전환 시 고정(락) |
| `spirit_playCount` 🆕 | 놀이 총량(참고용 파생 집계) — 산책/쓰다듬기/장난감을 하나로 통합 | `play()`/`pet()`/(추후)장난감 액션 호출마다 +1 | 감소 없음, 계속 누적 (기존 `playCount`+`petCount` 통합) |
| `spirit_activeQuest` 🆕 | 펫이 지금 요청 중인 것(9번) | 스탯 임계값 + 확률 굴림으로 자동 스폰 | `QUEST_EXPIRY_HOURS` 지나면 보상 없이 `null`로 소멸 |

### 2) 함수(액션) — 누가 직접 누르고, 누가 자동인지

| 함수 | 유저가 누르는 버튼인가 | 결과적으로 뭘 바꾸나 |
|---|---|---|
| `feed()` / `play()` / `clean()` / `pet()` | ✅ 기존 버튼 | 위 스탯 즉시 증감 + `spirit_mealLog`/`spirit_lastPlayTime`/`env_lastCleanTime` 등 원재료 기록 (`play()`는 이제 `physical_cleanliness`도 깎음, `play()`/`pet()`는 공통으로 `spirit_playCount`도 +1) |
| `bathe()` 🆕 (목욕시키기) | ✅ 신규 버튼 | `physical_cleanliness=100` — `clean()`(응가 치우기)과 분리된 별도 액션 |
| `answerDialogue()` | ✅ 기존 버튼(대화하기) | `spirit_mbtiScores` + **`spirit_intimacy` 소폭** 🆕 |
| `giveMedicine()` 🆕 | ✅ 신규 버튼 (아플 때만) | `physical_health`, `physical_medicineDoses` |
| `vaccinate()` 🆕 | ✅ 신규 버튼 (상시, 7일 쿨다운) | `physical_vaccinatedUntil` |
| `checkAging()` | ❌ 자동(시간 경과 체크 시) | `petStage` 전환 — **유일한 성장 판정 권한** (0번 작업 후) |
| `applyDegradation()` | ❌ 자동(오프라인 복귀·주기 체크) | 전체 스탯 decay + `physical_health` 확률 판정 + 사망 판정 |
| `evaluateEvolution()` 🆕 | ❌ 자동(`checkAging()` 체크포인트마다) | `physical_evolutionGrade` 갱신/확정 |
| `calculateMBTI()` | ❌ 자동(화면 표시할 때마다 계산) | MBTI 4글자 문자열 |
| `computeHappinessTarget()` 🆕 | ❌ 자동(`applyDegradation()`이 내부에서 호출) | 순간 목표치 산출 → 저장된 `spirit_happiness`를 그 쪽으로 EMA 완충 이동 |
| `spawnPetQuest()` 🆕 | ❌ 자동(`applyDegradation()` 틱마다 조건 체크) | 트리거 조건 + 확률 만족 시 `spirit_activeQuest` 세팅 (동시 1개 제한) |
| `computeCareQualityIndex()` 🆕 | ❌ 자동(`evaluateEvolution()`/`calculateMBTI()`가 호출할 때만) | **저장 안 함.** `spirit_mealLog`/`spirit_lastPlayTime`/`env_lastCleanTime` 등 원재료를 그 순간 평가해서 0~100 품질 지수를 반환 — 예전 "숨은 스탯"이었던 훈육도를 대체하는 순수 함수 |

### 3) 전체 파이프라인 (위 표를 화살표로 이으면)

```
[유저가 밥/놀이/청소/목욕/쓰담/대화 버튼을 누름]
        │
        ▼
저장 스탯 즉시 변화 (physical_fullness / spirit_intimacy / physical_cleanliness / physical_weight / env_poopCount)
        │  (동시에) 원재료만 기록 (spirit_mealLog / spirit_lastPlayTime / env_lastCleanTime 등) — 점수화는 안 함
        ▼
[시간이 흐름 — applyDegradation() 자동 실행]
        │
        ├─ 각 스탯 자동 decay
        ├─ computeHappinessTarget()으로 목표치 계산 → 저장된 spirit_happiness를 EMA로 서서히 수렴 (즉시 반영 X)
        ├─ poop/청결/체중/행복도를 종합해 physical_health='sick' 확률 판정
        ├─ spawnPetQuest(): 트리거 스탯 임계값 + 확률 굴림 → spirit_activeQuest 세팅 (펫이 먼저 요청)
        └─ physical_fullness=0 또는 physical_health='sick' 48h 지속 → 사망(memorial) 확정
        ▼
[성장 체크포인트 도달 (1/3/5/10/70일) — checkAging() 자동 실행]
        │
        ├─ petStage 전환 (egg→baby→junior→teen→adult→senior)
        └─ evaluateEvolution(): computeCareQualityIndex()로 그 구간 원재료를 즉석 평가 → physical_evolutionGrade 확정
        ▼
[teen→adult 전환 시점 — 이 순간 이후로는 아무리 돌봐도 안 바뀜 (락)]
        │
        ├─ physical_evolutionGrade → 종(species/외형) 확정
        └─ calculateMBTI() → MBTI(성격) 확정
        ▼
[화면에 보이는 최종 결과] = 외형(종+등급) + 성격(MBTI) + 생사여부 + 오늘의 운세(기존 사주 시스템, 이번 계획과 무관하게 그대로 유지)
```

아래 0~8번은 위 표/흐름을 만들기 위한 세부 구현 순서입니다.

---

원조 다마고치의 핵심 재미는 "같은 알에서 시작해도 돌봄 품질에 따라 다른 캐릭터로 자란다"는 분기 진화였습니다. 지금 LuckyYum은 종(fly/dragon/bear)이 **펫 이름 해시로 고정**되고, 돌봄 품질은 MBTI·운세에만 영향을 줄 뿐 "어떤 모습으로 자라는지"에는 전혀 반영되지 않습니다. 이 문서는 그 분기 진화 축을 추가하는 계획입니다.

## ⚙️ 글로벌 밸런스 변수 (매직넘버를 이름 붙은 상수로)

지금까지 문서 곳곳에 −5/h, 40~90, 24시간, 7일 같은 숫자가 흩어져 있었다. 여기서 한 번에 모아 이름을 붙인다. **값 자체는 전부 1차 추정치 — 실제 값은 플레이테스트로 튜닝하는 게 원칙이고, 여기 정리하는 목적은 "숫자를 어디서 고치면 되는지" 하나로 모으는 것.**

**수명 — 기대수명(하드 캡)과 건강수명(노화 시작점)을 분리:**
| 상수 | 값 | 의미 |
|---|---|---|
| `LIFESPAN_MAX_DAYS` | 90 | 하드 캡 — 도달 시 무조건 `memorial` 확정 (기존 90일 그대로) |
| `HEALTHSPAN_END_DAY` | 70 | "건강수명" 종료 시점 = senior 진입일 |
| `AGING_SICK_BONUS_PER_DAY` 🆕 | +0.5%p/일 | `HEALTHSPAN_END_DAY` 이후 하루 지날 때마다 8번(병) 발병 기본확률에 누적 가산 |

왜 나누냐면: 지금 `checkAging()`은 "90일 되면 무조건 죽는다"는 하드 캡 하나뿐이라 10일차와 89일차의 위험도가 똑같다. 70일(건강수명 종료)부터 서서히 발병확률을 올리면, 90일에 가까워질수록 "이제 위험한 나이"라는 게 체감된다 — 8번 섹션의 발병 확률식에 이 항목을 추가한다.

**스탯 스케일:**
| 상수 | 값 | 결정 이유 |
|---|---|---|
| `STAT_MIN` / `STAT_MAX` | 0 / 100 | **정수 0~100 유지 추천.** 0~10은 액션 한 번의 증감폭(±5~20)이 스케일 대비 너무 커서 "칸이 안 보이게 훅훅 뛰는" 문제가 생기고, 소수(0~1) 스케일은 반올림 표시 이슈만 늘고 실익이 없다. 이미 앱 UI가 "70/100" 표기에 익숙해진 것도 이유. |

**저점/고점(정상범위) 임계값:**
| 상수 | 값 |
|---|---|
| `FULLNESS_LOW` / `FULLNESS_HIGH` | 40 / 90 |
| `WEIGHT_LOW` / `WEIGHT_HIGH` | 40 / 60 |
| `CLEANLINESS_DIRTY` / `CLEANLINESS_OK` | 30 / 70 |
| `HAPPINESS_SICK_THRESHOLD` | 20 |

**식사(급여) — ⚠️ 기존 1번 섹션 수치를 여기 새 수치로 교체:**
| 상수 | 값 |
|---|---|
| `MEALS_PER_DAY_TARGET` | 3회 |
| `MEAL_AMOUNT_IDEAL` | 20 |
| `MEAL_AMOUNT_TOLERANCE` | ±10% (18~22) |

기존 1번 섹션엔 "하루 총량 90~110g"이라는, 예전 `tester.html`(3회 분할 100g 목표) 그대로 이식했던 숫자가 남아있었는데 방금 주신 20×3 기준과 안 맞는다. **이번에 주신 수치로 교체**하고, 하루 총량 목표는 `MEAL_AMOUNT_IDEAL × MEALS_PER_DAY_TARGET`(=60, 허용범위 54~66)로 자동 계산되게 바꾼다. 정확한 목표 총량이 다르면 알려달라.

**시간/쿨다운:**
| 상수 | 값 |
|---|---|
| `DIALOGUE_DAILY_CAP` | 5회 |
| `DIALOGUE_COOLDOWN_HOURS` | 1시간 |
| `MEDICINE_CURE_WINDOW_HOURS` | 24시간 |
| `MEDICINE_DOSES_REQUIRED` | 2회 |
| `VACCINE_COOLDOWN_DAYS` / `VACCINE_PROTECTION_DAYS` | 7일 / 7일 |
| `SICK_DEATH_THRESHOLD_HOURS` | 48시간 |
| `NEGLECT_WARNING_HOURS` 🆕 | 12시간(예시) — [앞선 비교분석](#8-병sickness--예방주사)에서 지적했던 "푸시 알림 부재" 갭을 메우기 위한 기준값. 이 시간 이상 무행동이면 위험 알림을 보낼 트리거 조건 (푸시 인프라 자체는 이 계획 범위 밖, 별도 작업) |

**감쇠율/확률:**
| 상수 | 값 |
|---|---|
| `DECAY_FULLNESS_PER_HOUR` | 5 |
| `DECAY_INTIMACY_PER_HOUR` | 2 |
| `DECAY_CLEANLINESS_PER_HOUR` | 3 (응가 방치 시 6) |
| `HAPPINESS_EMA_ALPHA` | 0.3 |
| `POOP_SPAWN_PROBABILITY_ON_FEED` | 40% |
| `POOP_NEGLECT_THRESHOLD_COUNT` | 3개 |
| `SICKNESS_BASE_PROBABILITY` | 5% |

**성장 체크포인트:**
| 상수 | 값 |
|---|---|
| `EVOLUTION_CHECKPOINT_DAYS` | `[1, 3, 5, 10, 70]` |

**신규 제안 — "언제 마지막으로 했는지" 시점 추적 필드:**
지금까지는 케어 전체를 뭉뚱그린 `lastCareTime` 하나만 있었다. "산책 방치시간", "청소 안 한 지 얼마나 됐는지"처럼 액션별로 따로 물으려면 액션별 타임스탬프가 필요하다 — 이건 판단(score)이 아니라 원재료(raw data)라 careQualityScore와 달리 별 문제 없이 필드로 둬도 된다:
| 필드 | 용도 |
|---|---|
| `spirit_lastPlayTime` 🆕 | 마지막 `play()`/`pet()` 시각 — 산책 방치시간 계산 기준 |
| `physical_lastBatheTime` 🆕 | 마지막 `bathe()` 시각 |
| `env_lastCleanTime` 🆕 | 마지막 `clean()` 시각 |
| `spirit_mealLog` 🆕 | 체크포인트 구간 내 급여 시각 기록(배열, 체크포인트마다 초기화) — 아래 1번 케어품질 판정의 원재료 |
| `spirit_questResponseLog` 🆕 | 9번(펫 퀘스트) 스폰~해결까지 걸린 시간 기록(배열) — 이것도 1번 케어품질 판정의 원재료로 재사용 |

## 0. 선행 작업 (필수) — 성장 판정 권한 일원화

현재 `petStore.ts`에 성장 단계를 바꾸는 로직이 **두 곳에 따로** 있습니다.
- `feed()` 내부: `physical_fullness` 임계값 기반 (`egg→baby`는 첫 밥주기, `baby→teen`은 physical_fullness>70, `teen→adult`는 physical_fullness>90)
- `checkAging()`: `physical_birthDate` 기준 **경과 일수** 기반 (`baby`=1일, `junior`=3일, `teen`=5일, `adult`=10일, `senior`=70일, `memorial`=90일)

두 시스템이 단계 구성 자체가 다르고(전자는 junior/senior가 없음) 기준도 달라서, 분기 진화의 "체크포인트"를 정의할 수 없는 상태입니다. 아래 작업을 먼저 끝내야 1번부터 진행 가능합니다.

*   `feed()`에서 `newStage` 계산 로직을 제거하고, physical_fullness/spirit_intimacy 갱신 + 성체 전환 시 MBTI 락 트리거만 남긴다.
*   `checkAging()`을 **유일한 단계 전환 권한**으로 삼는다 (이미 7단계 타임라인을 갖고 있어 체크포인트로 쓰기 적합).
*   `PetRenderer.tsx`는 `petStage`를 그대로 읽으므로 수정 불필요.

## 1. 케어 품질 지수 — 저장 필드 아님, `computeCareQualityIndex()` 순수 함수

> **변경 이력**: 처음엔 `spirit_careQualityScore`라는 "숨은 스탯" 필드로 설계했다가, "훈육도를 MBTI로 대체하라고 했는데 계속 별도 필드로 나온다"는 지적을 받았다. 문제는 로직(MBTI J/P 타이브레이커 + 분기진화 등급 입력)이 아니라 **MBTI와 나란히 놓인 별도의 "숨은 성격 스탯"처럼 보이게 저장했다는 점**이었다. 그래서 저장을 없애고 순수 계산 함수로 바꾼다.

*   `petStore`에 저장되는 필드는 없다. 대신 `computeCareQualityIndex(window)`가 **호출되는 그 순간에만** 아래 원재료를 평가해서 0~100 지수를 즉석 반환한다 (원재료는 위 "글로벌 밸런스 변수" 섹션에서 정의한 `spirit_mealLog`/`spirit_lastPlayTime`/`env_lastCleanTime`/`env_poopCount`/`physical_weight` 등):
    *   밥주기: `spirit_mealLog`를 봐서 하루 `MEALS_PER_DAY_TARGET`회, 매회 `MEAL_AMOUNT_IDEAL±MEAL_AMOUNT_TOLERANCE` 분배면 우수(+30), 총량만 맞으면 보통(+15), 벗어나면 0
    *   놀아주기: `spirit_playCount`가 정확히 3이면 우수(+20), 초과 시 소폭(+5), 부족 시 비례 지급
    *   청소: 오염도(=100−`physical_cleanliness`)가 `CLEANLINESS_OK` 이상일 때 청소하면 +10, `CLEANLINESS_DIRTY`~`CLEANLINESS_OK`면 +5, `CLEANLINESS_DIRTY` 미만인데 청소하면 페널티 −2
    *   체중: 체크포인트 시점 `physical_weight`가 `WEIGHT_LOW`~`WEIGHT_HIGH`(정상)면 보너스, 벗어나면 페널티 (6번과 연결)
    *   펫 퀘스트 응답: `spirit_questResponseLog`의 평균 응답시간이 빠를수록 보너스 (9번과 연결)
*   **호출 지점은 딱 둘뿐**이고 그때그때 새로 계산한다 — 아무 데도 결과를 들고 있지 않는다:
    1.  `evaluateEvolution()`이 성장 체크포인트마다 호출 → `physical_evolutionGrade` 산출 (2번)
    2.  `calculateMBTI()`가 J/P 타이브레이커 계산 시 호출 → `isJ = pick('J', 'P', computeCareQualityIndex(checkpointWindow) > 정상 임계값(예: 25) ? 'J' : 'P')`
*   MBTI의 1차 판단 기준은 여전히 대화(`spirit_mbtiScores`)이고, `computeCareQualityIndex()`는 **동점일 때만 개입하는 타이브레이커**라는 위치는 그대로다 (기존 E/I·S/N·T/F 타이브레이커 구조와 동일한 패턴). 달라진 건 "무엇을 저장하느냐"이지 "무엇을 타이브레이커로 쓰느냐"가 아니다.

## 2. 분기 체크포인트 & 등급 산정

*   0번에서 정리된 `checkAging()`의 단계 전환 시점(1일/3일/5일/10일/70일)마다 `evaluateEvolution()`을 호출한다.
*   직전 체크포인트 이후의 원재료(`spirit_mealLog` 등)를 `computeCareQualityIndex()`로 즉석 평가해서 3단계 등급을 매긴다: 15 미만 `poor`, 15~35 `normal`, 35 초과 `good` (1번의 채점 스케일 기준, 실제 플레이테스트로 미세조정).
*   등급은 `petStore`에 `physical_evolutionGrade: 'poor' | 'normal' | 'good'`로 저장하고, **체크포인트마다 최신값으로 갱신**한다. `teen→adult` 전환 시점의 값이 그 펫의 최종 확정 등급이 되며, 이후 케어에 영향받지 않는다 (MBTI가 성체 전환 시 락되는 것과 동일한 패턴). **저장되는 건 이 등급 결과값뿐이고, 계산 원리였던 `computeCareQualityIndex()` 자체는 저장되지 않는다.**

## 3. 분기 결과 → 비주얼 매핑 (스코프 2안, A 추천)

**Option A — MVP, 신규 아트 불필요 (추천):**
지금처럼 종(fly/dragon/bear) 자체는 유지하되, **결정 시점과 기준을 바꾼다.** 가챠 때 이름 해시로 정하는 대신, `teen→adult` 체크포인트의 `physical_evolutionGrade`가 종을 결정하도록 한다 (예: good→dragon 계열, normal→fly, poor→bear, 또는 매핑 테이블은 취향껏). 기존 3종 에셋(`pet_fly/dragon/bear_01.png`) 예산 안에서 "잘 돌보면 다른 결과로 자란다"는 원조의 핵심 경험을 코드만으로 재현할 수 있다.

**Option B — 풀 스코프, 신규 아트 필요:**
종(3) × 등급(3) = 9종의 성체 아트를 새로 제작한다. `content_factory/` 폴더가 이미 Gemini 기반 생성 파이프라인(`generate.py`)을 갖고 있어 이미지 생성으로 확장하는 경로도 있지만, 이는 별도 에셋 제작 프로젝트 규모다.

→ **1차는 Option A로 구현**하고, 반응을 보고 Option B로 확장하는 순서를 권장.

## 4. 백엔드/기록 연동

*   `PetRanking.pet_tier`는 현재 항상 `1`로 고정되어 사실상 안 쓰이는 컬럼이다 — 이걸 `physical_evolutionGrade`(1=poor, 2=normal, 3=good) 저장용으로 재활용한다. **신규 마이그레이션 불필요**, 의미만 부여하면 됨.
*   `memorials` 배열에도 `physical_evolutionGrade`를 추가해서 명예의 전당에 "어떤 등급으로 자랐는지" 표시한다.

## 5. 행복도(Happiness) — EMA(지수이동평균)로 완충되는 반(半)파생값

당초 "완전 파생값(매번 순간 스탯만으로 재계산)"으로 설계했으나, 이러면 **어제의 행복이 오늘로 전혀 이어지지 않는 문제**가 있다 (어제 90이었든 10이었든 오늘 계산값은 오늘 스탯에만 좌우됨 — 감정의 "관성/여운"이 없어짐). 그래서 **저장은 하되, 액션이 직접 증감시키지 않고 매 체크 시점마다 순간 목표치 쪽으로 서서히 수렴**시키는 절충안으로 변경한다.

*   `petStore`에 `spirit_happiness: number`(0~100, 기본 50) 필드를 다시 둔다. **단 `feed()`/`play()`/`pet()` 등 어떤 액션도 이 필드를 직접 증감시키지 않는다.**
*   `computeHappinessTarget(state)`가 아래를 종합해 "순간 목표치"(0~100)를 계산한다:
    *   `physical_fullness`가 정상범위(40~90)면 가점, 너무 낮거나(과식/방치) 너무 높으면 감점
    *   `physical_cleanliness`가 낮으면 감점 (지저분하면 기분 나쁨)
    *   `spirit_intimacy`가 높으면 가점 (유대감이 기분의 바탕이 됨)
    *   `physical_health==='sick'`면 큰 감점 (아프면 기분 나쁨)
    *   `physical_weight`가 40~60 정상범위를 벗어나면 감점
*   `applyDegradation()`이 호출될 때마다(=시간 경과 체크마다) 저장된 `spirit_happiness`를 목표치 쪽으로 완충 이동시킨다:
    ```
    spirit_happiness = spirit_happiness * 0.7 + computeHappinessTarget(state) * 0.3   // α=0.3은 예시, 플레이테스트로 튜닝
    ```
*   **이 설계의 의미**: 스냅샷처럼 즉시 뒤집히지 않고 "어제 잘 돌봤으면 오늘 하루 좀 방치해도 행복도가 서서히 떨어진다" / "학대하다 한 번 잘해준다고 바로 90이 되지 않는다"는 관성이 생긴다. 8번(병) 발병 확률도 이 완충된 값을 사용하므로, 확률도 순간 스탯에 요동치지 않고 완만한 추세로 움직인다.
*   완전 저장값(원래 첫 제안, 액션이 직접 +/− 하는 방식)과의 차이: 여전히 "무엇이 행복도를 바꾸는지"는 액션이 아니라 다른 스탯들의 상태이므로 "모든 스탯이 관여하는 핵심 스탯"이라는 원래 요구사항은 그대로 유지된다 — 다만 그 반영이 즉시가 아니라 완충되어 반영될 뿐이다.

**부수 결정 — 유대감(`spirit_intimacy`)에 대화하기 반영:**
*   `answerDialogue()`(성향대화/일상대화 공통)를 호출할 때마다 `spirit_intimacy` 소폭(+2) 증가를 추가한다. 지금은 `spirit_mbtiScores`만 갱신하고 유대감엔 전혀 영향이 없었음 — "대화를 하면 더 친해진다"는 직관을 반영.

**부수 결정 — 청결도(`physical_cleanliness`)를 "집 청소"와 "펫 목욕"으로 이원화:**
*   `env_poopCount`(7번)는 여전히 "집 안 환경"을 나타내고 `clean()`(청소하기)으로만 치운다.
*   `physical_cleanliness`는 이제 "펫 몸 자체가 깨끗한가"를 나타내며, **회복 수단이 `clean()`이 아니라 신규 액션 `bathe()`(목욕시키기)로 바뀐다.** `clean()`은 더 이상 `physical_cleanliness`를 직접 회복시키지 않는다.
*   `play()`(놀아주기/산책)가 `physical_cleanliness`를 −10 깎는다 — "놀고 나면 더러워져서 목욕이 필요하다"는 자연스러운 케어 루프(산책 → 목욕)를 만든다.
*   UI: `App.tsx`에 "목욕시키기 🛁" 버튼을 "청소하기 🧹"와 별도로 추가한다.

**부수 결정 — 산책/장난감/쓰다듬기를 "놀이" 파생 필드 하나로 통합(참고용):**
*   산책·장난감·쓰다듬기 각각을 별도 스탯 필드로 만들지 말지 고민이 있었는데, **각 액션은 지금처럼 자기 고유 효과(예: `play()`=산책은 `physical_cleanliness`−10, `pet()`=쓰다듬기는 `spirit_intimacy`+, 추후 장난감도 각자 다른 효과)를 그대로 유지**하고, 그와 별개로 **`spirit_playCount: number`(파생 저장값, 참고/집계용)** 필드 하나를 신설해서 `play()`/`pet()`/(추후 추가될 장난감 액션)이 호출될 때마다 공통으로 +1 한다.
*   즉 "무엇으로 놀아줬는지"는 각 액션의 개별 효과에 남고, "**얼마나 자주 놀아줬는지**"라는 뭉뚱그려진 숫자 하나만 `spirit_playCount`에 쌓인다 — 원래 코드의 `playCount`/`petCount`(액션별 카운터 2개)를 이걸로 통합하는 셈이다.
*   용도: 화면 표시(예: "총 놀아준 횟수"), 향후 MBTI E/I 판정이나 `computeCareQualityIndex()` 채점에 참고 입력으로 재사용 가능 — 지금 당장 다른 계산식을 바꾸진 않고 **데이터만 쌓아두는 참고용**으로 우선 추가한다.

**사망 조건은 건드리지 않는다** — `spirit_happiness`가 낮게 계산돼도 즉시 죽지는 않고, 8번(병) 시스템의 발병 확률 가산 요인으로만 연결한다 (사망 조건을 늘리면 밸런스 리스크가 커서 1차는 보수적으로 감).

## 6. 체중(Weight)

*   `petStore`에 `physical_weight: number`(0~100, 기본 50) 필드를 신설한다.
*   `feed()` 성공 시 +8, `play()` 성공 시 −4, 시간 경과로는 자연 감소 없음(원조도 체중은 운동으로만 빠짐). 0~100으로 clamp.
*   **분기 진화(2번)와 연결**: `evaluateEvolution()` 체크포인트 시점에 `physical_weight`가 `WEIGHT_LOW`~`WEIGHT_HIGH`(정상)면 `computeCareQualityIndex()` 결과에 보너스, 80 이상(과체중)·20 이하(저체중)면 페널티가 반영됨 — 원조의 "뚱뚱하면 나쁜 캐릭터로 진화"를 재현.
*   **8번(병)과 연결**: 과체중/저체중이면 발병 확률 가산.

## 7. 배변(Poop) 이벤트

지금 `physical_cleanliness`는 시간에 따라 서서히 깎이는 연속 게이지라, 원조의 "이산적으로 응가가 쌓이는" 메커니즘과는 다르다. 완전히 새로 만드는 서브시스템이라 4개 중 구현 비용이 가장 크다.

*   `petStore`에 `env_poopCount: number`(기본 0) 필드를 신설한다.
*   스폰 로직: 별도 타이머 없이, `feed()` 성공 시마다 확률적으로(예: 40%) `env_poopCount +1` — 원조에서도 밥을 먹으면 응가 확률이 오르는 것과 같은 패턴이라 기존 액션에 자연스럽게 얹을 수 있다.
*   `clean()`은 `env_poopCount=0`으로 치우는 기능만 담당한다 ("집 청소"). **`physical_cleanliness`(펫 몸 청결도) 자체는 더 이상 `clean()`이 회복시키지 않으며, 5번에서 정의한 `bathe()`(목욕시키기)가 전담한다** — 응가치우기와 목욕을 별도 버튼으로 분리하기로 했으므로.
*   `env_poopCount >= 3`(방치)이면: `physical_cleanliness` 시간당 감소 속도를 2배(−3/h → −6/h)로 가속하고, 8번(병) 발병 확률에 가산한다.
*   UI: `PetRenderer.tsx`에 응가 개수만큼 작은 아이콘을 펫 주변에 오버레이 표시 (신규 UI 요소, 에셋은 이모지 `💩`로 충분).

## 8. 병(Sickness) + 예방주사

4개 중 가장 규모가 크다 — 상태값, 신규 액션 2개, UI, 사망 조건 확장까지 걸쳐 있다.

*   `petStore`에 `physical_health: 'healthy' | 'sick'`(기본 `'healthy'`, 기존 `isSick: boolean` 대체 — 이름·타입 모두 변경), `physical_medicineDoses: number`(0~2), `physical_vaccinatedUntil: number | null`(예방접종 유효기한 타임스탬프) 필드를 신설한다.
*   **발병 판정**: `applyDegradation()` 호출 시마다(=시간 경과 체크마다) 확률 계산.
    *   `SICKNESS_BASE_PROBABILITY`(5%) + (`env_poopCount>=POOP_NEGLECT_THRESHOLD_COUNT` ? +10%p : 0) + (`physical_cleanliness<CLEANLINESS_DIRTY` ? +10%p : 0) + (`physical_weight>=80` 또는 `<=20` ? +5%p : 0) + (`spirit_happiness<HAPPINESS_SICK_THRESHOLD` ? +5%p : 0, 5번에서 EMA로 완충된 저장값 그대로 사용) + (나이가 `HEALTHSPAN_END_DAY` 초과 시 `AGING_SICK_BONUS_PER_DAY × (경과일수−HEALTHSPAN_END_DAY)`, 글로벌 변수 섹션의 "건강수명" 개념 반영 🆕) − (`physical_vaccinatedUntil`이 유효기간 내 ? −10%p : 0)
    *   계산된 확률로 `physical_health='sick'` 판정.
*   **아픈 상태의 효과**: 아픈 동안 `physical_fullness`/`physical_cleanliness`/`spirit_intimacy` 자연 감소 속도 1.5배(결과적으로 `spirit_happiness`의 EMA 목표치도 같이 낮아짐), `feed()`/`play()`의 회복량 절반만 적용.
*   **치료 액션 `giveMedicine()`(신규)**: 아플 때만 유효. 누를 때마다 `physical_medicineDoses +1`. 24시간 이내 2회 연속 투여해야 완치(`physical_health='healthy'`, `physical_medicineDoses=0`). 1회만 주고 24시간 지나면 `physical_medicineDoses`가 0으로 리셋(재발 위험 그대로 유지) — 원조의 "약 2번 연속 필요" 재현.
*   **예방접종 액션 `vaccinate()`(신규)**: 아플 때는 사용 불가. 7일 쿨다운, 사용 시 `physical_vaccinatedUntil = now + 7일`.
*   **사망 조건 확장**: `physical_health='sick'` 상태가 48시간 이상 지속되면 (기존 `physical_fullness===0` 조건과 별개로) `applyDegradation()`에서 강제로 `isDead=true, petStage='memorial'` 처리한다.
*   UI: `App.tsx`에 "약주기 💊"/"예방접종 💉" 버튼을 아픈 상태에서만(또는 예방접종은 상시) 노출. `PetRenderer.tsx`에 아픈 상태면 😷 오버레이 표시.
*   웹 리플리카(`backend/app/pages/tester.html`)는 이번 4개 시스템 추가 대상에서 **일단 제외** — 별도 후속 작업으로 앱과 재동기화한다 (지금 당장 같이 고치면 변경 범위가 너무 커진다).

## 9. 퀘스트 시스템 — "유저 퀘스트"(기존 액션 재분류) + "펫 퀘스트"(신규, 펫이 먼저 요청)

**유저 퀘스트 — 신규 구현 없음, 카테고리 정리만:**
| 카테고리 | 해당 액션 |
|---|---|
| 밥주기 | `feed()` |
| 청소 | `clean()`/`bathe()` |
| 건강 | `giveMedicine()`/`vaccinate()` |
| 놀아주기 | `play()`/`pet()`(+추후 장난감) |
| 대화 | `answerDialogue()` — **MBTI 결정용 "상황⇒보기 선택" 게임 시스템은 이미 `PetDialogue.tsx`+`app/src/data/dialogues.json`으로 구현돼 있음.** 프린세스 메이커류 질문-선택 구조 그대로라 신규 작업 불필요, "대화 퀘스트" 카테고리로 편입만 하면 된다.

**펫 퀘스트(신규) — 펫이 스탯에 따라 랜덤으로 유저에게 요청:**

> **설계 결정: 액션 버튼 무작위 강조가 아니라 퀘스트 DB 방식을 채택.** 이유 셋: (1) `dialogues.json`과 동일한 JSON 콘텐츠 뱅크 패턴을 그대로 재사용할 수 있어 신규 아키텍처가 필요 없음. (2) 버튼만 반짝이는 방식은 이미 보이는 스탯바(`Fullness: 20/100`)와 차별점이 없어 "펫이 말을 건다"는 체감이 약함. (3) 앞서 원조 다마고치와 비교했을 때 "실시간 관심 호출(콜) 메커니즘이 없다"고 짚었던 갭을 이 시스템이 정확히 메운다 — 만료 시 보상 없이 사라지게 하면 원조의 "삑삑 무시하면 손해" 긴장감이 재현된다.

*   **데이터**: `app/src/data/petQuests.json` (dialogues.json과 동일 구조) — 각 항목은 `{ id, trigger, text, resolveAction }`. 예: `{ "trigger": "physical_fullness", "text": "배고파요... 밥 주세요 🥺", "resolveAction": "feed" }`, `{ "trigger": "spirit_lastPlayTime", "text": "산책 가고 싶어요! 나가요 🐾", "resolveAction": "play" }`, `{ "trigger": "spirit_happiness", "text": "기분이 안좋아요... 같이 놀아줄래요? 😢", "resolveAction": "play" }` 등.
*   **상태 필드**: `petStore`에 `spirit_activeQuest: { questId, spawnedAt } | null` 신설.
*   **스폰 로직**: `applyDegradation()` 틱마다 트리거 스탯이 해당 임계값(`FULLNESS_LOW`, `spirit_lastPlayTime` 경과시간, `HAPPINESS_SICK_THRESHOLD` 등 기존 글로벌 변수 재사용)을 넘는지 확인 → 넘으면 `QUEST_SPAWN_PROBABILITY`(예: 30%) 확률로 조건에 맞는 퀘스트 하나를 `spirit_activeQuest`에 세팅. **이미 `spirit_activeQuest`가 있으면 새로 스폰하지 않음(동시에 1개만).**
*   **해결**: `resolveAction`에 해당하는 액션이 호출되면 자동 완료 → `spirit_activeQuest=null`, `spirit_intimacy`에 소폭 보너스 지급.
*   **만료**: `QUEST_EXPIRY_HOURS`(예: 6시간) 안에 안 풀리면 보상 없이 그냥 사라짐 — 페널티는 1차로 넣지 않는다(보수적 접근, 8번의 사망조건 확장과 같은 원칙).
*   **`computeCareQualityIndex()`와 연결**: 퀘스트 스폰~해결 사이 걸린 시간을 `spirit_questResponseLog`(원재료, 저장은 하되 점수화는 1번 섹션의 순수 함수가 담당)에 기록해서, 응답 속도가 빠를수록 케어 품질 지수에 가점 — "말 걸었을 때 바로 반응했는지"라는, 지금까지 없던 신호가 추가된다.
*   UI: `App.tsx`(또는 `PetRenderer.tsx` 근처)에 말풍선 형태로 `spirit_activeQuest.text` 표시. 탭하면 해당 액션 화면/버튼으로 바로 이동(선택).

**글로벌 변수 추가:**
| 상수 | 값 |
|---|---|
| `QUEST_SPAWN_PROBABILITY` 🆕 | 30% |
| `QUEST_EXPIRY_HOURS` 🆕 | 6시간 |

## 10. 운세 ↔ 스탯 단방향 강화 + MBTI → 행동 확장

`app/src/utils/fortuneLogic.ts`는 이 계획 전체를 진행하는 동안 **한 번도 손을 안 댄 파일**이다. 실제 코드를 확인해보니 두 가지가 요청과 어긋나 있었다.

**문제 1 — 운세는 "잘 돌보면 방어"만 있고 "못 돌보면 페널티"가 없다:**
```ts
// 현재 fortuneLogic.ts:45-46 — 편도(one-way) 바닥 방어만 존재
if (fullness > 70 && intimacy > 60) {
  currentTier = Math.max(currentTier, 3);
}
```
게다가 이 계획에서 새로 만든 `spirit_happiness`(fullness/cleanliness/intimacy/health/weight를 다 종합한 EMA 지표)를 안 쓰고 옛 `fullness`/`intimacy`를 그대로 참조하고 있다.

*   `calculateFortuneTier`의 입력을 `fullness`/`intimacy` → **`spirit_happiness`**로 교체한다 (이미 여러 스탯을 종합한 값이라 운세 판정에 가장 적합).
*   양방향으로 확장:
    *   `spirit_happiness >= 70` → `currentTier = Math.max(currentTier, 4)` (좋은 케어 → 좋은 운세, 기존 "최소 3 보장"에서 상향)
    *   `spirit_happiness <= 30` → `currentTier = Math.min(currentTier, 2)` 🆕 (나쁜 케어 → 나쁜 운세, **지금까지 없던 페널티 방향**)
    *   30~70 구간은 `baseSajuTier` 그대로 (중립).
*   `feed()` 안의 기존 "오탭 구제"(`dailyFortuneLock.isRescued`) 로직은 건드리지 않는다 — 별개의 "첫 실수 구제" 장치로 그대로 둔다.
*   **불변 조건 유지**: `calculateFortuneTier`는 여전히 순수 함수로, 어떤 스탯도 다시 쓰지 않는다 (운세→스탯 역방향 금지, 기존 설계 그대로).

**문제 2 — MBTI는 "말투"만 있고 "행동"이 없다:**
`adultFallbackLines.ts`(16개 대사)와 `live.py`의 `"답변은 {mbti} 성격에 맞는 말투로"` 지시로 **말투는 이미 구현돼 있음**(확인 완료, 신규 작업 아님). 그런데 텍스트 톤 외에 MBTI가 실제 게임 동작을 바꾸는 코드는 없다.

*   9번(펫 퀘스트)의 `QUEST_SPAWN_PROBABILITY`에 E/I 가중치를 추가한다: E형은 `QUEST_SPAWN_PROBABILITY × 1.5`(자주 말 걺), I형은 `× 0.7`(덜 보챔) — 첫 번째 "말투 아닌 행동" 차이.
*   `petQuests.json`의 각 항목에 선택적 `mbtiAffinity: string[]` 태그를 추가하고, 스폰 시 확정된 `finalizedMbti`와 일치하는 항목을 우선 선택한다 — 같은 "배고파요" 상황도 성격에 따라 다른 대사가 나오게(예: E형은 "같이 나가서 먹을 거 찾아요!", I형은 "그냥 저 여기서 조용히 기다릴게요").
*   **운세는 여전히 이 확장에서 제외** — MBTI가 행동에 영향을 주는 건 맞지만, 운세 계산식(`calculateFortuneTier`)엔 MBTI를 입력으로 추가하지 않는다 (요청하신 "운세에는 영향 안 줌" 유지).

**참고 — 서버 프롬프트의 느슨한 결합**: `live.py build_persona`가 `mbti`와 `fortuneTier`를 같은 프롬프트 문자열에 "오늘 운세는 N점입니다"처럼 나란히 주입하는데, 이건 코드가 둘을 계산적으로 엮는 게 아니라 **LLM이 문맥상 알아서 톤을 맞출 수도 있는 정도의 느슨한 결합**이다. 결정적 로직은 아니지만, 엄격하게 분리를 원하시면 프롬프트에서 `fortuneTier` 문구를 빼는 것도 고려할 수 있다 (지금은 유지 — 언급만 해둠).

## 11. 액션 재설계 — 무한 클릭 방지 + 밥주기 미니게임화 + 퀘스트 전용 액션

실제로 눌러보니 모든 케어 액션이 상시 버튼이라 연타하면 즉시 만땅까지 채워지는 문제가 있었다. 원조 다마고치는 쿨다운이 없는 대신 "만빵이어도 계속 누르면 체중만 계속 오른다"는 자연스러운 대가로 스팸을 억제했는데, 그 방식 대신 이번엔 **밥주기는 미니게임화, 나머지 케어 액션은 퀘스트로만 접근 가능하게** 만들어 구조적으로 스팸을 차단한다.

**밥주기 — 시간대 슬롯 + 가챠 추측:**
*   하루를 `MEAL_SLOTS`(아침 05~11시/점심 11~17시/저녁 17~23시) 3구간으로 나눈다. 슬롯 밖(23시~05시)엔 밥주기 자체가 비활성.
*   `petStore`에 `spirit_mealGacha: { slot, optimalAmount, choices: number[] } | null` 신설. 밥주기 버튼을 누르면(이미 그 슬롯에 급여했으면 버튼 자체가 비활성):
    1.  그 순간 `optimalAmount`(숨겨진 "오늘 이 끼니의 최적 급여량")를 `MEAL_OPTIMAL_MIN`~`MEAL_OPTIMAL_MAX` 범위에서 랜덤으로 굴린다.
    2.  `MEAL_GACHA_CHOICE_COUNT`(3)개의 랜덤 급여량 선택지를 보여준다("가챠" 연출).
    3.  유저가 하나를 고르면 `optimalAmount`와의 차이로 채점: 근접할수록 `physical_fullness` 상승폭이 크고 `spirit_mealLog`에도 `{time, amount, optimalAmount}`로 기록된다 — 1번 섹션 `computeCareQualityIndex()`의 밥주기 채점을 "하루 총량 범위 체크"에서 "끼니별 정확도 체크"로 교체.
    4.  같은 슬롯은 하루 1번만 — 별도 쿨다운 타이머 없이 **슬롯 자체가 자연스러운 하루 3회 상한**이 된다("밥을 주었으면 클릭버튼 선택 안 되게").
*   **체중은 이제 급여 정확도에 연동**: 근접(`MEAL_SCORE_BEST_DIFF` 이내)이면 체중 변화 없음, 적당히 벗어나면(`MEAL_SCORE_OK_DIFF` 이내) 과다=`+`/부족=`-` 소폭, 많이 벗어나면 크게 — 6번 섹션에서 미뤄뒀던 "폭식→과체중" 원조 로직이 이 형태로 들어온다.
*   알 상태에서 "부화시키기" 버튼은 기존대로 단순 1탭 처리(가챠 없음) — 부화 자체는 끼니 개념이 아직 없는 1회성 이벤트라 그대로 둔다.

**청소/목욕/예방접종/놀아주기/쓰다듬기 — 상시 버튼 제거, 펫 퀘스트로만 접근:**
*   `App.tsx`/웹 데모에서 이 5개 액션의 상시 버튼을 없앤다. 오직 9번(펫 퀘스트) 배너를 탭해서 해당 `resolveAction`을 수행하는 경로로만 실행 가능.
*   **UI만 숨기는 게 아니라 스토어 레벨에서 차단**: `play()`/`pet()`/`clean()`/`bathe()`/`vaccinate()` 각각 맨 앞에 `if (state.spirit_activeQuest?.questId가 이 액션을 resolveAction으로 갖는 퀘스트가 아니면) return {}` 가드를 추가한다. UI 우회(예: 콘솔에서 직접 호출)로도 스팸이 안 통하게 하는 게 목적.
*   `petQuests.json`에 `vaccine_due` 트리거(예방접종 이력이 없거나 만료됨)를 추가해서 예방접종도 퀘스트 풀에 들어가게 한다.
*   **퀘스트 스폰을 "하루 3~5회" 예산제로 재설계**: 기존의 매 틱 `QUEST_SPAWN_PROBABILITY` 고정 확률 굴림 대신, `petStore`에 `spirit_dailyQuestBudget: { date, target, spawnedCount }`를 신설 — 자정마다(날짜 바뀔 때) `DAILY_QUEST_TARGET_MIN`~`MAX`(3~5) 중 하나를 그날의 목표로 굴리고, `spawnedCount`가 그 목표에 도달할 때까지만 틱마다 확률 굴림을 시도한다.
*   `giveMedicine()`은 이번 변경 대상에서 제외 — 이미 "아플 때만" 조건부로 노출되는 상시 버튼이라 스팸 우려가 없고, 위급 상황에 퀘스트 뽑기를 기다리게 하는 건 오히려 어색하다.

**스탯 표시 — 게이지 바:**
*   Fullness/Intimacy/Cleanliness/Weight/Happiness를 텍스트("70/100") 대신 채워지는 진행바(게이지)로 표시. 응가는 0~100 스케일이 아니라 개수라 게이지 대신 아이콘 반복 표시(`POOP_NEGLECT_THRESHOLD_COUNT` 도달 시 경고색)로 유지.

**글로벌 변수 추가:**
| 상수 | 값 |
|---|---|
| `MEAL_SLOTS` 🆕 | `[{아침,5-11},{점심,11-17},{저녁,17-23}]` |
| `MEAL_GACHA_CHOICE_COUNT` 🆕 | 3 |
| `MEAL_OPTIMAL_MIN` / `MEAL_OPTIMAL_MAX` 🆕 | 18 / 32 |
| `MEAL_GACHA_MIN_AMOUNT` / `MEAL_GACHA_MAX_AMOUNT` 🆕 | 15 / 40 |
| `MEAL_SCORE_BEST_DIFF` / `MEAL_SCORE_OK_DIFF` 🆕 | 3 / 8 |
| `DAILY_QUEST_TARGET_MIN` / `MAX` 🆕 | 3 / 5 |

이 값들도 전부 1차 추정치 — 실제 페이싱은 플레이테스트로 튜닝.

## 검증 계획

1. **선행 작업 검증:** `feed()` 연타로는 더 이상 즉시 단계가 안 바뀌고, `checkAging()`을 거쳐야(하루 이상 경과) 바뀌는지 확인.
2. **방치 플레이:** 밥을 거의 안 주고 방치 → `teen` 체크포인트에서 `physical_evolutionGrade='poor'`로 확정되는지 확인.
3. **우수 케어 플레이:** 하루 3번 적정 분배 밥주기 + 정확히 3회 놀아주기 + 타이밍 맞춰 청소 → `'good'` 확정 확인.
4. **락(lock) 검증:** 성체 전환 후 종/등급이 고정되고 이후 케어로 안 바뀌는지 확인 (MBTI 락과 동일 패턴이어야 함).
5. **서버 반영 검증:** `pet_tier` 컬럼에 등급이 정상 저장/조회되고, 명예의 전당(memorial) 화면에도 등급이 표시되는지 확인.
6. **MBTI 연동 검증:** `spirit_careQualityScore` 같은 별도 필드가 스토어 어디에도 저장되지 않는지(순수 함수로만 존재하는지) 먼저 확인. 대화 선택(`spirit_mbtiScores`)에서 J/P가 동점으로 유도된 상태에서, `computeCareQualityIndex()` 결과가 높은 플레이와 낮은 플레이 각각 다른 J/P 결과로 갈리는지 확인. 대화에서 이미 J/P가 갈린 경우엔 `computeCareQualityIndex()`가 개입하지 않는지(타이브레이커 우선순위 준수)도 함께 확인.
7. **행복도(EMA) 검증:** `physical_fullness`/`physical_cleanliness`/`spirit_intimacy`/`physical_weight`를 급격히 나쁘게 만들어도 `spirit_happiness`가 그 즉시 폭락하지 않고 여러 체크포인트에 걸쳐 서서히 떨어지는지. 반대로 학대 후 한 번만 잘해줘도 즉시 90으로 안 튀는지. `spirit_happiness`가 낮게 계산돼도 즉시 사망하지 않는지 확인.
7-1. **청결도 이원화 검증:** `play()` 시 `physical_cleanliness`가 −10 되는지. `clean()`은 `env_poopCount`만 0으로 만들고 `physical_cleanliness`는 그대로인지. `bathe()`를 눌러야만 `physical_cleanliness=100`이 되는지 확인.
7-2. **대화→유대감 검증:** `answerDialogue()` 호출 시 `spirit_mbtiScores`뿐 아니라 `spirit_intimacy`도 소폭 오르는지 확인.
8. **체중 검증:** `feed()`/`play()` 반복 시 `physical_weight`가 0~100 범위 안에서만 움직이는지. 체크포인트 시점 과체중/저체중이 `physical_evolutionGrade`에 실제로 페널티를 주는지 확인.
9. **배변 검증:** `feed()` 반복 시 확률적으로 `env_poopCount`가 오르는지. `env_poopCount>=3`일 때 `physical_cleanliness` 감소 속도가 실제로 2배가 되는지. `clean()` 시 `env_poopCount`가 0으로 초기화되는지 확인.
10. **병/예방주사 검증:** 청결도·체중·배변·행복도를 의도적으로 나쁘게 만든 상태에서 발병 확률이 눈에 띄게 오르는지(통계적으로). `giveMedicine()` 1회만으로는 완치 안 되고 24시간 내 2회째에 완치되는지. `vaccinate()` 유효기간 중엔 발병 확률이 낮게 나오는지. `physical_health='sick'`이 48시간 지속되면 강제 사망 처리되는지 확인.
11. **펫 퀘스트 검증:** 특정 스탯을 임계값 아래로 떨어뜨렸을 때 관련 퀘스트가 스폰되는지(확률이라 반복 시행으로 확인). 이미 `spirit_activeQuest`가 있는 상태에선 새 퀘스트가 안 뜨는지(동시 1개 제한). `resolveAction`에 맞는 액션을 하면 자동 완료+유대감 보너스가 붙는지. `QUEST_EXPIRY_HOURS` 경과 시 보상 없이 사라지는지 확인.
12. **운세 양방향 검증:** `spirit_happiness>=70`일 때 오늘의 운세가 4 미만으로 안 나오는지. `spirit_happiness<=30`일 때 3 이상으로 안 나오는지(신규 페널티 방향). `calculateFortuneTier` 호출 전후로 어떤 스탯도 값이 바뀌지 않는지(순수함수 불변 재확인).
13. **MBTI 행동 확장 검증:** 같은 조건에서 `finalizedMbti`가 E vs I일 때 퀘스트 스폰 빈도가 통계적으로 다른지. `mbtiAffinity`가 일치하는 퀘스트 문구가 실제로 우선 노출되는지.

## 실행 순서

새 서브시스템(5~10번) 중 6번(체중)은 2번(등급 산정)의 입력이고, 5번(행복도)·7번(배변)은 8번(병)의 발병 확률 입력이며, 9번(펫 퀘스트)은 5·6·7번이 만든 트리거 스탯/타임스탬프 필드를 재사용하고, 10번(운세/MBTI 행동)은 5번의 `spirit_happiness`와 9번의 퀘스트 스폰 로직 둘 다에 의존하므로 맨 뒤에 온다:

**0 → 5(행복도 파생값 전환 + 유대감/청결도 재정의) → 6(체중) → 1(케어 품질 지수 + MBTI 연동) → 7(배변) → 8(병+예방주사) → 9(펫 퀘스트) → 10(운세 양방향 + MBTI 행동) → 2(체크포인트/등급 산정) → 3(비주얼, Option A) → 4(백엔드)**

*   0번(권한 일원화)은 모든 체크포인트 정의의 전제이므로 여전히 가장 먼저.
*   1번은 6번(체중) 다음에 둬서, 채점식에 체중 페널티까지 포함한 최종 버전으로 한 번에 구현한다 (1번을 두 번 고치지 않도록).
*   9번(펫 퀘스트)은 5·6·7번의 트리거 스탯(`spirit_happiness`, `physical_weight`, `env_poopCount`)과 타임스탬프 필드(`spirit_lastPlayTime` 등)를 그대로 가져다 쓰므로 그것들이 먼저 존재해야 한다.
*   2번(등급 산정)은 5·6·7·8·9번이 다 끝난 뒤에 와야 `computeCareQualityIndex()`가 퀘스트 응답 속도까지 포함한 모든 신호를 반영한 상태로 등급을 매길 수 있다.
*   웹 리플리카(`/text`) 동기화는 이번 실행 순서에 포함하지 않고 후속 작업으로 분리한다.
