import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV();

const zustandStorage = {
  setItem: (name: string, value: string) => storage.set(name, value),
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name: string) => storage.remove(name),
};

export interface UserProfile {
  name?: string;
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:mm
  gender: '남' | '여';
  phone?: string;
  region?: string;
}

export interface UserState {
  authToken: string | null;
  isOverlayActive: boolean;
  userProfile: UserProfile | null;
  setAuthToken: (token: string) => void;
  setOverlayActive: (active: boolean) => void;
  setUserProfile: (profile: UserProfile) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      authToken: null,
      isOverlayActive: false,
      userProfile: null,
      
      setAuthToken: (token) => set({ authToken: token }),
      setOverlayActive: (active) => set({ isOverlayActive: active }),
      setUserProfile: (profile) => set({ userProfile: profile }),
    }),
    {
      name: 'luckyyum-user-store',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
