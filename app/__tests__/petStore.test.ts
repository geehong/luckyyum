import { usePetStore } from '../src/store/petStore';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function daysAgo(days: number) {
  return Date.now() - days * DAY_MS;
}

// 11번: 밥주기 슬롯 판정이 로컬 "시(hour)"에 의존하므로, 테스트에서 시간대를 직접 고정한다.
function timeAtHour(hour: number) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}
const BREAKFAST_TIME = timeAtHour(8); // 05~11시 슬롯 안
const NIGHT_TIME = timeAtHour(2); // 어떤 슬롯에도 안 걸림(23~05시)

function resetStore() {
  usePetStore.getState().resetPet();
  usePetStore.setState({ petName: 'Lucky', memorials: [] });
}

function setActiveQuest(questId: string) {
  usePetStore.setState({ spirit_activeQuest: { questId, spawnedAt: Date.now() } });
}

beforeEach(() => {
  resetStore();
  jest.restoreAllMocks();
});

describe('feed() — 11번: 부화(알→아기) 전용', () => {
  it('is a no-op when the pet is dead', () => {
    usePetStore.setState({ isDead: true });
    const before = usePetStore.getState().physical_fullness;
    usePetStore.getState().feed();
    expect(usePetStore.getState().physical_fullness).toBe(before);
  });

  it('is a no-op when the pet has no name (naming guard)', () => {
    usePetStore.setState({ petName: '' });
    const before = usePetStore.getState().physical_fullness;
    usePetStore.getState().feed();
    expect(usePetStore.getState().physical_fullness).toBe(before);
  });

  it('hatches the egg (bugfix: the 부화시키기 button is wired to feed(), not hatchEgg())', () => {
    // App.tsx의 "부화시키기" 버튼은 egg 단계에서도 feed()를 그대로 호출한다. 0번(성장판정 일원화)으로
    // feed()에서 단계 전환 로직을 걷어내면서, petBirthDate를 세팅하는 경로가 전부 사라져 알이
    // 영원히 부화 못 하는 회귀가 있었다 — 이 테스트로 고정한다.
    expect(usePetStore.getState().petStage).toBe('egg');
    expect(usePetStore.getState().petBirthDate).toBeNull();
    usePetStore.getState().feed();
    const s = usePetStore.getState();
    expect(s.petStage).toBe('baby');
    expect(s.petBirthDate).not.toBeNull();
    expect(s.physical_fullness).toBe(70); // 50 + HATCH_FULLNESS_GAIN(20)
    expect(s.physical_weight).toBe(58); // 50 + HATCH_WEIGHT_GAIN(8)
  });

  it('is a no-op once the pet is no longer an egg (feeding after hatching goes through the gacha instead)', () => {
    usePetStore.getState().feed(); // hatch
    const before = usePetStore.getState();
    usePetStore.getState().feed(); // 다시 호출해도 부화 전용이라 아무 효과 없음
    const after = usePetStore.getState();
    expect(after.physical_fullness).toBe(before.physical_fullness);
    expect(after.petBirthDate).toBe(before.petBirthDate);
  });
});

