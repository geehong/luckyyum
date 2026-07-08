import { create } from 'zustand';
import { persist, StateStorage, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV();

const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    return storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    return storage.remove(name);
  },
};

export type PetStage = 'egg' | 'baby' | 'teen' | 'adult' | 'memorial';

export interface UserProfile {
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:mm
  gender: '남' | '여';
}

export interface UserState {
  petName: string;
  petTier: number;
  isOverlayActive: boolean;
  userProfile: UserProfile | null;
  
  // M1-2 Pet Care Stats
  petStage: PetStage;
  fullness: number;     // 0-100
  intimacy: number;     // 0-100
  cleanliness: number;  // 0-100
  lastCareTime: number; // timestamp
  isDead: boolean;
  
  // M1-3 MBTI & Fortune Lock
  feedCount: number;
  playCount: number;
  cleanCount: number;
  dailyFortuneLock: { date: string; baseTier: number; isRescued: boolean } | null;
  
  // M2-1 Server Sync
  authToken: string | null;
  setAuthToken: (token: string | null) => void;
  syncToServer: () => Promise<void>;
  
  // M2-2 Memorials & Gacha
  memorials: Array<{ name: string; mbti: string; score: number; diedAt: number }>;
  hatchEgg: () => void;
  gachaEgg: () => void;
  setUserProfile: (profile: UserProfile) => void;
  
  setPetName: (name: string) => void;
  setPetTier: (tier: number) => void;
  setOverlayActive: (isActive: boolean) => void;
  setDailyFortuneLock: (lock: { date: string; baseTier: number; isRescued: boolean } | null) => void;
  
  // Care Actions
  feed: () => void;
  play: () => void;
  clean: () => void;
  applyDegradation: (hoursPassed: number) => void;
  resetPet: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      petName: 'Lucky',
      petTier: 1,
      isOverlayActive: false,
      userProfile: null,
      
      petStage: 'egg',
      fullness: 50,
      intimacy: 50,
      cleanliness: 100,
      lastCareTime: Date.now(),
      isDead: false,
      
      feedCount: 0,
      playCount: 0,
      cleanCount: 0,
      dailyFortuneLock: null,
      authToken: null,
      memorials: [],

      setUserProfile: (profile) => set({ userProfile: profile }),
      setAuthToken: (token) => set({ authToken: token }),
      setPetName: (name) => set({ petName: name }),
      setPetTier: (tier) => set({ petTier: tier }),
      setOverlayActive: (isActive) => set({ isOverlayActive: isActive }),
      setDailyFortuneLock: (lock) => set({ dailyFortuneLock: lock }),
      
      feed: () => set((state) => {
        if (state.isDead) return {};
        const newFullness = Math.min(100, state.fullness + 20);
        const newIntimacy = Math.min(100, state.intimacy + 5);
        // 포만감이 차오르면 진화(임시 로직)
        let newStage = state.petStage;
        if (newStage === 'egg') newStage = 'baby';
        else if (newStage === 'baby' && newFullness > 70) newStage = 'teen';
        else if (newStage === 'teen' && newFullness > 90) newStage = 'adult';
        
        // 오탭 구제 로직 (Rescue)
        let newLock = state.dailyFortuneLock;
        if (newLock && !newLock.isRescued && newLock.baseTier < 3) {
          // 첫 접속 후 배고픈 펫에게 밥을 줬다면 운세 1단계 구제
          newLock = { ...newLock, isRescued: true, baseTier: newLock.baseTier + 1 };
        }
        
        return { 
          fullness: newFullness, 
          intimacy: newIntimacy, 
          petStage: newStage,
          lastCareTime: Date.now(),
          feedCount: state.feedCount + 1,
          dailyFortuneLock: newLock
        };
      }),
      
      play: () => set((state) => {
        if (state.isDead) return {};
        const newIntimacy = Math.min(100, state.intimacy + 15);
        const newFullness = Math.max(0, state.fullness - 5);
        return { 
          intimacy: newIntimacy, 
          fullness: newFullness, 
          lastCareTime: Date.now(),
          playCount: state.playCount + 1
        };
      }),
      
