import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { useUserStore } from './userStore';
import {
  evaluateEvolution,
  type CareQualityWindowData,
  type EvolutionGrade,
} from '../utils/careQuality';
import { computeHappinessTarget } from '../utils/happinessLogic';
import { pickQuest, getQuestSpawnProbability, isQuestExpired, type QuestDef, type QuestResolveAction } from '../utils/questLogic';
import { getMealSlotAt, hasFedSlotToday, rollOptimalAmount, rollGachaChoices, randomInt } from '../utils/mealSlots';
import petQuestsData from '../data/petQuests.json';
import {
  FEED_INTIMACY_GAIN,
  PLAY_INTIMACY_GAIN,
  PLAY_FULLNESS_LOSS,
  PLAY_WEIGHT_LOSS,
  PLAY_CLEANLINESS_LOSS,
  PET_INTIMACY_GAIN,
  CLEAN_INTIMACY_GAIN,
  DIALOGUE_INTIMACY_GAIN,
  DECAY_FULLNESS_PER_HOUR,
  DECAY_INTIMACY_PER_HOUR,
  DECAY_CLEANLINESS_PER_HOUR,
  DECAY_CLEANLINESS_PER_HOUR_POOP_PENALTY,
  HAPPINESS_EMA_ALPHA,
  POOP_SPAWN_PROBABILITY_ON_FEED,
  POOP_NEGLECT_THRESHOLD_COUNT,
  SICKNESS_BASE_PROBABILITY,
  AGING_SICK_BONUS_PER_DAY,
  HEALTHSPAN_END_DAY,
  LIFESPAN_MAX_DAYS,
  CLEANLINESS_DIRTY,
  MEDICINE_CURE_WINDOW_HOURS,
  MEDICINE_DOSES_REQUIRED,
  VACCINE_PROTECTION_DAYS,
  SICK_DEATH_THRESHOLD_HOURS,
  EVOLUTION_CHECKPOINT_DAYS,
  HATCH_FULLNESS_GAIN,
  HATCH_WEIGHT_GAIN,
  MEAL_SCORE_BEST_DIFF,
  MEAL_SCORE_OK_DIFF,
  MEAL_WEIGHT_DELTA_MILD,
  MEAL_WEIGHT_DELTA_LARGE,
  DAILY_QUEST_TARGET_MIN,
  DAILY_QUEST_TARGET_MAX,
} from '../config/gameBalance';

const storage = createMMKV();

const zustandStorage = {
  setItem: (name: string, value: string) => storage.set(name, value),
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name: string) => storage.remove(name),
};

const QUESTS = petQuestsData as QuestDef[];

export interface Memorial {
  name: string;
  mbti: string;
  score: number;
  diedAt: number;
}

export interface FortuneLock {
  date: string;
  baseTier: number;
  isRescued: boolean;
}

export interface ActiveQuest {
  questId: string;
  spawnedAt: number;
}

export type HealthStatus = 'healthy' | 'sick';
export type Species = 'fly' | 'dragon' | 'bear';

export interface MealLogEntry {
  time: number;
  amount: number;
  optimalAmount: number;
}
export interface CleanLogEntry {
  time: number;
  dirtinessBefore: number;
}
// 11번: 밥주기 가챠 — 열려있는 동안 유저가 3개 선택지 중 하나를 고르길 기다리는 상태.
export interface MealGacha {
  slotId: 'breakfast' | 'lunch' | 'dinner';
  optimalAmount: number; // 숨겨진 정답, UI엔 노출 안 함
  choices: number[];
}
export interface DailyQuestBudget {
  date: string;
  target: number; // 오늘 스폰될 퀘스트 총량(3~5, 하루 1회 굴림)
  spawnedCount: number;
}

export interface PetState {
  // ── 정체성/생애주기 ──────────────────────────────────────────────
  petName: string;
  petStage: 'egg' | 'baby' | 'junior' | 'teen' | 'adult' | 'senior' | 'memorial';
  petBirthDate: number | null;
  petTier: number; // 서버 PetRanking.pet_tier 재활용 (evolutionGrade 저장용)
  isDead: boolean;
  lastCareTime: number;