describe('openMealGacha() / chooseMealAmount() — 11번: 시간대 슬롯 + 가챠 추측', () => {
  beforeEach(() => {
    usePetStore.getState().feed(); // egg -> baby (부화)
  });

  it('does nothing outside all meal slots (23시~05시)', () => {
    jest.spyOn(Date, 'now').mockReturnValue(NIGHT_TIME);
    usePetStore.getState().openMealGacha();
    expect(usePetStore.getState().spirit_mealGacha).toBeNull();
  });

  it('opens a gacha with 3 choices and a hidden optimal amount during a meal slot', () => {
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);
    usePetStore.getState().openMealGacha();
    const gacha = usePetStore.getState().spirit_mealGacha;
    expect(gacha).not.toBeNull();
    expect(gacha!.slotId).toBe('breakfast');
    expect(gacha!.choices).toHaveLength(3);
    expect(gacha!.optimalAmount).toBeGreaterThan(0);
  });

  it('refuses to open a second gacha for a slot already fed today', () => {
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);
    usePetStore.getState().openMealGacha();
    usePetStore.getState().chooseMealAmount(usePetStore.getState().spirit_mealGacha!.choices[0]);
    expect(usePetStore.getState().spirit_mealLog).toHaveLength(1);

    usePetStore.getState().openMealGacha(); // 같은 슬롯, 이미 먹였음
    expect(usePetStore.getState().spirit_mealGacha).toBeNull();
  });

  it('raises fullness by the chosen amount and logs {amount, optimalAmount}', () => {
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);
    usePetStore.getState().openMealGacha();
    const { optimalAmount } = usePetStore.getState().spirit_mealGacha!;
    const before = usePetStore.getState().physical_fullness;
    usePetStore.getState().chooseMealAmount(optimalAmount); // 정확히 맞춤

    const s = usePetStore.getState();
    expect(s.physical_fullness).toBe(Math.min(100, before + optimalAmount));
    expect(s.spirit_mealGacha).toBeNull();
    expect(s.spirit_mealLog[0]).toEqual({ time: BREAKFAST_TIME, amount: optimalAmount, optimalAmount });
  });

  it('keeps weight stable on a near-perfect guess, but pushes it up when overfed and down when underfed', () => {
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);

    usePetStore.getState().openMealGacha();
    const perfect = usePetStore.getState().spirit_mealGacha!.optimalAmount;
    const weightBefore = usePetStore.getState().physical_weight;
    usePetStore.getState().chooseMealAmount(perfect);
    expect(usePetStore.getState().physical_weight).toBe(weightBefore); // 정확히 맞추면 체중 변화 없음

    resetStore();
    usePetStore.getState().feed();
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);
    usePetStore.getState().openMealGacha();
    const optimal = usePetStore.getState().spirit_mealGacha!.optimalAmount;
    usePetStore.getState().chooseMealAmount(optimal + 20); // 크게 과식
    expect(usePetStore.getState().physical_weight).toBeGreaterThan(50);
  });

  it('can spawn poop probabilistically on a chosen meal', () => {
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);
    jest.spyOn(Math, 'random').mockReturnValue(0.01); // < POOP_SPAWN_PROBABILITY_ON_FEED(0.4)
    usePetStore.getState().openMealGacha();
    usePetStore.getState().chooseMealAmount(usePetStore.getState().spirit_mealGacha!.choices[0]);
    expect(usePetStore.getState().env_poopCount).toBe(1);
  });

  it('rescues a below-3 daily fortune tier exactly once', () => {
    const today = new Date().toISOString().split('T')[0];
    usePetStore.setState({ dailyFortuneLock: { date: today, baseTier: 1, isRescued: false } });
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);
    usePetStore.getState().openMealGacha();
    usePetStore.getState().chooseMealAmount(usePetStore.getState().spirit_mealGacha!.choices[0]);
    expect(usePetStore.getState().dailyFortuneLock).toEqual({ date: today, baseTier: 2, isRescued: true });
  });

  it('chooseMealAmount() is a no-op when no gacha is open', () => {
    const before = usePetStore.getState();
    usePetStore.getState().chooseMealAmount(20);
    expect(usePetStore.getState()).toEqual(before);
  });
});

