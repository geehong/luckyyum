import { UserState } from '../store/userStore';

export const calculateMBTI = (state: UserState): string => {
  const { feedCount, playCount, cleanCount } = state;
  const totalActions = feedCount + playCount + cleanCount;
  
  if (totalActions === 0) return 'ISFJ'; // Default baby pet
  
  // E vs I: Play Activity vs Quiet Feeding
  const isE = playCount > (feedCount + cleanCount) / 2;
  // S vs N: High Routine (Clean) vs Low Routine
  const isS = cleanCount > totalActions * 0.2;
  // T vs F: Feed focused (Logic) vs Play focused (Emotion)
  const isT = feedCount > playCount;
  // J vs P: Consistent interactions (mock logic using intimacy/fullness)
  const isJ = state.intimacy > 50 && state.fullness > 50;
  
  return `${isE ? 'E' : 'I'}${isS ? 'S' : 'N'}${isT ? 'T' : 'F'}${isJ ? 'J' : 'P'}`;
};