  // ── physical_ (물리적) ───────────────────────────────────────────
  physical_fullness: number;
  physical_cleanliness: number;
  physical_weight: number;
  physical_health: HealthStatus;
  physical_sickSince: number | null;
  physical_medicineDoses: number;
  physical_firstMedicineDoseTime: number | null;
  physical_vaccinatedUntil: number | null;
  physical_evolutionGrade: EvolutionGrade | null;
  physical_species: Species | null; // teen→adult 전환 시 확정(락)
  physical_lastBatheTime: number | null;
  physical_lastCheckpointDay: number; // 마지막으로 evaluateEvolution()을 돌린 경과일수

  // ── spirit_ (정신적) ─────────────────────────────────────────────
  spirit_intimacy: number;
  spirit_happiness: number; // EMA로 완충되는 반파생값 — 액션이 직접 못 건드림
  spirit_mbtiScores: Record<string, number>;
  spirit_finalizedMbti: string | null;
  spirit_playCount: number; // 놀이 총량(참고용, 산책+쓰다듬기 통합 누적)
  spirit_activeQuest: ActiveQuest | null;
  spirit_lastPlayTime: number | null;
  spirit_mealLog: MealLogEntry[]; // 체크포인트마다 초기화
  spirit_playCountSinceCheckpoint: number; // 체크포인트마다 초기화
  spirit_questResponseLog: number[]; // 체크포인트마다 초기화 (ms)
  spirit_mealGacha: MealGacha | null; // 11번: 열려있는 밥주기 가챠(응답 대기 중)
  spirit_dailyQuestBudget: DailyQuestBudget | null; // 11번: 하루 퀘스트 스폰 예산(3~5회)

  // ── env_ (환경적) ────────────────────────────────────────────────
  env_poopCount: number;
  env_lastCleanTime: number | null;
  env_cleanLog: CleanLogEntry[]; // 체크포인트마다 초기화

  // ── 레거시 카운터 (careScore 산출용으로 유지) ──────────────────────
  feedCount: number;
  playCount: number;
  cleanCount: number;
  petCount: number;

  mbtiScores: Record<string, number>; // deprecated alias, migrate에서만 참조
  memorials: Memorial[];
  dailyFortuneLock: FortuneLock | null;

  // ── 액션 ─────────────────────────────────────────────────────────
  setPetName: (name: string) => void;
  feed: () => void; // egg 단계 전용(부화). 부화 이후엔 openMealGacha()/chooseMealAmount() 사용.
  openMealGacha: () => void;
  chooseMealAmount: (amount: number) => void;
  play: () => void;
  clean: () => void;
  bathe: () => void;
  pet: () => void;
  giveMedicine: () => void;
  vaccinate: () => void;
  applyDegradation: (hoursPassed: number) => void;
  answerDialogue: (traits: string[]) => void;
  hatchEgg: () => void;
  gachaEgg: () => void;
  resetPet: () => void;
  syncToServer: () => Promise<void>;
  setDailyFortuneLock: (lock: FortuneLock) => void;
  checkAging: () => void;
}

const EMPTY_MBTI_SCORES = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

function freshPetFields() {
  return {
    petStage: 'egg' as const,
    petBirthDate: null,
    isDead: false,
    lastCareTime: Date.now(),

    physical_fullness: 50,
    physical_cleanliness: 100,
    physical_weight: 50,
    physical_health: 'healthy' as HealthStatus,
    physical_sickSince: null,
    physical_medicineDoses: 0,
    physical_firstMedicineDoseTime: null,
    physical_vaccinatedUntil: null,
    physical_evolutionGrade: null,
    physical_species: null,
    physical_lastBatheTime: null,
    physical_lastCheckpointDay: 0,

    spirit_intimacy: 50,
    spirit_happiness: 50,
    spirit_mbtiScores: { ...EMPTY_MBTI_SCORES },
    spirit_finalizedMbti: null,
    spirit_playCount: 0,
    spirit_activeQuest: null,
    spirit_lastPlayTime: null,
    spirit_mealLog: [],
    spirit_playCountSinceCheckpoint: 0,
    spirit_questResponseLog: [],
    spirit_mealGacha: null,
    spirit_dailyQuestBudget: null,

    env_poopCount: 0,
    env_lastCleanTime: null,
    env_cleanLog: [],

    feedCount: 0,
    playCount: 0,
    cleanCount: 0,
    petCount: 0,

    mbtiScores: { ...EMPTY_MBTI_SCORES },
    dailyFortuneLock: null,
  };
}

