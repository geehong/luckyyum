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

  // M3 Dialogue & MBTI Personality Formation
  mbtiScores: { E: number; I: number; S: number; N: number; T: number; F: number; J: number; P: number };
  finalizedMbti: string | null;
  dailyDialogueUsage: { date: string; count: number; lastDialogueTime: number } | null;
  petCount: number;
  answerDialogue: (traits: string[]) => void;
  pet: () => void;
  
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

      mbtiScores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
      finalizedMbti: null,
      dailyDialogueUsage: null,
      petCount: 0,

      setUserProfile: (profile) => set({ userProfile: profile }),
      setAuthToken: (token) => set({ authToken: token }),
      setPetName: (name) => set({ petName: name }),
      setPetTier: (tier) => set({ petTier: tier }),
      setOverlayActive: (isActive) => set({ isOverlayActive: isActive }),
      setDailyFortuneLock: (lock) => set({ dailyFortuneLock: lock }),
      
      feed: () => set((state) => {
        if (state.isDead) return {};
        
        // 포만감이 100이면 먹이를 줘도 카운트가 오르지 않음 (무한 클릭 방지)
        if (state.fullness >= 100 && state.petStage !== 'egg') {
          return {}; 
        }

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

        // 성체 전환 시 MBTI 확정(Locking) — 이후에는 mbtiScores가 더 쌓여도 성격이 바뀌지 않음
        let newFinalizedMbti = state.finalizedMbti;
        if (newStage === 'adult' && state.petStage !== 'adult' && !newFinalizedMbti) {
          const { calculateMBTI } = require('../utils/mbtiCalculator');
          newFinalizedMbti = calculateMBTI({ ...state, fullness: newFullness, intimacy: newIntimacy, petStage: newStage });
        }

        return {
          fullness: newFullness,
          intimacy: newIntimacy,
          petStage: newStage,
          lastCareTime: Date.now(),
          feedCount: state.feedCount + 1,
          dailyFortuneLock: newLock,
          finalizedMbti: newFinalizedMbti
        };
      }),
      
      play: () => set((state) => {
        if (state.isDead) return {};
        
        // 친밀도가 100이거나 포만감이 너무 낮으면 놀아줄 수 없음
        if (state.intimacy >= 100 || state.fullness <= 10) {
          return {}; 
        }

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
        
        // 청결도가 이미 100이면 청소해도 카운트 안 오름
        if (state.cleanliness >= 100) {
          return {};
        }

        return { 
          cleanliness: 100, 
          intimacy: Math.min(100, state.intimacy + 5), 
          lastCareTime: Date.now(),
          cleanCount: state.cleanCount + 1
        };
      }),

      answerDialogue: (traits: string[]) => set((state) => {
        if (state.isDead) return {};

        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();
        const usage = state.dailyDialogueUsage && state.dailyDialogueUsage.date === today
          ? state.dailyDialogueUsage
          : { date: today, count: 0, lastDialogueTime: 0 };

        // 스팸 방지: 1시간 쿨타임 + 일일 최대 5회
        if (usage.count >= 5) return {};
        if (usage.lastDialogueTime && now - usage.lastDialogueTime < 60 * 60 * 1000) return {};

        const newMbtiScores = { ...state.mbtiScores };
        traits.forEach((trait) => {
          if (trait in newMbtiScores) {
            (newMbtiScores as Record<string, number>)[trait] += 1;
          }
        });

        return {
          mbtiScores: newMbtiScores,
          dailyDialogueUsage: { date: today, count: usage.count + 1, lastDialogueTime: now }
        };
      }),

      pet: () => set((state) => {
        if (state.isDead) return {};

        // 친밀도가 이미 100이면 쓰다듬어도 카운트 안 오름 (기존 액션들과 동일한 무한클릭 방지 컨벤션)
        if (state.intimacy >= 100) return {};

        return {
          intimacy: Math.min(100, state.intimacy + 5),
          lastCareTime: Date.now(),
          petCount: state.petCount + 1
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
          dailyFortuneLock: null,
          mbtiScores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
          finalizedMbti: null,
          dailyDialogueUsage: null,
          petCount: 0
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
          dailyFortuneLock: null,
          mbtiScores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
          finalizedMbti: null,
          dailyDialogueUsage: null,
          petCount: 0
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
        dailyFortuneLock: null,
        mbtiScores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
        finalizedMbti: null,
        dailyDialogueUsage: null,
        petCount: 0
      })
    }),
    {
      name: 'user-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
