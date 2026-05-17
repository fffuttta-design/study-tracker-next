'use client';

import { create } from 'zustand';
import { type LearningCategory } from '@study-tracker/core';
import { subscribeCol, upsertDoc, deleteDocById } from '@study-tracker/firebase';
import { v4 as uuidv4 } from 'uuid';

interface CategoryState {
  categories: LearningCategory[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string, data: Omit<LearningCategory, 'id'>) => Promise<void>;
  update: (uid: string, id: string, data: Partial<LearningCategory>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set) => ({
  categories: [],
  loading: true,

  subscribe: (uid) => {
    return subscribeCol<LearningCategory>(uid, 'categories', (items) => {
      set({ categories: items, loading: false });
    });
  },

  add: async (uid, data) => {
    const id = uuidv4();
    const item: LearningCategory = { id, ...data };
    await upsertDoc(uid, 'categories', id, item as unknown as Record<string, unknown>);
  },

  update: async (uid, id, data) => {
    await upsertDoc(uid, 'categories', id, data as Record<string, unknown>);
  },

  remove: async (uid, id) => {
    await deleteDocById(uid, 'categories', id);
  },
}));
