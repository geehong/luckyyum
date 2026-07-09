// LuckyYamProjectRebuildPlan.md 1번 섹션: "케어 품질 지수 — 저장 필드 아님, computeCareQualityIndex() 순수 함수".
// 예전엔 spirit_careQualityScore라는 숨은 스탯 필드였지만, MBTI 옆에 나란히 저장된 "숨은 성격 스탯"처럼 보이는 게
// 문제였어서 순수 함수로 바꿨다. 호출 지점은 evaluateEvolution()과 calculateMBTI() 딱 둘뿐이고, 결과를 저장하지 않는다.
import {
  MEALS_PER_DAY_TARGET,
  CLEANLINESS_DIRTY,
  CLEANLINESS_OK,
  WEIGHT_LOW,
  WEIGHT_HIGH,
  MEAL_SCORE_BEST_DIFF,
  MEAL_SCORE_OK_DIFF,
} from '../config/gameBalance';

export interface MealLogEntry {
  time: number;
  amount: number;
  optimalAmount: number; // 11번: 슬롯별 가챠 추측 미니게임의 숨은 목표치
}

export interface CleanLogEntry {
  time: number;
  dirtinessBefore: number; // 청소 직전 오염도(=100-cleanliness)
}

export interface CareQualityWindowData {
  windowDays: number;
  mealLog: MealLogEntry[];
  cleanLog: CleanLogEntry[];
  playCountInWindow: number;
  weight: number;
  questResponseTimesMs: number[];
}

export function computeCareQualityIndex(data: CareQualityWindowData): number {
  const days = Math.max(data.windowDays, 1);
  let score = 0;

  // 11번: 밥주기 — 슬롯마다 "숨은 최적치"를 얼마나 근접하게 추측했는지로 채점 (끼니별 정확도).
  // 슬롯 자체가 하루 1회씩만 허용되므로(petStore.ts), 하루 총량/횟수를 따로 볼 필요가 없어졌다.
  for (const meal of data.mealLog) {
    const diff = Math.abs(meal.amount - meal.optimalAmount);
    if (diff <= MEAL_SCORE_BEST_DIFF) score += 10;
    else if (diff <= MEAL_SCORE_OK_DIFF) score += 5;
    // 많이 벗어나면 가점 없음(페널티는 없음 — 체중 변화로 이미 대가를 치름)
  }

  // 놀아주기: 하루 평균 놀이 횟수가 정확히 목표(3)면 우수, 초과 시 소폭, 부족 시 비례
  const playsPerDay = data.playCountInWindow / days;
  if (Math.round(playsPerDay) === MEALS_PER_DAY_TARGET) {
    score += 20;
  } else if (playsPerDay > MEALS_PER_DAY_TARGET) {
    score += 5;
  } else {
    score += Math.min(playsPerDay, MEALS_PER_DAY_TARGET) * (20 / MEALS_PER_DAY_TARGET);
  }

  // 청소: 청소 직전 오염도 수준에 따라 가감점 (각 청소 행위마다 채점 후 합산)
  for (const entry of data.cleanLog) {
    if (entry.dirtinessBefore >= CLEANLINESS_OK) {
      score += 10;
    } else if (entry.dirtinessBefore >= CLEANLINESS_DIRTY) {
      score += 5;
    } else {
      score -= 2;
    }
  }

  // 체중: 체크포인트 시점 정상범위 여부
  if (data.weight >= WEIGHT_LOW && data.weight <= WEIGHT_HIGH) {
    score += 10;
  } else {
    score -= 10;
  }

  // 펫 퀘스트 응답 속도: 빠를수록 가점
  if (data.questResponseTimesMs.length > 0) {
    const avgMs = data.questResponseTimesMs.reduce((a, b) => a + b, 0) / data.questResponseTimesMs.length;
    const avgHours = avgMs / (1000 * 60 * 60);
    if (avgHours < 1) score += 10;
    else if (avgHours < 3) score += 5;
  }

  return score;
}

export type EvolutionGrade = 'poor' | 'normal' | 'good';

export function gradeFromAverageScore(averageScore: number): EvolutionGrade {
  if (averageScore < 15) return 'poor';
  if (averageScore <= 35) return 'normal';
  return 'good';
}

// 3번 섹션 Option A: 신규 아트 없이 기존 3종을 분기 결과로 재활용.
const GRADE_SPECIES_MAP: Record<EvolutionGrade, 'fly' | 'dragon' | 'bear'> = {
  good: 'dragon',
  normal: 'fly',
  poor: 'bear',
};

export function speciesFromGrade(grade: EvolutionGrade): 'fly' | 'dragon' | 'bear' {
  return GRADE_SPECIES_MAP[grade];
}

export interface EvolutionResult {
  grade: EvolutionGrade;
  species: 'fly' | 'dragon' | 'bear';
  averageScore: number;
}

// 2번 섹션: 체크포인트마다 그 구간의 원재료를 즉석 평가해서 등급/종을 산출한다 (저장은 호출부의 몫).
export function evaluateEvolution(data: CareQualityWindowData): EvolutionResult {
  const totalScore = computeCareQualityIndex(data);
  const averageScore = totalScore / Math.max(data.windowDays, 1);
  const grade = gradeFromAverageScore(averageScore);
  return { grade, species: speciesFromGrade(grade), averageScore };
}
