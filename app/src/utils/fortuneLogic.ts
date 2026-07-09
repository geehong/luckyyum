import { UserProfile } from '../store/userStore';
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

import { PetState } from '../store/petStore';
import {
  FORTUNE_GOOD_HAPPINESS_THRESHOLD,
  FORTUNE_GOOD_TIER_FLOOR,
  FORTUNE_BAD_HAPPINESS_THRESHOLD,
  FORTUNE_BAD_TIER_CEILING,
} from '../config/gameBalance';

// 10번 섹션: 운세는 spirit_happiness(케어 상태 종합 지표)에 의해서만 양방향으로 영향받는다.
// 반대 방향(운세 → 스탯)은 절대 없다 — 이 함수는 순수 함수로, 어떤 스탯도 다시 쓰지 않는다.
export const calculateFortuneTier = (store: PetState, baseSajuTier: number): number => {
  const { spirit_happiness, dailyFortuneLock } = store;

  // 1. 일일 락이 걸려있는지 확인
  const today = new Date().toISOString().split('T')[0];
  let currentTier = baseSajuTier;

  if (dailyFortuneLock && dailyFortuneLock.date === today) {
    currentTier = dailyFortuneLock.baseTier;
  }

  // 2. 양방향 연동: 잘 돌보면 좋은 운세를 보장, 방치하면 나쁜 운세로 눌림
  if (spirit_happiness >= FORTUNE_GOOD_HAPPINESS_THRESHOLD) {
    currentTier = Math.max(currentTier, FORTUNE_GOOD_TIER_FLOOR);
  } else if (spirit_happiness <= FORTUNE_BAD_HAPPINESS_THRESHOLD) {
    currentTier = Math.min(currentTier, FORTUNE_BAD_TIER_CEILING);
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
