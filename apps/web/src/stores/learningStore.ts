'use client';

import { create } from 'zustand';
import { type LearningItem, createReviews, DEFAULT_REVIEW_STAGE_DAYS } from '@study-tracker/core';
import { subscribeCol, upsertDoc, deleteDocById } from '@study-tracker/firebase';
import { v4 as uuidv4 } from 'uuid';

interface LearningState {
  items: LearningItem[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string, data: Omit<LearningItem, 'id' | 'reviews' | 'createdAt'>) => Promise<void>;
  update: (uid: string, id: string, data: Partial<LearningItem>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
}

export const useLearningStore = create<LearningState>((set) => ({
  items: [],
  loading: true,

  subscribe: (uid) => {
    return subscribeCol<LearningItem>(uid, 'learningItems', (items) => {
      set({ items, loading: false });
    });
  },

  add: async (uid, data) => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const item: LearningItem = {
      id,
      ...data,
      reviews: createReviews(data.dateKey, DEFAULT_REVIEW_STAGE_DAYS),
      createdAt: now,
    };
    await upsertDoc(uid, 'learningItems', id, item as unknown as Record<string, unknown>);
  },

  update: async (uid, id, data) => {
    await upsertDoc(uid, 'learningItems', id, data as Record<string, unknown>);
  },

  remove: async (uid, id) => {
    await deleteDocById(uid, 'learningItems', id);
  },
}));
