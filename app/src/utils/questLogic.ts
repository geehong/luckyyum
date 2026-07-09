// LuckyYamProjectRebuildPlan.md 9번(펫 퀘스트) + 10번(MBTI→행동) 섹션.
// dialogues.json과 동일한 "JSON 콘텐츠 뱅크 + 조건부 랜덤 선택" 패턴. 원조 다마고치의
// "관심 호출(콜)" 메커니즘에 해당 — 만료되면 보상 없이 사라진다.
import {
  FULLNESS_LOW,
  HAPPINESS_SICK_THRESHOLD,
  CLEANLINESS_DIRTY,
  POOP_NEGLECT_THRESHOLD_COUNT,
  NEGLECT_WARNING_HOURS,
  QUEST_SPAWN_PROBABILITY,
  QUEST_SPAWN_WEIGHT_E,
  QUEST_SPAWN_WEIGHT_I,
  QUEST_EXPIRY_HOURS,
} from '../config/gameBalance';

export type QuestTrigger =
  | 'fullness_low'
  | 'play_neglected'
  | 'happiness_low'
  | 'cleanliness_low'
  | 'poop_high'
  | 'vaccine_due';

// 11번 섹션: 청소/목욕/예방접종/놀아주기/쓰다듬기는 이제 상시 버튼이 아니라 이 5개 액션만
// 퀘스트로 해결 가능 (giveMedicine은 이미 "아플 때만" 조건부 상시 버튼이라 대상에서 제외).
export type QuestResolveAction = 'feed' | 'play' | 'pet' | 'bathe' | 'clean' | 'vaccinate';

export interface QuestDef {
  id: string;
  trigger: QuestTrigger;
  text: string;
  resolveAction: QuestResolveAction;
  mbtiAffinity?: string[];
}

export interface QuestTriggerContext {
  fullness: number;
  happiness: number;
  cleanliness: number;
  poopCount: number;
  hoursSinceLastPlay: number | null;
  vaccinatedUntil: number | null;
  now: number;
}

function isTriggered(quest: QuestDef, ctx: QuestTriggerContext): boolean {
  switch (quest.trigger) {
    case 'fullness_low':
      return ctx.fullness < FULLNESS_LOW;
    case 'play_neglected':
      return ctx.hoursSinceLastPlay !== null && ctx.hoursSinceLastPlay >= NEGLECT_WARNING_HOURS;
    case 'happiness_low':
      return ctx.happiness < HAPPINESS_SICK_THRESHOLD;
    case 'cleanliness_low':
      return ctx.cleanliness < CLEANLINESS_DIRTY;
    case 'poop_high':
      return ctx.poopCount >= POOP_NEGLECT_THRESHOLD_COUNT;
    case 'vaccine_due':
      return ctx.vaccinatedUntil === null || ctx.now > ctx.vaccinatedUntil;
    default:
      return false;
  }
}

export function getEligibleQuests(quests: QuestDef[], ctx: QuestTriggerContext): QuestDef[] {
  return quests.filter((q) => isTriggered(q, ctx));
}

// 10번 섹션: MBTI가 "말투"뿐 아니라 "행동"(퀘스트 선택)에도 영향을 주도록 —
// 확정된 MBTI와 mbtiAffinity가 일치하는 퀘스트를 우선 선택한다.
export function pickQuest(
  quests: QuestDef[],
  ctx: QuestTriggerContext,
  finalizedMbti: string | null,
  random: () => number = Math.random,
): QuestDef | null {
  const eligible = getEligibleQuests(quests, ctx);
  if (eligible.length === 0) return null;

  if (finalizedMbti) {
    const affinityMatch = eligible.filter((q) => q.mbtiAffinity?.includes(finalizedMbti));
    if (affinityMatch.length > 0) {
      return affinityMatch[Math.floor(random() * affinityMatch.length)];
    }
  }
  return eligible[Math.floor(random() * eligible.length)];
}

// 10번 섹션: E형은 자주 말 걺(스폰확률 가중), I형은 덜 보챔.
export function getQuestSpawnProbability(finalizedMbti: string | null): number {
  if (finalizedMbti?.startsWith('E')) return QUEST_SPAWN_PROBABILITY * QUEST_SPAWN_WEIGHT_E;
  if (finalizedMbti?.startsWith('I')) return QUEST_SPAWN_PROBABILITY * QUEST_SPAWN_WEIGHT_I;
  return QUEST_SPAWN_PROBABILITY;
}

export function isQuestExpired(spawnedAt: number, now: number): boolean {
  return now - spawnedAt >= QUEST_EXPIRY_HOURS * 60 * 60 * 1000;
}