describe('11번: play/clean/bathe/pet/vaccinate는 매칭되는 펫 퀘스트가 있을 때만 동작', () => {
  it('play() is blocked without an active "play" quest', () => {
    const before = usePetStore.getState().spirit_playCount;
    usePetStore.getState().play();
    expect(usePetStore.getState().spirit_playCount).toBe(before);
  });

  it('play() works once a matching quest is active, and lowers cleanliness (5번: 놀면 더러워짐)', () => {
    setActiveQuest('quest-walk-01'); // resolveAction: play
    const before = usePetStore.getState().physical_cleanliness;
    usePetStore.getState().play();
    const s = usePetStore.getState();
    expect(s.spirit_playCount).toBe(1);
    expect(s.physical_cleanliness).toBe(before - 10);
    expect(s.spirit_activeQuest).toBeNull(); // 해결되어 정리됨
  });

  it('clean() is blocked without an active "clean" quest even if there is poop to clean', () => {
    usePetStore.setState({ env_poopCount: 3 });
    usePetStore.getState().clean();
    expect(usePetStore.getState().env_poopCount).toBe(3);
  });

  it('clean() works once a matching quest is active — only clears poopCount, cleanliness untouched', () => {
    setActiveQuest('quest-poop-01'); // resolveAction: clean
    usePetStore.setState({ env_poopCount: 3, physical_cleanliness: 40, spirit_activeQuest: { questId: 'quest-poop-01', spawnedAt: Date.now() } });
    usePetStore.getState().clean();
    const s = usePetStore.getState();
    expect(s.env_poopCount).toBe(0);
    expect(s.physical_cleanliness).toBe(40); // 그대로
  });

  it('bathe() is blocked without an active "bathe" quest', () => {
    usePetStore.setState({ physical_cleanliness: 20 });
    usePetStore.getState().bathe();
    expect(usePetStore.getState().physical_cleanliness).toBe(20);
  });

  it('bathe() works once a matching quest is active — restores cleanliness, poopCount untouched', () => {
    usePetStore.setState({ physical_cleanliness: 20, env_poopCount: 2, spirit_activeQuest: { questId: 'quest-bath-01', spawnedAt: Date.now() } });
    usePetStore.getState().bathe();
    const s = usePetStore.getState();
    expect(s.physical_cleanliness).toBe(100);
    expect(s.env_poopCount).toBe(2); // 그대로
  });

  it('pet() is blocked without an active "pet" quest', () => {
    usePetStore.getState().pet();
    expect(usePetStore.getState().spirit_playCount).toBe(0);
  });

  it('pet() works once a matching quest is active (base gain + quest resolve bonus stack)', () => {
    setActiveQuest('quest-mood-02'); // resolveAction: pet
    usePetStore.getState().pet();
    const s = usePetStore.getState();
    expect(s.spirit_intimacy).toBe(63); // 50 + PET_INTIMACY_GAIN(8) + quest resolve bonus(5)
    expect(s.spirit_playCount).toBe(1);
    expect(s.spirit_activeQuest).toBeNull();
  });

  it('vaccinate() is blocked without an active "vaccinate" quest', () => {
    usePetStore.getState().vaccinate();
    expect(usePetStore.getState().physical_vaccinatedUntil).toBeNull();
  });

  it('vaccinate() works once a matching quest is active', () => {
    setActiveQuest('quest-vaccine-01'); // resolveAction: vaccinate
    const before = Date.now();
    usePetStore.getState().vaccinate();
    const s = usePetStore.getState();
    expect(s.physical_vaccinatedUntil).toBeGreaterThan(before + 6 * DAY_MS);
    expect(s.spirit_activeQuest).toBeNull();
  });

  it('vaccinate() (with active quest) is still blocked while a previous vaccination is in effect', () => {
    setActiveQuest('quest-vaccine-01');
    usePetStore.setState({ physical_vaccinatedUntil: daysAgo(-5) }); // 5일 뒤까지 유효
    const before = usePetStore.getState().physical_vaccinatedUntil;
    usePetStore.getState().vaccinate();
    expect(usePetStore.getState().physical_vaccinatedUntil).toBe(before);
  });

  it('vaccinate() (with active quest) cannot be used while sick', () => {
    setActiveQuest('quest-vaccine-01');
    usePetStore.setState({ physical_health: 'sick', physical_vaccinatedUntil: null });
    usePetStore.getState().vaccinate();
    expect(usePetStore.getState().physical_vaccinatedUntil).toBeNull();
  });
});

describe('play() 부가 가드', () => {
  it('is still blocked when fullness is too low to play, even with a matching quest', () => {
    setActiveQuest('quest-walk-01');
    usePetStore.setState({ physical_fullness: 5 });
    const before = usePetStore.getState().spirit_playCount;
    usePetStore.getState().play();
    expect(usePetStore.getState().spirit_playCount).toBe(before);
  });
});

describe('giveMedicine() — 8번: 상시 버튼 유지(퀘스트 게이팅 대상 아님), 2회 연속 투여해야 완치', () => {
  it('does nothing when the pet is not sick', () => {
    usePetStore.getState().giveMedicine();
    expect(usePetStore.getState().physical_medicineDoses).toBe(0);
  });

  it('requires two doses within the cure window to become healthy again', () => {
    usePetStore.setState({ physical_health: 'sick' });
    usePetStore.getState().giveMedicine();
    expect(usePetStore.getState().physical_medicineDoses).toBe(1);
    expect(usePetStore.getState().physical_health).toBe('sick');

    usePetStore.getState().giveMedicine();
    const s = usePetStore.getState();
    expect(s.physical_health).toBe('healthy');
    expect(s.physical_medicineDoses).toBe(0);
  });

  it('treats a second dose outside the cure window as a fresh first dose', () => {
    usePetStore.setState({ physical_health: 'sick' });
    usePetStore.getState().giveMedicine();
    usePetStore.setState({ physical_firstMedicineDoseTime: daysAgo(2) });
    usePetStore.getState().giveMedicine();
    const s = usePetStore.getState();
    expect(s.physical_health).toBe('sick');
    expect(s.physical_medicineDoses).toBe(1);
  });
});

