import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { useUserStore } from './userStore';

const storage = createMMKV();

const zustandStorage = {
  setItem: (name: string, value: string) => storage.set(name, value),
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name: string) => storage.remove(name),
};

export interface ActivityLog {
  id: string;
  type: 'feed' | 'play' | 'clean' | 'talk' | 'gacha' | 'pet';
  timestamp: number;
  details?: string;
}

export interface DailyDialogueUsage {
  date: string;
  count: number;
  lastDialogueTime: number;
}

export interface ActivityState {
  activityLogs: ActivityLog[];
  dailyDialogueUsage: DailyDialogueUsage | null;
  
  logActivity: (type: ActivityLog['type'], details?: string) => void;
  setDailyDialogueUsage: (usage: DailyDialogueUsage) => void;
  syncLogsToServer: () => Promise<void>;
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      activityLogs: [],
      dailyDialogueUsage: null,
      
      logActivity: (type, details) => set((state) => ({
        activityLogs: [
          ...state.activityLogs,
          { id: Math.random().toString(36).substring(2, 15), type, timestamp: Date.now(), details }
        ]
      })),

      setDailyDialogueUsage: (usage) => set({ dailyDialogueUsage: usage }),

      syncLogsToServer: async () => {
        const state = get();
        if (state.activityLogs.length === 0) return;
        
        const authToken = useUserStore.getState().authToken;
        if (!authToken) return;
        
        try {
          const { sendActivityLogs } = require('../utils/apiClient');
          await sendActivityLogs(authToken, state.activityLogs);
          
          // Clear logs after successful sync
          set({ activityLogs: [] });
          console.log('[activityStore] Successfully synced logs to server.');
        } catch (error) {
          console.error('[activityStore] Sync failed:', error);
        }
      }
    }),
    {
      name: 'luckyyum-activity-store',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
