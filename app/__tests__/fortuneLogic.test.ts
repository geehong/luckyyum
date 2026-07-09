import { calculateFortuneTier, getMockFortuneText } from '../src/utils/fortuneLogic';
import {
  FORTUNE_GOOD_HAPPINESS_THRESHOLD,
  FORTUNE_GOOD_TIER_FLOOR,
  FORTUNE_BAD_HAPPINESS_THRESHOLD,
  FORTUNE_BAD_TIER_CEILING,
} from '../src/config/gameBalance';

function makeStore(spirit_happiness: number, dailyFortuneLock: any = null) {
  return { spirit_happiness, dailyFortuneLock } as any;
}

describe('calculateFortuneTier — 10번 섹션: 운세 양방향 연동', () => {
  it('leaves the base tier untouched in the neutral happiness zone', () => {
    expect(calculateFortuneTier(makeStore(50), 2)).toBe(2);
  });

  it('floors the tier up when happiness is high (good care -> good fortune)', () => {
    const tier = calculateFortuneTier(makeStore(FORTUNE_GOOD_HAPPINESS_THRESHOLD), 1);
    expect(tier).toBe(FORTUNE_GOOD_TIER_FLOOR);
  });

  it('never lowers an already-good base tier when happiness is high', () => {
    const tier = calculateFortuneTier(makeStore(90), 5);
    expect(tier).toBe(5);
  });

  it('ceilings the tier down when happiness is low (neglect -> bad fortune)', () => {
    const tier = calculateFortuneTier(makeStore(FORTUNE_BAD_HAPPINESS_THRESHOLD), 5);
    expect(tier).toBe(FORTUNE_BAD_TIER_CEILING);
  });

  it('never raises an already-bad base tier when happiness is low', () => {
    const tier = calculateFortuneTier(makeStore(10), 1);
    expect(tier).toBe(1);
  });

  it('is a pure function: does not mutate the store object it receives', () => {
    const store = makeStore(90);
    const snapshot = JSON.stringify(store);
    calculateFortuneTier(store, 1);
    expect(JSON.stringify(store)).toBe(snapshot);
  });

  it("today's dailyFortuneLock overrides the base tier before the happiness adjustment", () => {
    const today = new Date().toISOString().split('T')[0];
    const store = makeStore(50, { date: today, baseTier: 4, isRescued: false });
    expect(calculateFortuneTier(store, 1)).toBe(4);
  });
});

describe('getMockFortuneText', () => {
  it('returns different flavor text per tier bucket', () => {
    expect(getMockFortuneText(4, '甲', '子')).toMatch(/최고의 하루/);
    expect(getMockFortuneText(3, '甲', '子')).toMatch(/무난하고 평화로운/);
    expect(getMockFortuneText(1, '甲', '子')).toMatch(/차가운 기운/);
  });
});
