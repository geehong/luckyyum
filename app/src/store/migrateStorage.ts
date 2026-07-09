import { createMMKV } from 'react-native-mmkv';
import { useUserStore } from './userStore';
import { usePetStore } from './petStore';
import { useActivityStore } from './activityStore';

const storage = createMMKV();

export function migrateOldStorage() {
  const oldDataStr = storage.getString('user-storage');
  if (!oldDataStr) {
    return; // Already migrated or fresh install
  }

  try {
    const parsed = JSON.parse(oldDataStr);
    const oldState = parsed.state || {};

    // 1. Extract User Store data
    if (oldState.authToken !== undefined || oldState.isOverlayActive !== undefined || oldState.userProfile !== undefined) {
      useUserStore.setState({
        authToken: oldState.authToken ?? null,
        isOverlayActive: oldState.isOverlayActive ?? false,
        userProfile: oldState.userProfile ?? null,
      });
    }

    // 2. Extract Pet Store data — physical_/spirit_/env_ 리네임된 스키마로 이관.
    // (petStore 자체의 persist version:2 migrate가 luckyyum-pet-store 안의 리네임은 처리하지만,
    //  이 함수는 그보다 더 예전의 단일 user-storage 키에서 넘어오는 경우를 처리한다)
    if (oldState.petStage) {
      const defaultMbtiScores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
      usePetStore.setState({
        petName: oldState.petName ?? 'Lucky',
        petStage: oldState.petStage,
        petTier: oldState.petTier ?? 1,
        physical_fullness: oldState.fullness ?? 50,
        spirit_intimacy: oldState.intimacy ?? 50,
        physical_cleanliness: oldState.cleanliness ?? 100,
        lastCareTime: oldState.lastCareTime ?? Date.now(),
        isDead: oldState.isDead ?? false,
        feedCount: oldState.feedCount ?? 0,
        playCount: oldState.playCount ?? 0,
        cleanCount: oldState.cleanCount ?? 0,
        petCount: oldState.petCount ?? 0,
        spirit_playCount: (oldState.playCount ?? 0) + (oldState.petCount ?? 0),
        spirit_mbtiScores: oldState.mbtiScores ?? defaultMbtiScores,
        mbtiScores: oldState.mbtiScores ?? defaultMbtiScores,
        spirit_finalizedMbti: oldState.finalizedMbti ?? null,
        memorials: oldState.memorials ?? [],
        dailyFortuneLock: oldState.dailyFortuneLock ?? null,
      });
    }

    // 3. Extract Activity Store data (dailyDialogueUsage was in old store)
    if (oldState.dailyDialogueUsage) {
      useActivityStore.setState({
        dailyDialogueUsage: oldState.dailyDialogueUsage
      });
    }

    console.log('[migrateStorage] Successfully migrated from legacy user-storage.');
    
    // 4. Remove old storage to prevent re-migration
    storage.remove('user-storage');
  } catch (e) {
    console.error('[migrateStorage] Failed to migrate old storage:', e);
  }
}
