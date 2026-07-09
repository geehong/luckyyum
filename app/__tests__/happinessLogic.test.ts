import { computeHappinessTarget } from '../src/utils/happinessLogic';

describe('computeHappinessTarget', () => {
  const healthy = {
    fullness: 60,
    cleanliness: 80,
    intimacy: 60,
    isSick: false,
    weight: 50,
  };

  it('returns a high target when every input stat is healthy', () => {
    const target = computeHappinessTarget(healthy);
    expect(target).toBeGreaterThan(60);
  });

  it('clamps to the 0-100 range', () => {
    const worst = computeHappinessTarget({
      fullness: 0,
      cleanliness: 0,
      intimacy: 0,
      isSick: true,
      weight: 100,
    });
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(100);

    const best = computeHappinessTarget({
      fullness: 60,
      cleanliness: 100,
      intimacy: 100,
      isSick: false,
      weight: 50,
    });
    expect(best).toBeLessThanOrEqual(100);
  });

  it('drops sharply when sick, holding everything else constant', () => {
    const sick = computeHappinessTarget({ ...healthy, isSick: true });
    const notSick = computeHappinessTarget({ ...healthy, isSick: false });
    expect(sick).toBeLessThan(notSick);
  });

  it('is monotonic in cleanliness (dirtier never scores better)', () => {
    const dirty = computeHappinessTarget({ ...healthy, cleanliness: 10 });
    const clean = computeHappinessTarget({ ...healthy, cleanliness: 90 });
    expect(dirty).toBeLessThan(clean);
  });

  it('penalizes out-of-range weight', () => {
    const normalWeight = computeHappinessTarget({ ...healthy, weight: 50 });
    const overweight = computeHappinessTarget({ ...healthy, weight: 95 });
    expect(overweight).toBeLessThan(normalWeight);
  });
});
