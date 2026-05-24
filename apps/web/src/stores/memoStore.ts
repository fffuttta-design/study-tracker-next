import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { subscribeCol, upsertDoc, deleteDocById } from '@study-tracker/firebase';

export interface Memo {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface MemoState {
  memos: Memo[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string) => Promise<Memo>;
  update: (uid: string, id: string, data: Partial<Memo>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
}

export const useMemoStore = create<MemoState>((set) => ({
  memos: [],
  loading: true,

  subscribe: (uid) => {
    return subscribeCol<Memo>(uid, 'memos', (memos) => {
      set({ memos, loading: false });
    });
  },

  add: async (uid) => {
    const now = new Date().toISOString();
    const memo: Memo = {
      id: uuidv4(),
      title: '',
      content: '',
      order: Date.now(),
      createdAt: now,
      updatedAt: now,
    };
    await upsertDoc(uid, 'memos', memo.id, memo as unknown as Record<string, unknown>);
    return memo;
  },

  update: async (uid, id, data) => {
    const updated = { ...data, updatedAt: new Date().toISOString() };
    await upsertDoc(uid, 'memos', id, updated as Record<string, unknown>);
  },

  remove: async (uid, id) => {
    await deleteDocById(uid, 'memos', id);
  },
}));