// persist version 1(리네임 이전) → 2: physical_/spirit_/env_ 접두사 스키마로 필드 이관.
// 이게 없으면 기존 유저는 fullness/intimacy/cleanliness/mbtiScores/finalizedMbti가 전부 초기값으로
// 리셋되는 것과 같은 효과 — 여러 턴 전에 경고했던 "스토어 분할 시 데이터 유실" 문제와 동일한 함정.
// 독립 함수로 분리해서 zustand persist rehydrate 경로 없이도 직접 단위 테스트할 수 있게 했다.
export function migratePetStoreV1toV2(persistedState: any): Partial<PetState> {
  const old = persistedState ?? {};
  const fresh = freshPetFields();
  return {
    ...fresh,
    petName: old.petName ?? 'Lucky',
    petTier: old.petTier ?? 1,
    petStage: old.petStage ?? 'egg',
    petBirthDate: old.petBirthDate ?? null,
    isDead: old.isDead ?? false,
    lastCareTime: old.lastCareTime ?? Date.now(),

    physical_fullness: old.fullness ?? fresh.physical_fullness,
    physical_cleanliness: old.cleanliness ?? fresh.physical_cleanliness,

    spirit_intimacy: old.intimacy ?? fresh.spirit_intimacy,
    spirit_mbtiScores: old.mbtiScores ?? fresh.spirit_mbtiScores,
    spirit_finalizedMbti: old.finalizedMbti ?? null,

    feedCount: old.feedCount ?? 0,
    playCount: old.playCount ?? 0,
    cleanCount: old.cleanCount ?? 0,
    petCount: old.petCount ?? 0,
    spirit_playCount: (old.playCount ?? 0) + (old.petCount ?? 0),

    mbtiScores: old.mbtiScores ?? fresh.mbtiScores,
    memorials: old.memorials ?? [],
    dailyFortuneLock: old.dailyFortuneLock ?? null,
  };
}

// 11번 섹션: play/clean/bathe/pet/vaccinate는 이제 상시 버튼이 아니다 — 지금 이 액션을
// resolveAction으로 갖는 퀘스트가 떠 있을 때만 통과시킨다. UI에서 버튼을 숨기는 것과 별개로
// 스토어 레벨에서 차단해야 콘솔 직접 호출 같은 우회로도 스팸이 안 통한다.
function hasMatchingActiveQuest(state: PetState, action: QuestResolveAction): boolean {
  if (!state.spirit_activeQuest) return false;
  const quest = QUESTS.find((q) => q.id === state.spirit_activeQuest!.questId);
  return !!quest && quest.resolveAction === action;
}

// 활성 퀘스트가 이 액션으로 해결되는지 확인하고, 해결됐다면 정리 + 유대감 보너스 + 응답시간 로그를 patch로 반환.
// currentIntimacy는 액션 자체가 이미 계산한 새 유대감 값 — 퀘스트 보너스는 그 위에 "더해서" 쌓여야 하고,
// state.spirit_intimacy(액션 전 값)를 기준으로 다시 계산하면 액션 자신의 유대감 증가분을 덮어써버리는 버그가 난다.
function resolveQuestPatch(state: PetState, action: QuestResolveAction, currentIntimacy: number): Partial<PetState> {
  if (!state.spirit_activeQuest) return {};
  const quest = QUESTS.find((q) => q.id === state.spirit_activeQuest!.questId);
  if (!quest || quest.resolveAction !== action) return {};

  const now = Date.now();
  const responseMs = now - state.spirit_activeQuest.spawnedAt;
  return {
    spirit_activeQuest: null,
    spirit_intimacy: Math.min(100, currentIntimacy + 5),
    spirit_questResponseLog: [...state.spirit_questResponseLog, responseMs],
  };
}

function buildCareQualityWindow(state: PetState, daysElapsed: number): CareQualityWindowData {
  const windowDays = Math.max(daysElapsed - state.physical_lastCheckpointDay, 1);
  return {
    windowDays,
    mealLog: state.spirit_mealLog,
    cleanLog: state.env_cleanLog,
    playCountInWindow: state.spirit_playCountSinceCheckpoint,
    weight: state.physical_weight,
    questResponseTimesMs: state.spirit_questResponseLog,
  };
}

