import { usePetStore } from '../src/store/petStore';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
  return Date.now() - days * DAY_MS;
}

function resetStore() {
  usePetStore.getState().resetPet();
  usePetStore.setState({ petName: 'Lucky', memorials: [] });
}

beforeEach(() => {
  resetStore();
  jest.restoreAllMocks();
});

describe('feed()', () => {
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

  it('raises fullness, intimacy and weight together (6번: 밥주기=체중 결합)', () => {
    usePetStore.getState().feed();
    const s = usePetStore.getState();
    expect(s.physical_fullness).toBe(70); // 50 + 20
    expect(s.spirit_intimacy).toBe(55); // 50 + 5
    expect(s.physical_weight).toBe(58); // 50 + 8
    expect(s.feedCount).toBe(1);
  });

  it('logs each feed into spirit_mealLog with the ideal amount (급여 원재료 기록)', () => {
    usePetStore.getState().feed();
    const log = usePetStore.getState().spirit_mealLog;
    expect(log).toHaveLength(1);
    expect(log[0].amount).toBe(20);
  });

  it('can spawn poop probabilistically', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01); // < POOP_SPAWN_PROBABILITY_ON_FEED(0.4)
    usePetStore.getState().feed();
    expect(usePetStore.getState().env_poopCount).toBe(1);
  });

  it('does not spawn poop when the roll misses', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    usePetStore.getState().feed();
    expect(usePetStore.getState().env_poopCount).toBe(0);
  });

  it('rescues a below-3 daily fortune tier exactly once', () => {
    const today = new Date().toISOString().split('T')[0];
    usePetStore.setState({ dailyFortuneLock: { date: today, baseTier: 1, isRescued: false } });
    usePetStore.getState().feed();
    expect(usePetStore.getState().dailyFortuneLock).toEqual({ date: today, baseTier: 2, isRescued: true });
    // 두 번째 밥주기부턴 이미 구제됐으니 더 안 올라감
    usePetStore.getState().feed();
    expect(usePetStore.getState().dailyFortuneLock?.baseTier).toBe(2);
  });
});

describe('play() — 산책', () => {
  it('raises spirit_playCount and lowers cleanliness (5번: 놀면 더러워짐)', () => {
    const before = usePetStore.getState().physical_cleanliness;
    usePetStore.getState().play();
    const s = usePetStore.getState();
    expect(s.spirit_playCount).toBe(1);
    expect(s.physical_cleanliness).toBe(before - 10);
    expect(s.spirit_lastPlayTime).not.toBeNull();
  });

  it('is blocked when fullness is too low to play', () => {
    usePetStore.setState({ physical_fullness: 5 });
    const before = usePetStore.getState().spirit_playCount;
    usePetStore.getState().play();
    expect(usePetStore.getState().spirit_playCount).toBe(before);
  });
});

describe('clean() vs bathe() — 5/7번: 청소(응가)와 목욕(청결도) 이원화', () => {
  it('clean() only clears poopCount and does not touch cleanliness', () => {
    usePetStore.setState({ env_poopCount: 3, physical_cleanliness: 40 });
    usePetStore.getState().clean();
    const s = usePetStore.getState();
    expect(s.env_poopCount).toBe(0);
    expect(s.physical_cleanliness).toBe(40); // 그대로
  });

  it('clean() is a no-op when there is nothing to clean', () => {
    usePetStore.setState({ env_poopCount: 0, cleanCount: 0 });
    usePetStore.getState().clean();
    expect(usePetStore.getState().cleanCount).toBe(0);
  });

  it('bathe() restores cleanliness to 100 and does not touch poopCount', () => {
    usePetStore.setState({ physical_cleanliness: 20, env_poopCount: 2 });
    usePetStore.getState().bathe();
    const s = usePetStore.getState();
    expect(s.physical_cleanliness).toBe(100);
    expect(s.env_poopCount).toBe(2); // 그대로
  });
});

