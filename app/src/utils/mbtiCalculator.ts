import { PetState } from '../store/petStore';
import { computeCareQualityIndex } from './careQuality';

export const calculateMBTI = (state: PetState): string => {
  // 성체 전환 시 이미 확정된 MBTI가 있으면 그대로 반환 (재계산으로 성격이 흔들리지 않도록)
  if (state.spirit_finalizedMbti) return state.spirit_finalizedMbti;

  const { feedCount, playCount, cleanCount, spirit_mbtiScores: mbtiScores } = state;
  const totalActions = feedCount + playCount + cleanCount;
  const totalDialogueScore = Object.values(mbtiScores).reduce((a, b) => a + b, 0);

  if (totalActions === 0 && totalDialogueScore === 0) return 'ISFJ'; // Default baby pet

  // 대화(mbtiScores)가 1차 판단 기준. 동점일 때만 케어 품질 지수를 2차 가중치(타이브레이커)로 사용.
  const pick = (a: string, b: string, tiebreak: string) => {
    if (mbtiScores[a] === mbtiScores[b]) return tiebreak;
    return mbtiScores[a] > mbtiScores[b] ? a : b;
  };

  // 1번 섹션: J/P 타이브레이커는 그 순간 스냅샷(intimacy>50 && fullness>50) 대신
  // computeCareQualityIndex()로 계산한, 케어 이력이 누적 반영된 훈육도를 사용한다.
  const daysElapsed = state.petBirthDate ? Math.floor((Date.now() - state.petBirthDate) / (1000 * 60 * 60 * 24)) : 0;
  const windowDays = Math.max(daysElapsed - state.physical_lastCheckpointDay, 1);
  const careQualityAverage = computeCareQualityIndex({
    windowDays,
    mealLog: state.spirit_mealLog,
    cleanLog: state.env_cleanLog,
    playCountInWindow: state.spirit_playCountSinceCheckpoint,
    weight: state.physical_weight,
    questResponseTimesMs: state.spirit_questResponseLog,
  }) / windowDays;

  const isE = pick('E', 'I', playCount > (feedCount + cleanCount) / 2 ? 'E' : 'I') === 'E';
  const isS = pick('S', 'N', cleanCount > totalActions * 0.2 ? 'S' : 'N') === 'S';
  const isT = pick('T', 'F', feedCount > playCount ? 'T' : 'F') === 'T';
  const isJ = pick('J', 'P', careQualityAverage > 25 ? 'J' : 'P') === 'J';

  return `${isE ? 'E' : 'I'}${isS ? 'S' : 'N'}${isT ? 'T' : 'F'}${isJ ? 'J' : 'P'}`;
};
