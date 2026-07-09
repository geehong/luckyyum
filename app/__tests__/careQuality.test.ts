import { computeCareQualityIndex, gradeFromAverageScore, speciesFromGrade, evaluateEvolution } from '../src/utils/careQuality';

describe('computeCareQualityIndex', () => {
  const baseWindow = {
    windowDays: 1,
    mealLog: [] as { time: number; amount: number }[],
    cleanLog: [] as { time: number; dirtinessBefore: number }[],
    playCountInWindow: 0,
    weight: 50,
    questResponseTimesMs: [] as number[],
  };

  it('gives the max meal score for ideal 3-meals/day distribution at the ideal amount', () => {
    const score = computeCareQualityIndex({
      ...baseWindow,
      mealLog: [
        { time: 1, amount: 20 },
        { time: 2, amount: 20 },
        { time: 3, amount: 20 },
      ],
    });
    // 30(밥) + play 부족분 비례(0) + weight 정상(+10) = 40
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it('penalizes cleaning when done while barely dirty', () => {
    const clean = computeCareQualityIndex({
      ...baseWindow,
      cleanLog: [{ time: 1, dirtinessBefore: 10 }], // CLEANLINESS_DIRTY(30) 미만인데 청소
    });
    const noClean = computeCareQualityIndex({ ...baseWindow });
    expect(clean).toBeLessThan(noClean);
  });

  it('rewards cleaning when genuinely dirty', () => {
    const score = computeCareQualityIndex({
      ...baseWindow,
      cleanLog: [{ time: 1, dirtinessBefore: 80 }], // CLEANLINESS_OK(70) 이상
    });
    expect(score).toBeGreaterThan(computeCareQualityIndex(baseWindow));
  });

  it('penalizes out-of-range weight and rewards in-range weight', () => {
    const normal = computeCareQualityIndex({ ...baseWindow, weight: 50 });
    const overweight = computeCareQualityIndex({ ...baseWindow, weight: 90 });
    expect(normal).toBeGreaterThan(overweight);
  });

  it('rewards fast quest responses', () => {
    const fast = computeCareQualityIndex({ ...baseWindow, questResponseTimesMs: [30 * 60 * 1000] }); // 30분
    const slow = computeCareQualityIndex({ ...baseWindow, questResponseTimesMs: [5 * 60 * 60 * 1000] }); // 5시간
    const none = computeCareQualityIndex({ ...baseWindow });
    expect(fast).toBeGreaterThan(none);
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('gradeFromAverageScore', () => {
  it('classifies into poor/normal/good per thresholds', () => {
    expect(gradeFromAverageScore(0)).toBe('poor');
    expect(gradeFromAverageScore(14.9)).toBe('poor');
    expect(gradeFromAverageScore(15)).toBe('normal');
    expect(gradeFromAverageScore(35)).toBe('normal');
    expect(gradeFromAverageScore(35.1)).toBe('good');
  });
});

describe('speciesFromGrade / evaluateEvolution', () => {
  it('maps each grade to a distinct species (Option A reuse of existing 3 species)', () => {
    expect(speciesFromGrade('good')).toBe('dragon');
    expect(speciesFromGrade('normal')).toBe('fly');
    expect(speciesFromGrade('poor')).toBe('bear');
  });

  it('evaluateEvolution ties grade and species together consistently', () => {
    const result = evaluateEvolution({
      windowDays: 5,
      mealLog: [],
      cleanLog: [],
      playCountInWindow: 0,
      weight: 20, // 저체중 페널티만
      questResponseTimesMs: [],
    });
    expect(result.grade).toBe('poor');
    expect(result.species).toBe(speciesFromGrade(result.grade));
  });
});
