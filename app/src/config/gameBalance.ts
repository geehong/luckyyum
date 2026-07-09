// LuckyYamProjectRebuildPlan.md의 "⚙️ 글로벌 밸런스 변수" 섹션을 코드로 옮긴 것.
// 값 자체는 전부 1차 추정치 — 실제 값은 플레이테스트로 튜닝한다. 숫자를 고칠 땐 여기 한 곳만 고치면 된다.

// ── 수명 ──────────────────────────────────────────────────────────────
export const LIFESPAN_MAX_DAYS = 90;
export const HEALTHSPAN_END_DAY = 70;
export const AGING_SICK_BONUS_PER_DAY = 0.5; // %p / 일 (HEALTHSPAN_END_DAY 이후)

// ── 스탯 스케일 ────────────────────────────────────────────────────────
export const STAT_MIN = 0;
export const STAT_MAX = 100;

// ── 저점/고점(정상범위) 임계값 ─────────────────────────────────────────
export const FULLNESS_LOW = 40;
export const FULLNESS_HIGH = 90;
export const WEIGHT_LOW = 40;
export const WEIGHT_HIGH = 60;
export const CLEANLINESS_DIRTY = 30;
export const CLEANLINESS_OK = 70;
export const HAPPINESS_SICK_THRESHOLD = 20;

// ── 식사(급여) ─────────────────────────────────────────────────────────
export const MEALS_PER_DAY_TARGET = 3;
export const MEAL_AMOUNT_IDEAL = 20;
export const MEAL_AMOUNT_TOLERANCE = 0.1; // ±10%
export const DAILY_MEAL_TOTAL_TARGET = MEAL_AMOUNT_IDEAL * MEALS_PER_DAY_TARGET;

// ── 시간/쿨다운 ────────────────────────────────────────────────────────
export const DIALOGUE_DAILY_CAP = 5;
export const DIALOGUE_COOLDOWN_HOURS = 1;
export const MEDICINE_CURE_WINDOW_HOURS = 24;
export const MEDICINE_DOSES_REQUIRED = 2;
export const VACCINE_COOLDOWN_DAYS = 7;
export const VACCINE_PROTECTION_DAYS = 7;
export const SICK_DEATH_THRESHOLD_HOURS = 48;
export const NEGLECT_WARNING_HOURS = 12;

// ── 감쇠율/확률 ────────────────────────────────────────────────────────
export const DECAY_FULLNESS_PER_HOUR = 5;
export const DECAY_INTIMACY_PER_HOUR = 2;
export const DECAY_CLEANLINESS_PER_HOUR = 3;
export const DECAY_CLEANLINESS_PER_HOUR_POOP_PENALTY = 6;
export const HAPPINESS_EMA_ALPHA = 0.3;
export const POOP_SPAWN_PROBABILITY_ON_FEED = 0.4;
export const POOP_NEGLECT_THRESHOLD_COUNT = 3;
export const SICKNESS_BASE_PROBABILITY = 0.05;

// ── 케어 액션 즉시 효과 ────────────────────────────────────────────────
export const FEED_FULLNESS_GAIN = 20;
export const FEED_INTIMACY_GAIN = 5;
export const FEED_WEIGHT_GAIN = 8;
export const PLAY_INTIMACY_GAIN = 3; // 산책은 유대감 소폭만 (기분은 happiness가 담당)
export const PLAY_FULLNESS_LOSS = 5;
export const PLAY_WEIGHT_LOSS = 4;
export const PLAY_CLEANLINESS_LOSS = 10; // 놀고 나면 더러워짐
export const PET_INTIMACY_GAIN = 8; // 쓰다듬기는 유대감 핵심 액션
export const CLEAN_INTIMACY_GAIN = 5;
export const DIALOGUE_INTIMACY_GAIN = 2;

// ── 성장 체크포인트 ────────────────────────────────────────────────────
export const EVOLUTION_CHECKPOINT_DAYS = [1, 3, 5, 10, 70] as const;

// ── 펫 퀘스트 ──────────────────────────────────────────────────────────
export const QUEST_SPAWN_PROBABILITY = 0.3;
export const QUEST_EXPIRY_HOURS = 6;
export const QUEST_SPAWN_WEIGHT_E = 1.5; // MBTI E형: 자주 말 걺
export const QUEST_SPAWN_WEIGHT_I = 0.7; // MBTI I형: 덜 보챔

// ── 운세 양방향 임계값 ─────────────────────────────────────────────────
export const FORTUNE_GOOD_HAPPINESS_THRESHOLD = 70;
export const FORTUNE_GOOD_TIER_FLOOR = 4;
export const FORTUNE_BAD_HAPPINESS_THRESHOLD = 30;
export const FORTUNE_BAD_TIER_CEILING = 2;
