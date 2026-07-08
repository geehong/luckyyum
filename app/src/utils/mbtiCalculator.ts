import { UserState } from '../store/userStore';

export const calculateMBTI = (state: UserState): string => {
  // 성체 전환 시 이미 확정된 MBTI가 있으면 그대로 반환 (재계산으로 성격이 흔들리지 않도록)
  if (state.finalizedMbti) return state.finalizedMbti;

  const { feedCount, playCount, cleanCount, mbtiScores } = state;
  const totalActions = feedCount + playCount + cleanCount;
  const totalDialogueScore = Object.values(mbtiScores).reduce((a, b) => a + b, 0);

  if (totalActions === 0 && totalDialogueScore === 0) return 'ISFJ'; // Default baby pet

  // 대화(mbtiScores)가 1차 판단 기준. 동점일 때만 기존 케어 클릭 횟수를 2차 가중치(타이브레이커)로 사용.
  const pick = (a: keyof UserState['mbtiScores'], b: keyof UserState['mbtiScores'], tiebreak: string) => {
    if (mbtiScores[a] === mbtiScores[b]) return tiebreak;
    return mbtiScores[a] > mbtiScores[b] ? a : b;
  };

  const isE = pick('E', 'I', playCount > (feedCount + cleanCount) / 2 ? 'E' : 'I') === 'E';
  const isS = pick('S', 'N', cleanCount > totalActions * 0.2 ? 'S' : 'N') === 'S';
  const isT = pick('T', 'F', feedCount > playCount ? 'T' : 'F') === 'T';
  const isJ = pick('J', 'P', state.intimacy > 50 && state.fullness > 50 ? 'J' : 'P') === 'J';

  return `${isE ? 'E' : 'I'}${isS ? 'S' : 'N'}${isT ? 'T' : 'F'}${isJ ? 'J' : 'P'}`;
};