      clean: () => set((state) => {
        if (state.isDead) return {};
        return { 
          cleanliness: 100, 
          intimacy: Math.min(100, state.intimacy + 5), 
          lastCareTime: Date.now(),
          cleanCount: state.cleanCount + 1
        };
      }),
      
      applyDegradation: (hoursPassed: number) => set((state) => {
        if (state.isDead || hoursPassed <= 0) return {};
        
        // 1시간당 포만감 -5, 친밀도 -2, 청결도 -3
        const lossFullness = Math.floor(hoursPassed * 5);
        const lossIntimacy = Math.floor(hoursPassed * 2);
        const lossClean = Math.floor(hoursPassed * 3);
        
        const newFullness = Math.max(0, state.fullness - lossFullness);
        const newIntimacy = Math.max(0, state.intimacy - lossIntimacy);
        const newClean = Math.max(0, state.cleanliness - lossClean);
        
        // 사망 판정: 포만감 0이 된 후 추가로 48시간(또는 특정 시간) 방치 시 사망.
        // 현재는 PoC를 위해 포만감이 0이면 즉시 사망(memorial) 처리로 테스트.
        let isDead = false;
        let newStage = state.petStage;
        let newMemorials = state.memorials;
        
        if (newFullness === 0 && !state.isDead) {
            isDead = true;
            newStage = 'memorial';
            
            const { calculateMBTI } = require('../utils/mbtiCalculator');
            const mbti = calculateMBTI(state);
            const careScore = state.feedCount * 10 + state.playCount * 15 + state.cleanCount * 5;
            
            newMemorials = [
              ...state.memorials,
              { name: state.petName, mbti, score: careScore, diedAt: Date.now() }
            ];
        }
        
        return {
          fullness: newFullness,
          intimacy: newIntimacy,
          cleanliness: newClean,
          isDead,
          petStage: newStage,
          memorials: newMemorials,
          lastCareTime: Date.now() // 역산 후 시간 갱신
        };
      }),
      
      syncToServer: async () => {
        const state = get();
        if (!state.authToken) return;
        
        try {
          const { syncRanking } = require('../utils/apiClient');
          const { calculateMBTI } = require('../utils/mbtiCalculator');
          const mbti = calculateMBTI(state);
          const careScore = state.feedCount * 10 + state.playCount * 15 + state.cleanCount * 5;
          
          await syncRanking(state.authToken, {
            pet_nickname: state.petName,
            pet_tier: state.petTier,
            pet_mbti: mbti,
            care_score: careScore
          });
          console.log('[userStore] Successfully synced to server.');
        } catch (error) {
          console.error('[userStore] Sync failed:', error);
        }
      },
      
      hatchEgg: () => set((state) => {
        const petNames = ['행운이', '대박이', '쑥쑥이', '튼튼이', '반짝이', '별이', '사랑이', '복실이', '도담이', '우람이'];
        const randomName = petNames[Math.floor(Math.random() * petNames.length)];
        
        return {
          petName: randomName,
          petStage: 'baby',
          fullness: 50,
          intimacy: 50,
          cleanliness: 100,
          lastCareTime: Date.now(),
          isDead: false,
          feedCount: 0,
          playCount: 0,
          cleanCount: 0,
          dailyFortuneLock: null
        };
      }),
      
      gachaEgg: () => set((state) => {
        const petNames = ['행운이', '대박이', '쑥쑥이', '튼튼이', '반짝이', '별이', '사랑이', '복실이', '도담이', '우람이', '구름이', '보리', '코코', '달이', '해피'];
        const randomName = petNames[Math.floor(Math.random() * petNames.length)];
        
        return {
          petName: randomName,
          petStage: 'egg',
          fullness: 50,
          intimacy: 50,
          cleanliness: 100,
          lastCareTime: Date.now(),
          isDead: false,
          feedCount: 0,
          playCount: 0,
          cleanCount: 0,
          dailyFortuneLock: null
        };
      }),
      
      resetPet: () => set({
        petStage: 'egg',
        fullness: 50,
        intimacy: 50,
        cleanliness: 100,
        lastCareTime: Date.now(),
        isDead: false,
        feedCount: 0,
        playCount: 0,
        cleanCount: 0,
        dailyFortuneLock: null
      })
    }),
    {
      name: 'user-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
