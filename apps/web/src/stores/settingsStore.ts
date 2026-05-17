import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_REVIEW_STAGE_DAYS, REVIEW_STAGE_LABELS } from '@study-tracker/core';

interface SettingsState {
  reviewStageDays: number[];
  setReviewStageDays: (days: number[]) => void;
  resetReviewStageDays: () => void;
  notionPlusLayout: 'center' | 'left';
  setNotionPlusLayout: (layout: 'center' | 'left') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      reviewStageDays: [...DEFAULT_REVIEW_STAGE_DAYS],
      setReviewStageDays: (days) => set({ reviewStageDays: days }),
      resetReviewStageDays: () => set({ reviewStageDays: [...DEFAULT_REVIEW_STAGE_DAYS] }),
      notionPlusLayout: 'center',
      setNotionPlusLayout: (layout) => set({ notionPlusLayout: layout }),
    }),
    { name: 'study-tracker-settings' }
  )
);

export { REVIEW_STAGE_LABELS };
