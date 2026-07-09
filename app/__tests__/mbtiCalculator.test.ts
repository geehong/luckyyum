import { calculateMBTI } from '../src/utils/mbtiCalculator';

function makeState(overrides: Record<string, any> = {}) {
  return {
    spirit_finalizedMbti: null,
    feedCount: 0,
    playCount: 0,
    cleanCount: 0,
    spirit_mbtiScores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
    petBirthDate: null,
    physical_lastCheckpointDay: 0,
    spirit_mealLog: [],
    env_cleanLog: [],
    spirit_playCountSinceCheckpoint: 0,
    physical_weight: 50,
    spirit_questResponseLog: [],
    ...overrides,
  } as any;
}

describe('calculateMBTI', () => {
  it('returns the locked finalizedMbti immediately, without recomputation', () => {
    const state = makeState({ spirit_finalizedMbti: 'INTJ', feedCount: 999 });
    expect(calculateMBTI(state)).toBe('INTJ');
  });

  it('defaults to ISFJ for a completely untouched baby pet', () => {
    expect(calculateMBTI(makeState())).toBe('ISFJ');
  });

  it('uses dialogue mbtiScores as the primary signal, ignoring care-action tiebreakers when a trait leads outright', () => {
    const state = makeState({
      feedCount: 1,
      spirit_mbtiScores: { E: 5, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
    });
    expect(calculateMBTI(state)[0]).toBe('E');
  });

  it('falls back to the care-quality index (not a raw stat snapshot) for the J/P tiebreak when dialogue is tied', () => {
    const good = makeState({
      feedCount: 1,
      physical_weight: 50, // 정상범위 가점 + 이상적인 급여 분배 가점 -> 평균 점수 > 25 -> J
      spirit_mealLog: [
        { time: 1, amount: 20, optimalAmount: 20 },
        { time: 2, amount: 20, optimalAmount: 20 },
        { time: 3, amount: 20, optimalAmount: 20 },
      ],
    });
    const bad = makeState({
      feedCount: 1,
      physical_weight: 95, // 과체중 페널티, 급여 로그도 없음 -> 평균 점수 <= 25 -> P
    });
    expect(calculateMBTI(good)[3]).toBe('J');
    expect(calculateMBTI(bad)[3]).toBe('P');
  });

  it('is a pure function: does not mutate the state it receives', () => {
    const state = makeState({ feedCount: 3, playCount: 1 });
    const snapshot = JSON.stringify(state);
    calculateMBTI(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
