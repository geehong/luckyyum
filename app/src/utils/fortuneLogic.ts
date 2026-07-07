import { UserState } from '../store/userStore';

export const calculateFortuneTier = (store: UserState, baseSajuTier: number): number => {
  const { fullness, intimacy, dailyFortuneLock } = store;
  
  // 1. 일일 락이 걸려있는지 확인
  const today = new Date().toISOString().split('T')[0];
  let currentTier = baseSajuTier;
  
  if (dailyFortuneLock && dailyFortuneLock.date === today) {
    currentTier = dailyFortuneLock.baseTier;
  }
  
  // 2. 바닥 방어 로직 (돌봄 우수 시)
  // 기획: 포만감>70 && 친밀도>60 이면 운세 등급 최소 3 보장
  if (fullness > 70 && intimacy > 60) {
    currentTier = Math.max(currentTier, 3);
  }
  
  return currentTier;
};

// SQLite DB 모킹 - 실제로는 op-sqlite에서 가져오는 데이터를 모킹
export const getMockFortuneText = (tier: number, dayMaster: string, monthBranch: string): string => {
  if (tier >= 4) {
    return `오늘 ${dayMaster}목 친구의 기운이 하늘을 찌릅니다! 최고의 하루!`;
  } else if (tier === 3) {
    return `무난하고 평화로운 하루입니다. 낮잠 자기에 딱 좋아요.`;
  } else {
    return `으으... ${monthBranch}월의 차가운 기운 때문에 조금 힘든 날이에요. 따뜻하게 돌봐주세요!`;
  }
};
