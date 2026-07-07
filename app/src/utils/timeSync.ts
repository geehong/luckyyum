import { useUserStore } from '../store/userStore';

export const syncOfflineTime = () => {
  const store = useUserStore.getState();
  if (store.isDead) return;

  const now = Date.now();
  const lastTime = store.lastCareTime;
  
  if (lastTime > 0 && lastTime < now) {
    const diffMs = now - lastTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    
    // 1시간이라도 지났으면 스탯 깎기 적용
    if (diffHours >= 1) {
      store.applyDegradation(diffHours);
      console.log(`[TimeSync] Offline for ${diffHours.toFixed(2)} hours. Stats degraded.`);
    }
  }
};

// 테스트를 위한 시간 여행 함수
export const timeTravelForward = (hours: number) => {
  const store = useUserStore.getState();
  if (store.isDead) return;
  
  store.applyDegradation(hours);
  console.log(`[TimeSync] Time traveled ${hours} hours forward.`);
};
