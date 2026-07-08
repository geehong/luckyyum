import { UserState, UserProfile } from '../store/userStore';
import { getManseryeokData } from './manseryeok';

// 프로필 정보를 바탕으로 오늘의 베이스 사주 등급을 계산 (1~5)
export const generateTodayBaseTier = (profile: UserProfile): number => {
  if (!profile) return 3; // 기본값
  
  const [year, month, day] = profile.birthDate.split('-').map(Number);
  const [hour, minute] = profile.birthTime.split(':').map(Number);
  
  try {
    const sajuData = getManseryeokData({
      year, month, day, hour, minute, gender: profile.gender
    });
    
    // 임시 로직: 일간(Day Master)과 오늘의 날짜를 해싱하여 1~5 등급 도출
    // 실제로는 오행 상생상극이나 더 복잡한 로직이 들어갈 수 있음
    const today = new Date().toISOString().split('T')[0];
    let hash = 0;
    const str = sajuData.dayMaster + today;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const tier = (Math.abs(hash) % 5) + 1;
    return tier;
  } catch (e) {
    console.error("Failed to calculate saju tier", e);
    return 3;
  }
};

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
