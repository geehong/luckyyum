import { getEligibleQuests, pickQuest, getQuestSpawnProbability, isQuestExpired, QuestDef } from '../src/utils/questLogic';
import { QUEST_SPAWN_PROBABILITY, QUEST_SPAWN_WEIGHT_E, QUEST_SPAWN_WEIGHT_I, QUEST_EXPIRY_HOURS } from '../src/config/gameBalance';

const quests: QuestDef[] = [
  { id: 'q-hungry', trigger: 'fullness_low', text: '배고파요', resolveAction: 'feed' },
  { id: 'q-walk-e', trigger: 'play_neglected', text: '나가요!', resolveAction: 'play', mbtiAffinity: ['ESTP'] },
  { id: 'q-walk-i', trigger: 'play_neglected', text: '조용히 기다릴게요', resolveAction: 'play', mbtiAffinity: ['ISTP'] },
  { id: 'q-mood', trigger: 'happiness_low', text: '기분이 안좋아요', resolveAction: 'pet' },
  { id: 'q-vaccine', trigger: 'vaccine_due', text: '예방접종 맞을 때예요', resolveAction: 'vaccinate' },
];

const NOW = 1_700_000_000_000;
const calmCtx = {
  fullness: 80,
  happiness: 80,
  cleanliness: 80,
  poopCount: 0,
  hoursSinceLastPlay: 0,
  vaccinatedUntil: NOW + 7 * 24 * 60 * 60 * 1000, // 접종 유효기간 중 -> vaccine_due 트리거 안 됨
  now: NOW,
};

describe('getEligibleQuests', () => {
  it('returns nothing when no trigger condition is met', () => {
    expect(getEligibleQuests(quests, calmCtx)).toHaveLength(0);
  });

  it('returns quests whose trigger condition holds', () => {
    const eligible = getEligibleQuests(quests, { ...calmCtx, fullness: 10 });
    expect(eligible.map((q) => q.id)).toEqual(['q-hungry']);
  });

  it('can return multiple eligible quests at once', () => {
    const eligible = getEligibleQuests(quests, { ...calmCtx, hoursSinceLastPlay: 999 });
    expect(eligible.map((q) => q.id).sort()).toEqual(['q-walk-e', 'q-walk-i']);
  });

  it('triggers the vaccine quest when never vaccinated or protection has lapsed (11번)', () => {
    expect(getEligibleQuests(quests, { ...calmCtx, vaccinatedUntil: null }).map((q) => q.id)).toEqual(['q-vaccine']);
    expect(getEligibleQuests(quests, { ...calmCtx, vaccinatedUntil: NOW - 1 }).map((q) => q.id)).toEqual(['q-vaccine']);
    expect(getEligibleQuests(quests, calmCtx)).toHaveLength(0); // 아직 유효기간 중
  });
});

describe('pickQuest', () => {
  it('returns null when nothing is eligible', () => {
    expect(pickQuest(quests, calmCtx, null)).toBeNull();
  });

  it('prefers quests matching the finalized MBTI when multiple are eligible', () => {
    const ctx = { ...calmCtx, hoursSinceLastPlay: 999 };
    const picked = pickQuest(quests, ctx, 'ESTP', () => 0);
    expect(picked?.id).toBe('q-walk-e');
  });

  it('falls back to any eligible quest when MBTI has no affinity match', () => {
    const ctx = { ...calmCtx, fullness: 10 };
    const picked = pickQuest(quests, ctx, 'ESTP', () => 0);
    expect(picked?.id).toBe('q-hungry');
  });
});

describe('getQuestSpawnProbability', () => {
  it('weights E types higher and I types lower than the base rate', () => {
    expect(getQuestSpawnProbability('ENFP')).toBeCloseTo(QUEST_SPAWN_PROBABILITY * QUEST_SPAWN_WEIGHT_E);
    expect(getQuestSpawnProbability('INFP')).toBeCloseTo(QUEST_SPAWN_PROBABILITY * QUEST_SPAWN_WEIGHT_I);
    expect(getQuestSpawnProbability(null)).toBe(QUEST_SPAWN_PROBABILITY);
    expect(getQuestSpawnProbability('ENFP')).toBeGreaterThan(getQuestSpawnProbability('INFP'));
  });
});

describe('isQuestExpired', () => {
  it('is not expired before QUEST_EXPIRY_HOURS have passed', () => {
    const spawnedAt = 0;
    const now = QUEST_EXPIRY_HOURS * 60 * 60 * 1000 - 1;
    expect(isQuestExpired(spawnedAt, now)).toBe(false);
  });

  it('is expired at/after QUEST_EXPIRY_HOURS', () => {
    const spawnedAt = 0;
    const now = QUEST_EXPIRY_HOURS * 60 * 60 * 1000;
    expect(isQuestExpired(spawnedAt, now)).toBe(true);
  });
});
