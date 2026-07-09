// LuckyYamProjectRebuildPlan.md 11번 섹션: 밥주기 = 시간대 슬롯 + 가챠 추측 미니게임.
// 슬롯 자체가 "하루 3끼"라는 자연스러운 상한이 되므로, 별도 쿨다운 타이머가 필요 없다.
import {
  MEAL_SLOTS,
  MealSlot,
  MEAL_GACHA_CHOICE_COUNT,
  MEAL_GACHA_MIN_AMOUNT,
  MEAL_GACHA_MAX_AMOUNT,
  MEAL_OPTIMAL_MIN,
  MEAL_OPTIMAL_MAX,
} from '../config/gameBalance';

export function getMealSlotAt(timeMs: number): MealSlot | null {
  const hour = new Date(timeMs).getHours();
  return MEAL_SLOTS.find((s) => hour >= s.startHour && hour < s.endHour) ?? null;
}

export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// 오늘 이 슬롯에 이미 밥을 줬는지 — spirit_mealLog의 타임스탬프로부터 역산(별도 필드 불필요).
export function hasFedSlotToday(mealLog: { time: number }[], slotId: MealSlot['id'], now: number): boolean {
  return mealLog.some((m) => isSameLocalDay(m.time, now) && getMealSlotAt(m.time)?.id === slotId);
}

export function randomInt(min: number, max: number, random: () => number = Math.random): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function rollOptimalAmount(random: () => number = Math.random): number {
  return randomInt(MEAL_OPTIMAL_MIN, MEAL_OPTIMAL_MAX, random);
}

export function rollGachaChoices(random: () => number = Math.random): number[] {
  const choices: number[] = [];
  for (let i = 0; i < MEAL_GACHA_CHOICE_COUNT; i++) {
    choices.push(randomInt(MEAL_GACHA_MIN_AMOUNT, MEAL_GACHA_MAX_AMOUNT, random));
  }
  return choices;
}