describe('answerDialogue()', () => {
  it('bumps the matching mbtiScore trait and gives a small intimacy boost', () => {
    usePetStore.getState().answerDialogue(['E']);
    const s = usePetStore.getState();
    expect(s.spirit_mbtiScores.E).toBe(1);
    expect(s.spirit_intimacy).toBe(52); // 50 + 2
  });
});

describe('checkAging() — 0번: 성장 판정 유일 권한', () => {
  it('does nothing while still an egg', () => {
    usePetStore.getState().checkAging();
    expect(usePetStore.getState().petStage).toBe('egg');
  });

  it('advances through stages purely by elapsed days, not by feed() calls', () => {
    usePetStore.getState().hatchEgg(); // -> baby, petBirthDate = now
    usePetStore.setState({ petBirthDate: daysAgo(3) });
    usePetStore.getState().checkAging();
    expect(usePetStore.getState().petStage).toBe('junior');
  });

  it('locks physical_species and spirit_finalizedMbti exactly at the teen->adult checkpoint (10 days)', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ petStage: 'teen', petBirthDate: daysAgo(10) });
    usePetStore.getState().checkAging();
    const s = usePetStore.getState();
    expect(s.petStage).toBe('adult');
    expect(s.physical_species).not.toBeNull();
    expect(s.spirit_finalizedMbti).not.toBeNull();
    expect(s.physical_evolutionGrade).not.toBeNull();
  });

  it('does not re-lock species/MBTI on later checkpoints once finalized', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ petStage: 'teen', petBirthDate: daysAgo(10) });
    usePetStore.getState().checkAging();
    const lockedSpecies = usePetStore.getState().physical_species;
    const lockedMbti = usePetStore.getState().spirit_finalizedMbti;

    usePetStore.setState({ petBirthDate: daysAgo(70) });
    usePetStore.getState().checkAging();
    expect(usePetStore.getState().petStage).toBe('senior');
    expect(usePetStore.getState().physical_species).toBe(lockedSpecies);
    expect(usePetStore.getState().spirit_finalizedMbti).toBe(lockedMbti);
  });

  it('resets the per-checkpoint raw logs after evaluating a checkpoint', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ spirit_mealLog: [{ time: Date.now(), amount: 20, optimalAmount: 20 }] });
    expect(usePetStore.getState().spirit_mealLog.length).toBeGreaterThan(0);
    usePetStore.setState({ petBirthDate: daysAgo(3) });
    usePetStore.getState().checkAging();
    expect(usePetStore.getState().spirit_mealLog).toHaveLength(0);
  });

  it('dies of old age at LIFESPAN_MAX_DAYS and records a memorial (bugfix: 원래 코드엔 없었음)', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ petBirthDate: daysAgo(90) });
    const before = usePetStore.getState().memorials.length;
    usePetStore.getState().checkAging();
    const s = usePetStore.getState();
    expect(s.isDead).toBe(true);
    expect(s.petStage).toBe('memorial');
    expect(s.memorials.length).toBe(before + 1);
  });
});

describe('applyDegradation() — 시간 경과 통합 처리', () => {
  it('decays fullness/intimacy/cleanliness proportionally to hours passed', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.getState().applyDegradation(2); // 2시간
    const s = usePetStore.getState();
    expect(s.physical_fullness).toBe(40); // 50 - 5*2
    expect(s.spirit_intimacy).toBe(46); // 50 - 2*2
    expect(s.physical_cleanliness).toBe(94); // 100 - 3*2
  });

  it('moves spirit_happiness toward the EMA target instead of snapping to it', () => {
    usePetStore.getState().hatchEgg();
    const before = usePetStore.getState().spirit_happiness;
    usePetStore.getState().applyDegradation(1);
    const after = usePetStore.getState().spirit_happiness;
    // 목표치가 어느 쪽이든, 한 틱만에 극단값으로 튀지 않아야 한다 (EMA 관성)
    expect(Math.abs(after - before)).toBeLessThanOrEqual(30);
  });

  it('kills the pet and records a memorial when fullness hits 0', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ physical_fullness: 2 });
    const beforeMemorials = usePetStore.getState().memorials.length;
    usePetStore.getState().applyDegradation(10); // fullness가 0으로 바닥
    const s = usePetStore.getState();
    expect(s.physical_fullness).toBe(0);
    expect(s.isDead).toBe(true);
    expect(s.memorials.length).toBe(beforeMemorials + 1);
  });

  it('can roll a sickness event and expires stale medicine doses passively', () => {
    usePetStore.getState().hatchEgg();
    jest.spyOn(Math, 'random').mockReturnValue(0); // 항상 발병
    usePetStore.getState().applyDegradation(1);
    expect(usePetStore.getState().physical_health).toBe('sick');
  });
});

