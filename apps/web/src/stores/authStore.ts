'use client';

import { create } from 'zustand';
import { type User } from 'firebase/auth';
import { onAuthChanged, signInWithGoogle, signOutUser } from '@study-tracker/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  init: () => () => void; // returns unsubscribe
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  signIn: async () => {
    await signInWithGoogle();
  },

  signOut: async () => {
    await signOutUser();
    set({ user: null });
  },

  init: () => {
    return onAuthChanged((user) => {
      set({ user, loading: false });
    });
  },
}));
