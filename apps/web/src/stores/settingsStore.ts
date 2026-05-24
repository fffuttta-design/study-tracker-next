import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_REVIEW_STAGE_DAYS, REVIEW_STAGE_LABELS } from '@study-tracker/core';

interface SettingsState {
  reviewStageDays: number[];
  setReviewStageDays: (days: number[]) => void;
  resetReviewStageDays: () => void;
  notionPlusLayout: 'center' | 'left';
  setNotionPlusLayout: (layout: 'center' | 'left') => void;
  // NotionPlus 行間設定
  notionPlusParaLineHeight: number;   // Enter（通常段落）
  setNotionPlusParaLineHeight: (v: number) => void;
  notionPlusSoftLineHeight: number;   // Shift+Enter（ソフト改行）
  setNotionPlusSoftLineHeight: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      reviewStageDays: [...DEFAULT_REVIEW_STAGE_DAYS],
      setReviewStageDays: (days) => set({ reviewStageDays: days }),
      resetReviewStageDays: () => set({ reviewStageDays: [...DEFAULT_REVIEW_STAGE_DAYS] }),
      notionPlusLayout: 'center',
      setNotionPlusLayout: (layout) => set({ notionPlusLayout: layout }),
      notionPlusParaLineHeight: 1.7,
      setNotionPlusParaLineHeight: (v) => set({ notionPlusParaLineHeight: v }),
      notionPlusSoftLineHeight: 1.15,
      setNotionPlusSoftLineHeight: (v) => set({ notionPlusSoftLineHeight: v }),
    }),
    { name: 'study-tracker-settings' }
  )
);

export { REVIEW_STAGE_LABELS };