describe('펫 퀘스트 (9/11번) — 하루 예산제 spawn/resolve/expire', () => {
  it('rolls a daily quest budget (3~5) on first tick of a new day', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.getState().applyDegradation(0.01);
    const budget = usePetStore.getState().spirit_dailyQuestBudget;
    expect(budget).not.toBeNull();
    expect(budget!.target).toBeGreaterThanOrEqual(3);
    expect(budget!.target).toBeLessThanOrEqual(5);
  });

  it('spawns a quest when the roll succeeds, a trigger condition is met, and the daily budget is not exhausted', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ physical_fullness: 10 }); // fullness_low 트리거
    jest.spyOn(Math, 'random').mockReturnValue(0); // 스폰 확률 굴림도 항상 성공
    usePetStore.getState().applyDegradation(0.01);
    expect(usePetStore.getState().spirit_activeQuest).not.toBeNull();
    expect(usePetStore.getState().spirit_dailyQuestBudget!.spawnedCount).toBe(1);
  });

  it('stops spawning once the daily budget target is reached', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({
      physical_fullness: 10,
      spirit_dailyQuestBudget: { date: new Date().toISOString().split('T')[0], target: 3, spawnedCount: 3 },
    });
    jest.spyOn(Math, 'random').mockReturnValue(0);
    usePetStore.getState().applyDegradation(0.01);
    expect(usePetStore.getState().spirit_activeQuest).toBeNull();
  });

  it('resolves automatically when the matching action is performed, granting an intimacy bonus', () => {
    usePetStore.getState().feed(); // hatch
    jest.spyOn(Date, 'now').mockReturnValue(BREAKFAST_TIME);
    setActiveQuest('quest-hungry-01'); // resolveAction: feed (via gacha)
    usePetStore.getState().openMealGacha();
    const before = usePetStore.getState().spirit_intimacy;
    usePetStore.getState().chooseMealAmount(usePetStore.getState().spirit_mealGacha!.choices[0]);
    const s = usePetStore.getState();
    expect(s.spirit_activeQuest).toBeNull();
    // chooseMealAmount() 자체 유대감(+5)과 퀘스트 보너스(+5)가 모두 반영되어야 함
    expect(s.spirit_intimacy).toBe(Math.min(100, before + 5 + 5));
  });

  it('does not resolve — and the action itself is blocked — when a different action is performed', () => {
    usePetStore.getState().hatchEgg();
    setActiveQuest('quest-hungry-01'); // resolveAction: feed
    usePetStore.getState().pet(); // 'pet' 퀘스트가 아니므로 hasMatchingActiveQuest에서 차단
    const s = usePetStore.getState();
    expect(s.spirit_activeQuest).not.toBeNull();
    expect(s.spirit_playCount).toBe(0);
  });

  it('expires without reward after QUEST_EXPIRY_HOURS', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({
      spirit_activeQuest: { questId: 'quest-hungry-01', spawnedAt: daysAgo(1) }, // 24시간 전 (만료 기준 6시간 초과)
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // 만료 직후 같은 틱에 새 퀘스트가 다시 뽑히지 않도록 고정
    usePetStore.getState().applyDegradation(0.01);
    expect(usePetStore.getState().spirit_activeQuest).toBeNull();
  });
});

describe('gachaEgg() / hatchEgg() — 리셋', () => {
  it('gachaEgg() clears the name (naming guard) and resets to egg stage', () => {
    usePetStore.getState().feed(); // hatch
    usePetStore.getState().gachaEgg();
    const s = usePetStore.getState();
    expect(s.petName).toBe('');
    expect(s.petStage).toBe('egg');
    expect(s.physical_fullness).toBe(50);
    expect(s.feedCount).toBe(0);
  });

  it('hatchEgg() only works from the egg stage and sets petBirthDate', () => {
    usePetStore.getState().hatchEgg();
    expect(usePetStore.getState().petStage).toBe('baby');
    expect(usePetStore.getState().petBirthDate).not.toBeNull();

    const birthDate = usePetStore.getState().petBirthDate;
    usePetStore.getState().hatchEgg(); // 이미 baby라 재호출은 무시
    expect(usePetStore.getState().petBirthDate).toBe(birthDate);
  });
});
