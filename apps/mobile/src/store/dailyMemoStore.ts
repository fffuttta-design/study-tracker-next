import { create } from 'zustand';
import firestore from '@react-native-firebase/firestore';
import { COLLECTIONS } from '../firebase/config';

export interface DailyMemo {
  id: string;       // YYYY-MM-DD
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface DailyMemoState {
  memos: DailyMemo[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  update: (uid: string, date: string, content: string) => Promise<void>;
}

export const useDailyMemoStore = create<DailyMemoState>(set => ({
  memos: [],
  loading: false,

  subscribe: (uid: string) => {
    set({ loading: true });
    const unsub = firestore()
      .collection(COLLECTIONS.dailyMemos(uid))
      .onSnapshot(
        snap => {
          const memos: DailyMemo[] = snap.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<DailyMemo, 'id'>),
          }));
          set({ memos, loading: false });
        },
        () => set({ loading: false }),
      );
    return unsub;
  },

  update: async (uid: string, date: string, content: string) => {
    const now = new Date().toISOString();
    await firestore()
      .collection(COLLECTIONS.dailyMemos(uid))
      .doc(date)
      .set({ id: date, content, updatedAt: now }, { merge: true });
  },
}));