function buildMemorial(state: PetState): Memorial {
  const mbti = state.spirit_finalizedMbti ?? calculateMBTIInline(state);
  const careScore = state.feedCount * 10 + state.playCount * 15 + state.cleanCount * 5;
  return { name: state.petName, mbti, score: careScore, diedAt: Date.now() };
}

// checkAging()이 성체 확정 시점에 MBTI를 락 걸 때 순환 참조(mbtiCalculator → petStore) 없이 쓰기 위한 지역 계산.
// mbtiCalculator.ts의 calculateMBTI와 동일한 로직 — 그쪽이 정본이고 여긴 사망 시 mbti 표기용 폴백이라 단순화.
function calculateMBTIInline(state: PetState): string {
  const { calculateMBTI } = require('../utils/mbtiCalculator');
  return calculateMBTI(state);
}

export const usePetStore = create<PetState>()(
  persist(
    (set, get) => ({
      petName: 'Lucky',
      petTier: 1,
      ...freshPetFields(),
      memorials: [],

      setPetName: (name) => set({ petName: name }),
      setDailyFortuneLock: (lock) => set({ dailyFortuneLock: lock }),

      // 11번: 부화(알→아기) 전용. 부화 이후엔 openMealGacha()/chooseMealAmount()로 넘어간다.
      feed: () => set((state) => {
        if (state.isDead) return {};
        if (!state.petName) return {}; // Guard
        if (state.petStage !== 'egg') return {};

        const now = Date.now();
        return {
          physical_fullness: Math.min(100, state.physical_fullness + HATCH_FULLNESS_GAIN),
          physical_weight: Math.min(100, state.physical_weight + HATCH_WEIGHT_GAIN),
          petStage: 'baby' as const,
          petBirthDate: now,
          lastCareTime: now,
          feedCount: state.feedCount + 1,
        };
      }),

      // 11번: 밥주기 1단계 — 지금 시간대 슬롯을 확인하고, 아직 그 슬롯에 안 먹였으면 가챠(선택지 3개)를 연다.
      // 슬롯 자체가 "하루 1번씩만"이라는 자연스러운 상한이라 별도 쿨다운이 필요 없다.
      openMealGacha: () => set((state) => {
        if (state.isDead || !state.petName || state.petStage === 'egg') return {};
        if (state.spirit_mealGacha) return {}; // 이미 열려있음

        const now = Date.now();
        const slot = getMealSlotAt(now);
        if (!slot) return {}; // 지금은 식사시간이 아님(23시~05시)
        if (hasFedSlotToday(state.spirit_mealLog, slot.id, now)) return {}; // 이미 이 끼니 줬음

        return {
          spirit_mealGacha: {
            slotId: slot.id,
            optimalAmount: rollOptimalAmount(),
            choices: rollGachaChoices(),
          },
        };
      }),

      // 11번: 밥주기 2단계 — 고른 양이 숨은 최적치에 가까울수록 포만감/케어품질 보너스가 크고,
      // 많이 벗어나면(과다/부족) 체중이 그만큼 움직인다(원조의 "폭식→과체중" 자연 페널티).
      chooseMealAmount: (amount: number) => set((state) => {
        if (!state.spirit_mealGacha) return {};

        const { optimalAmount } = state.spirit_mealGacha;
        const now = Date.now();
        const diff = Math.abs(amount - optimalAmount);

        const newFullness = Math.min(100, state.physical_fullness + amount);
        const newIntimacy = Math.min(100, state.spirit_intimacy + FEED_INTIMACY_GAIN);

        let weightDelta = 0;
        if (diff > MEAL_SCORE_OK_DIFF) weightDelta = amount > optimalAmount ? MEAL_WEIGHT_DELTA_LARGE : -MEAL_WEIGHT_DELTA_LARGE;
        else if (diff > MEAL_SCORE_BEST_DIFF) weightDelta = amount > optimalAmount ? MEAL_WEIGHT_DELTA_MILD : -MEAL_WEIGHT_DELTA_MILD;
        const newWeight = Math.max(0, Math.min(100, state.physical_weight + weightDelta));

        let newLock = state.dailyFortuneLock;
        if (newLock && !newLock.isRescued && newLock.baseTier < 3) {
          newLock = { ...newLock, isRescued: true, baseTier: newLock.baseTier + 1 };
        }

        const newPoopCount = Math.random() < POOP_SPAWN_PROBABILITY_ON_FEED
          ? state.env_poopCount + 1
          : state.env_poopCount;

        return {
          physical_fullness: newFullness,
          spirit_intimacy: newIntimacy,
          physical_weight: newWeight,
          env_poopCount: newPoopCount,
          spirit_mealLog: [...state.spirit_mealLog, { time: now, amount, optimalAmount }],
          spirit_mealGacha: null,
          lastCareTime: now,
          feedCount: state.feedCount + 1,
          dailyFortuneLock: newLock,
          ...resolveQuestPatch(state, 'feed', newIntimacy),
        };
      }),

      // 11번: 상시 버튼 제거 — 매칭되는 펫 퀘스트가 떠 있을 때만 동작(hasMatchingActiveQuest 가드).
      play: () => set((state) => {
        if (state.isDead) return {};
        if (!state.petName) return {}; // Guard
        // removed hasMatchingActiveQuest limit
        if (state.spirit_intimacy >= 100 || state.physical_fullness <= 10) return {};

        const now = Date.now();
        const newIntimacy = Math.min(100, state.spirit_intimacy + PLAY_INTIMACY_GAIN);
        return {
          spirit_intimacy: newIntimacy,
          physical_fullness: Math.max(0, state.physical_fullness - PLAY_FULLNESS_LOSS),
          physical_weight: Math.max(0, state.physical_weight - PLAY_WEIGHT_LOSS),
          physical_cleanliness: Math.max(0, state.physical_cleanliness - PLAY_CLEANLINESS_LOSS),
          spirit_lastPlayTime: now,
          spirit_playCount: state.spirit_playCount + 1,
          spirit_playCountSinceCheckpoint: state.spirit_playCountSinceCheckpoint + 1,
          lastCareTime: now,
          playCount: state.playCount + 1,
          ...resolveQuestPatch(state, 'play', newIntimacy),
        };
      }),

      clean: () => set((state) => {
        if (state.isDead) return {};
        if (!state.petName) return {}; // Guard
        // removed hasMatchingActiveQuest limit
        if (state.env_poopCount === 0) return {};

        const now = Date.now();
        const newIntimacy = Math.min(100, state.spirit_intimacy + CLEAN_INTIMACY_GAIN);
        return {
          env_poopCount: 0,
          env_lastCleanTime: now,
          env_cleanLog: [...state.env_cleanLog, { time: now, dirtinessBefore: 100 - state.physical_cleanliness }],
          spirit_intimacy: newIntimacy,
          lastCareTime: now,
          cleanCount: state.cleanCount + 1,
          ...resolveQuestPatch(state, 'clean', newIntimacy),
        };
      }),

      bathe: () => set((state) => {
        if (state.isDead) return {};
        if (!state.petName) return {}; // Guard
        // removed hasMatchingActiveQuest limit
        if (state.physical_cleanliness >= 100) return {};

        const now = Date.now();
        return {
          physical_cleanliness: 100,
          physical_lastBatheTime: now,
          lastCareTime: now,
          ...resolveQuestPatch(state, 'bathe', state.spirit_intimacy),
        };
      }),

      pet: () => set((state) => {
        if (state.isDead) return {};
        // removed hasMatchingActiveQuest limit
        if (state.spirit_intimacy >= 100) return {};

        const now = Date.now();
        const newIntimacy = Math.min(100, state.spirit_intimacy + PET_INTIMACY_GAIN);
        return {
          spirit_intimacy: newIntimacy,
          spirit_lastPlayTime: now,
          spirit_playCount: state.spirit_playCount + 1,
          spirit_playCountSinceCheckpoint: state.spirit_playCountSinceCheckpoint + 1,
          lastCareTime: now,
          petCount: state.petCount + 1,
          ...resolveQuestPatch(state, 'pet', newIntimacy),
        };
      }),

      giveMedicine: () => set((state) => {
        if (state.isDead) return {};
        if (!state.petName) return {};
        if (state.physical_health !== 'sick') return {};

        const now = Date.now();
        if (state.physical_medicineDoses === 0) {
          return { physical_medicineDoses: 1, physical_firstMedicineDoseTime: now };
        }

        const withinWindow = state.physical_firstMedicineDoseTime !== null
          && now - state.physical_firstMedicineDoseTime <= MEDICINE_CURE_WINDOW_HOURS * 60 * 60 * 1000;

        if (withinWindow && state.physical_medicineDoses + 1 >= MEDICINE_DOSES_REQUIRED) {
          return {
            physical_health: 'healthy',
            physical_sickSince: null,
            physical_medicineDoses: 0,
            physical_firstMedicineDoseTime: null,
          };
        }

        // 이전 투여가 유효기간을 넘겼으면 새 1회차로 취급
        return { physical_medicineDoses: 1, physical_firstMedicineDoseTime: now };
      }),

      vaccinate: () => set((state) => {
        if (state.isDead) return {};
        if (!state.petName) return {};
        // removed hasMatchingActiveQuest limit
        if (state.physical_health === 'sick') return {};
        const now = Date.now();
        if (state.physical_vaccinatedUntil && now < state.physical_vaccinatedUntil) return {};

        return {
          physical_vaccinatedUntil: now + VACCINE_PROTECTION_DAYS * 24 * 60 * 60 * 1000,
          ...resolveQuestPatch(state, 'vaccinate', state.spirit_intimacy),
        };
      }),

      answerDialogue: (traits: string[]) => set((state) => {
        if (state.isDead) return {};

        const { useActivityStore } = require('./activityStore');
        const activityStore = useActivityStore.getState();
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();

        const usage = activityStore.dailyDialogueUsage && activityStore.dailyDialogueUsage.date === today
          ? activityStore.dailyDialogueUsage
          : { date: today, count: 0, lastDialogueTime: 0 };

        // 스팸 방지: 1시간 쿨타임 + 일일 최대 5회
        if (usage.count >= 5) return {};
        if (usage.lastDialogueTime && now - usage.lastDialogueTime < 60 * 60 * 1000) return {};

        const newMbtiScores = { ...state.spirit_mbtiScores };
        traits.forEach((trait) => {
          if (trait in newMbtiScores) {
            newMbtiScores[trait] += 1;
          }
        });

        activityStore.setDailyDialogueUsage({
          date: today,
          count: usage.count + 1,
          lastDialogueTime: now,
        });

        return {
          spirit_mbtiScores: newMbtiScores,
          mbtiScores: newMbtiScores,
          spirit_intimacy: Math.min(100, state.spirit_intimacy + DIALOGUE_INTIMACY_GAIN),
        };
      }),

      // 0번 섹션: 성장 판정의 유일한 권한. feed()는 더 이상 petStage를 바꾸지 않는다.
      // 2/3번 섹션: 체크포인트마다 그 구간의 케어 품질을 평가해서 진화등급을 갱신하고,
      // teen→adult 전환 시점에는 종(species)과 MBTI를 그 자리에서 확정(락)한다.
      checkAging: () => {
        const state = get();
        if (state.petStage === 'egg' || state.isDead) return;
        if (!state.petBirthDate) return;

        const now = Date.now();
        const diffMs = now - state.petBirthDate;
        const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (daysElapsed >= LIFESPAN_MAX_DAYS) {
          set({
            isDead: true,
            petStage: 'memorial',
            memorials: [...state.memorials, buildMemorial(state)],
          });
          return;
        }

        let newStage = state.petStage;
        if (daysElapsed >= 70) newStage = 'senior';
        else if (daysElapsed >= 10) newStage = 'adult';
        else if (daysElapsed >= 5) newStage = 'teen';
        else if (daysElapsed >= 3) newStage = 'junior';
        else if (daysElapsed >= 1) newStage = 'baby';

        if (newStage === state.petStage) return;

        const isCheckpoint = (EVOLUTION_CHECKPOINT_DAYS as readonly number[]).some(
          (d) => daysElapsed >= d && state.physical_lastCheckpointDay < d,
        );

        if (!isCheckpoint) {
          set({ petStage: newStage });
          return;
        }

        const window = buildCareQualityWindow(state, daysElapsed);
        const evolution = evaluateEvolution(window);

        const isAdultLock = newStage === 'adult' && state.petStage !== 'adult' && !state.spirit_finalizedMbti;

        set({
          petStage: newStage,
          physical_evolutionGrade: evolution.grade,
          physical_species: isAdultLock ? evolution.species : state.physical_species,
          spirit_finalizedMbti: isAdultLock ? calculateMBTIInline(state) : state.spirit_finalizedMbti,
          physical_lastCheckpointDay: daysElapsed,
          spirit_mealLog: [],
          env_cleanLog: [],
          spirit_playCountSinceCheckpoint: 0,
          spirit_questResponseLog: [],
        });
      },

      applyDegradation: (hoursPassed: number) => {
        get().checkAging();
        set((state) => {
          if (state.isDead || hoursPassed <= 0) return {};

          const sickMultiplier = state.physical_health === 'sick' ? 1.5 : 1;
          const poopPenalty = state.env_poopCount >= POOP_NEGLECT_THRESHOLD_COUNT;

          const lossFullness = Math.floor(hoursPassed * DECAY_FULLNESS_PER_HOUR * sickMultiplier);
          const lossIntimacy = Math.floor(hoursPassed * DECAY_INTIMACY_PER_HOUR * sickMultiplier);
          const cleanDecayRate = poopPenalty ? DECAY_CLEANLINESS_PER_HOUR_POOP_PENALTY : DECAY_CLEANLINESS_PER_HOUR;
          const lossClean = Math.floor(hoursPassed * cleanDecayRate * sickMultiplier);

          const newFullness = Math.max(0, state.physical_fullness - lossFullness);
          const newIntimacy = Math.max(0, state.spirit_intimacy - lossIntimacy);
          const newClean = Math.max(0, state.physical_cleanliness - lossClean);

          // 약 미투여 만료(수동적 리셋) — 24시간 안에 2회째를 못 맞으면 그냥 리셋
          let newDoses = state.physical_medicineDoses;
          let newFirstDoseTime = state.physical_firstMedicineDoseTime;
          if (newDoses === 1 && newFirstDoseTime !== null) {
            const elapsedHours = (Date.now() - newFirstDoseTime) / (1000 * 60 * 60);
            if (elapsedHours > MEDICINE_CURE_WINDOW_HOURS) {
              newDoses = 0;
              newFirstDoseTime = null;
            }
          }

          // 5번: 행복도는 EMA로 목표치를 서서히 따라간다
          const target = computeHappinessTarget({
            fullness: newFullness,
            cleanliness: newClean,
            intimacy: newIntimacy,
            isSick: state.physical_health === 'sick',
            weight: state.physical_weight,
          });
          const newHappiness = Math.round(state.spirit_happiness * (1 - HAPPINESS_EMA_ALPHA) + target * HAPPINESS_EMA_ALPHA);

          // 8번: 발병 확률 판정 (건강수명 초과 시 노화 가산 포함)
          let newHealth = state.physical_health;
          let newSickSince = state.physical_sickSince;
          if (state.physical_health === 'healthy') {
            const daysElapsed = state.petBirthDate ? Math.floor((Date.now() - state.petBirthDate) / (1000 * 60 * 60 * 24)) : 0;
            const agingBonus = daysElapsed > HEALTHSPAN_END_DAY ? (daysElapsed - HEALTHSPAN_END_DAY) * (AGING_SICK_BONUS_PER_DAY / 100) : 0;
            const vaccinated = state.physical_vaccinatedUntil !== null && Date.now() < state.physical_vaccinatedUntil;
            let probability = SICKNESS_BASE_PROBABILITY;
            if (state.env_poopCount >= POOP_NEGLECT_THRESHOLD_COUNT) probability += 0.10;
            if (newClean < CLEANLINESS_DIRTY) probability += 0.10;
            if (state.physical_weight >= 80 || state.physical_weight <= 20) probability += 0.05;
            if (newHappiness < 20) probability += 0.05;
            probability += agingBonus;
            if (vaccinated) probability -= 0.10;
            probability = Math.max(0, probability);

            if (Math.random() < probability) {
              newHealth = 'sick';
              newSickSince = Date.now();
            }
          }

          let isDead = false;
          let newStage = state.petStage;
          let newMemorials = state.memorials;

          const sickTooLong = newHealth === 'sick' && newSickSince !== null
            && (Date.now() - newSickSince) / (1000 * 60 * 60) >= SICK_DEATH_THRESHOLD_HOURS;

          if ((newFullness === 0 || sickTooLong) && !state.isDead) {
            isDead = true;
            newStage = 'memorial';
            newMemorials = [...state.memorials, buildMemorial(state)];
          }

          // 11번: 펫 퀘스트 스폰/만료 — 하루 3~5회 예산제. 매 틱 고정 확률로 계속 스폰하던 방식은
          // "만들어둔 채점 시스템을 무의미하게 만드는 스팸"의 근본 원인이라 하루 총량으로 캡을 씌운다.
          const today = new Date().toISOString().split('T')[0];
          let dailyBudget = state.spirit_dailyQuestBudget;
          if (!dailyBudget || dailyBudget.date !== today) {
            dailyBudget = { date: today, target: randomInt(DAILY_QUEST_TARGET_MIN, DAILY_QUEST_TARGET_MAX), spawnedCount: 0 };
          }

          let newActiveQuest = state.spirit_activeQuest;
          if (newActiveQuest && isQuestExpired(newActiveQuest.spawnedAt, Date.now())) {
            newActiveQuest = null; // 보상 없이 소멸
          }
          if (!newActiveQuest && !isDead && dailyBudget.spawnedCount < dailyBudget.target) {
            const spawnProbability = getQuestSpawnProbability(state.spirit_finalizedMbti);
            if (Math.random() < spawnProbability) {
              const hoursSinceLastPlay = state.spirit_lastPlayTime
                ? (Date.now() - state.spirit_lastPlayTime) / (1000 * 60 * 60)
                : null;
              const quest = pickQuest(
                QUESTS,
                {
                  fullness: newFullness,
                  happiness: newHappiness,
                  cleanliness: newClean,
                  poopCount: state.env_poopCount,
                  hoursSinceLastPlay,
                  vaccinatedUntil: state.physical_vaccinatedUntil,
                  now: Date.now(),
                },
                state.spirit_finalizedMbti,
              );
              if (quest) {
                newActiveQuest = { questId: quest.id, spawnedAt: Date.now() };
                dailyBudget = { ...dailyBudget, spawnedCount: dailyBudget.spawnedCount + 1 };
              }
            }
          }

          return {
            physical_fullness: newFullness,
            spirit_intimacy: newIntimacy,
            physical_cleanliness: newClean,
            spirit_happiness: newHappiness,
            physical_health: newHealth,
            physical_sickSince: newSickSince,
            physical_medicineDoses: newDoses,
            spirit_dailyQuestBudget: dailyBudget,
            physical_firstMedicineDoseTime: newFirstDoseTime,
            spirit_activeQuest: newActiveQuest,
            isDead,
            petStage: newStage,
            memorials: newMemorials,
            lastCareTime: Date.now(),
          };
        });
      },

      syncToServer: async () => {
        const state = get();
        const authToken = useUserStore.getState().authToken;
        if (!authToken) return;

        try {
          const { syncRanking } = require('../utils/apiClient');
          const { calculateMBTI } = require('../utils/mbtiCalculator');
          const mbti = calculateMBTI(state);
          const careScore = state.feedCount * 10 + state.playCount * 15 + state.cleanCount * 5;
          // 4번 섹션: pet_tier 컬럼을 evolutionGrade 저장용으로 재활용 (1=poor, 2=normal, 3=good)
          const gradeToTier: Record<string, number> = { poor: 1, normal: 2, good: 3 };
          const tier = state.physical_evolutionGrade ? gradeToTier[state.physical_evolutionGrade] : state.petTier;

          await syncRanking(authToken, {
            pet_nickname: state.petName,
            pet_tier: tier,
            pet_mbti: mbti,
            care_score: careScore,
          });

          const { useActivityStore } = require('./activityStore');
          await useActivityStore.getState().syncLogsToServer();

          console.log('[petStore] Successfully synced to server.');
        } catch (error) {
          console.error('[petStore] Sync failed:', error);
        }
      },

      hatchEgg: () => set((state) => {
        if (state.petStage !== 'egg') return {};
        return { petStage: 'baby', petBirthDate: Date.now() };
      }),

      gachaEgg: () => set(() => ({
        petName: '',
        petTier: 1,
        ...freshPetFields(),
      })),

      resetPet: () => set(() => ({
        petTier: 1,
        ...freshPetFields(),
      })),
    }),
    {
      name: 'luckyyum-pet-store',
      storage: createJSONStorage(() => zustandStorage),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version >= 2) return persistedState;
        return migratePetStoreV1toV2(persistedState);
      },
    }
  )
);
