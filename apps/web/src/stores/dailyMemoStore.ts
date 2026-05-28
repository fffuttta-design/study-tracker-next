import { create } from 'zustand';
import { subscribeCol, upsertDoc } from '@study-tracker/firebase';
import { type DailyMemo } from '@study-tracker/core';

interface DailyMemoState {
  memos: DailyMemo[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  getOrCreate: (uid: string, date: string) => Promise<DailyMemo>;
  update: (uid: string, date: string, content: string) => Promise<void>;
}

export const useDailyMemoStore = create<DailyMemoState>((set, get) => ({
  memos: [],
  loading: true,

  subscribe: (uid) => {
    return subscribeCol<DailyMemo>(uid, 'dailyMemos', (memos) => {
      set({ memos, loading: false });
    });
  },

  getOrCreate: async (uid, date) => {
    const existing = get().memos.find((m) => m.id === date);
    if (existing) return existing;

    const now = new Date().toISOString();
    const memo: DailyMemo = { id: date, content: '', createdAt: now, updatedAt: now };
    await upsertDoc(uid, 'dailyMemos', date, memo as unknown as Record<string, unknown>);
    return memo;
  },

  update: async (uid, date, content) => {
    await upsertDoc(uid, 'dailyMemos', date, {
      content,
      updatedAt: new Date().toISOString(),
    } as Record<string, unknown>);
  },
}));
