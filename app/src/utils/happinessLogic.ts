// LuckyYamProjectRebuildPlan.md 5번 섹션: 행복도는 EMA로 완충되는 반(半)파생값.
// computeHappinessTarget()은 "지금 이 순간의 목표치"만 계산하고, 실제 저장된 spirit_happiness를
// 그 목표치 쪽으로 서서히(0.7:0.3) 수렴시키는 건 petStore.applyDegradation()이 담당한다.
import { FULLNESS_LOW, FULLNESS_HIGH, WEIGHT_LOW, WEIGHT_HIGH } from '../config/gameBalance';

export interface HappinessTargetInputs {
  fullness: number;
  cleanliness: number;
  intimacy: number;
  isSick: boolean;
  weight: number;
}

export function computeHappinessTarget(inputs: HappinessTargetInputs): number {
  let score = 50; // 중립 베이스라인

  if (inputs.fullness >= FULLNESS_LOW && inputs.fullness <= FULLNESS_HIGH) {
    score += 15;
  } else {
    score -= 15;
  }

  if (inputs.cleanliness < 30) {
    score -= 15;
  } else if (inputs.cleanliness >= 70) {
    score += 10;
  }

  score += (inputs.intimacy - 50) * 0.3;

  if (inputs.isSick) {
    score -= 25;
  }

  if (inputs.weight >= WEIGHT_LOW && inputs.weight <= WEIGHT_HIGH) {
    score += 10;
  } else {
    score -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
