import { migratePetStoreV1toV2 } from '../src/store/petStore';

// 리네임 이전(v1) petStore가 실제로 저장했던 모양의 스냅샷 — 지금 스키마와는 필드명이 다르다.
const legacyV1State = {
  petName: '복실이',
  petTier: 1,
  petStage: 'teen',
  petBirthDate: 1700000000000,
  isDead: false,
  lastCareTime: 1700000500000,
  fullness: 77,
  intimacy: 63,
  cleanliness: 88,
  feedCount: 12,
  playCount: 8,
  cleanCount: 3,
  petCount: 5,
  mbtiScores: { E: 3, I: 1, S: 0, N: 2, T: 1, F: 0, J: 2, P: 0 },
  finalizedMbti: null,
  memorials: [{ name: '별이', mbti: 'ISFJ', score: 120, diedAt: 1690000000000 }],
  dailyFortuneLock: { date: '2026-01-01', baseTier: 3, isRescued: false },
};

describe('migratePetStoreV1toV2 — 스토어 분할/리네임 시 데이터 유실 방지', () => {
  it('carries every legacy stat over to its renamed physical_/spirit_ field', () => {
    const migrated = migratePetStoreV1toV2(legacyV1State);

    expect(migrated.physical_fullness).toBe(77);
    expect(migrated.physical_cleanliness).toBe(88);
    expect(migrated.spirit_intimacy).toBe(63);
    expect(migrated.spirit_mbtiScores).toEqual(legacyV1State.mbtiScores);
  });

  it('preserves identity/lifecycle fields untouched', () => {
    const migrated = migratePetStoreV1toV2(legacyV1State);
    expect(migrated.petName).toBe('복실이');
    expect(migrated.petStage).toBe('teen');
    expect(migrated.petBirthDate).toBe(legacyV1State.petBirthDate);
    expect(migrated.memorials).toEqual(legacyV1State.memorials);
    expect(migrated.dailyFortuneLock).toEqual(legacyV1State.dailyFortuneLock);
  });

  it('merges legacy playCount + petCount into the new unified spirit_playCount (9번: 놀이 통합 집계)', () => {
    const migrated = migratePetStoreV1toV2(legacyV1State);
    expect(migrated.spirit_playCount).toBe(legacyV1State.playCount + legacyV1State.petCount);
  });

  it('fills brand-new v2-only fields (weight/health/poop/quest/...) with sane defaults instead of leaving them undefined', () => {
    const migrated = migratePetStoreV1toV2(legacyV1State);
    expect(migrated.physical_weight).toBe(50);
    expect(migrated.physical_health).toBe('healthy');
    expect(migrated.env_poopCount).toBe(0);
    expect(migrated.spirit_activeQuest).toBeNull();
    expect(migrated.spirit_happiness).toBe(50);
  });

  it('is resilient to a missing/empty legacy blob (fresh install path)', () => {
    const migrated = migratePetStoreV1toV2(undefined);
    expect(migrated.petName).toBe('Lucky');
    expect(migrated.physical_fullness).toBe(50);
    expect(migrated.memorials).toEqual([]);
  });
});