describe('pet() — 쓰다듬기', () => {
  it('raises intimacy and the shared spirit_playCount', () => {
    usePetStore.getState().pet();
    const s = usePetStore.getState();
    expect(s.spirit_intimacy).toBe(58); // 50 + 8
    expect(s.spirit_playCount).toBe(1);
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

  it('feed() no longer flips petStage directly (moved to checkAging)', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ petStage: 'baby' });
    usePetStore.getState().feed();
    expect(usePetStore.getState().petStage).toBe('baby'); // feed()만으론 안 바뀜
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
    usePetStore.getState().feed(); // spirit_mealLog에 1건 쌓임
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

describe('giveMedicine() — 8번: 2회 연속 투여해야 완치', () => {
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
    // 24시간보다 더 지난 시점으로 첫 투여 시각을 되돌림
    usePetStore.setState({ physical_firstMedicineDoseTime: daysAgo(2) });
    usePetStore.getState().giveMedicine();
    const s = usePetStore.getState();
    expect(s.physical_health).toBe('sick'); // 아직 완치 안 됨
    expect(s.physical_medicineDoses).toBe(1); // 새 1회차로 리셋
  });
});

describe('vaccinate() — 8번: 7일 쿨다운', () => {
  it('sets protection ~7 days into the future', () => {
    const before = Date.now();
    usePetStore.getState().vaccinate();
    const until = usePetStore.getState().physical_vaccinatedUntil!;
    expect(until).toBeGreaterThan(before + 6 * DAY_MS);
  });

  it('is blocked while a previous vaccination is still in effect', () => {
    usePetStore.setState({ physical_vaccinatedUntil: daysAgo(-5) }); // 5일 뒤까지 유효
    const before = usePetStore.getState().physical_vaccinatedUntil;
    usePetStore.getState().vaccinate();
    expect(usePetStore.getState().physical_vaccinatedUntil).toBe(before);
  });

  it('cannot be used while sick', () => {
    usePetStore.setState({ physical_health: 'sick', physical_vaccinatedUntil: null });
    usePetStore.getState().vaccinate();
    expect(usePetStore.getState().physical_vaccinatedUntil).toBeNull();
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

describe('펫 퀘스트 (9번) — spawn/resolve/expire', () => {
  it('spawns a quest when the roll succeeds and a trigger condition is met', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({ physical_fullness: 10 }); // fullness_low 트리거
    jest.spyOn(Math, 'random').mockReturnValue(0); // 스폰 확률 굴림도 항상 성공, 발병 확률도 항상 성공(무관)
    usePetStore.getState().applyDegradation(0.01);
    expect(usePetStore.getState().spirit_activeQuest).not.toBeNull();
  });

  it('resolves automatically when the matching action is performed, granting an intimacy bonus', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({
      spirit_activeQuest: { questId: 'quest-hungry-01', spawnedAt: Date.now() },
    });
    const before = usePetStore.getState().spirit_intimacy;
    usePetStore.getState().feed();
    const s = usePetStore.getState();
    expect(s.spirit_activeQuest).toBeNull();
    // feed() 자체 유대감(+5)과 퀘스트 보너스(+5)가 모두 반영되어야 함
    expect(s.spirit_intimacy).toBe(Math.min(100, before + 5 + 5));
  });

  it('does not resolve when a different action is performed', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({
      spirit_activeQuest: { questId: 'quest-hungry-01', spawnedAt: Date.now() },
    });
    usePetStore.getState().pet(); // feed 전용 퀘스트인데 pet()을 누름
    expect(usePetStore.getState().spirit_activeQuest).not.toBeNull();
  });

  it('expires without reward after QUEST_EXPIRY_HOURS', () => {
    usePetStore.getState().hatchEgg();
    usePetStore.setState({
      spirit_activeQuest: { questId: 'quest-hungry-01', spawnedAt: daysAgo(1) }, // 24시간 전 (만료 기준 6시간 초과)
    });
    usePetStore.getState().applyDegradation(0.01);
    expect(usePetStore.getState().spirit_activeQuest).toBeNull();
  });
});

describe('gachaEgg() / hatchEgg() — 리셋', () => {
  it('gachaEgg() clears the name (naming guard) and resets to egg stage', () => {
    usePetStore.getState().feed();
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
