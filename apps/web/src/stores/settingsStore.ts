import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_REVIEW_STAGE_DAYS, REVIEW_STAGE_LABELS } from '@study-tracker/core';
import type { BookChapterFormat } from '@/lib/bookNumbering';

export interface NotionBlockOffsets {
  bullet: number;      // 箇条書き
  ol: number;          // 番号付きリスト
  check: number;       // チェックリスト
  h1: number;          // 見出し1
  h2: number;          // 見出し2
  h3: number;          // 見出し3
  h4: number;          // 見出し4
  p: number;           // 段落
  blockquote: number;  // 引用
}

export const DEFAULT_BLOCK_OFFSETS: NotionBlockOffsets = {
  bullet: 0, ol: 0, check: 0,
  h1: 0, h2: 0, h3: 0, h4: 0,
  p: 0, blockquote: 0,
};

interface SettingsState {
  reviewStageDays: number[];
  setReviewStageDays: (days: number[]) => void;
  resetReviewStageDays: () => void;
  notionPlusLayout: 'center' | 'left';
  setNotionPlusLayout: (layout: 'center' | 'left') => void;
  // ブック: 章番号の書式（漢数字「第一章」/ 算用数字「第1章」/ 英語「Chapter 1」/ なし）
  bookChapterFormat: BookChapterFormat;
  setBookChapterFormat: (f: BookChapterFormat) => void;
  // ブック: 本文の見出しに番号（1 / 1.1 …）を表示するか
  bookNumberHeadings: boolean;
  setBookNumberHeadings: (v: boolean) => void;
  // ブック: 見出し番号の文字色（CSS color 文字列）
  bookHeadingNumberColor: string;
  setBookHeadingNumberColor: (c: string) => void;
  // NotionPlus 行間設定
  notionPlusParaLineHeight: number;
  setNotionPlusParaLineHeight: (v: number) => void;
  notionPlusSoftLineHeight: number;
  setNotionPlusSoftLineHeight: (v: number) => void;
  // NotionPlus 書式の位置調整
  notionPlusBlockOffsets: NotionBlockOffsets;
  setNotionPlusBlockOffsets: (offsets: NotionBlockOffsets) => void;
  resetNotionPlusBlockOffsets: () => void;
  // 復習通知時刻 "HH:MM" 形式
  reviewNotificationTime: string;
  setReviewNotificationTime: (time: string) => void;
  // 学習メモ設定
  quickMemoDefaultRows: number;
  setQuickMemoDefaultRows: (n: number) => void;
  // NotionPlus 前回表示ページ
  lastViewedNotionPageId: string | null;
  setLastViewedNotionPageId: (id: string | null) => void;
  // ドラッグハンドル縦オフセット (px)
  dragHandleOffset: number;
  setDragHandleOffset: (n: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      reviewStageDays: [...DEFAULT_REVIEW_STAGE_DAYS],
      setReviewStageDays: (days) => set({ reviewStageDays: days }),
      resetReviewStageDays: () => set({ reviewStageDays: [...DEFAULT_REVIEW_STAGE_DAYS] }),
      notionPlusLayout: 'center',
      setNotionPlusLayout: (layout) => set({ notionPlusLayout: layout }),
      bookChapterFormat: 'kanji',
      setBookChapterFormat: (f) => set({ bookChapterFormat: f }),
      bookNumberHeadings: true,
      setBookNumberHeadings: (v) => set({ bookNumberHeadings: v }),
      bookHeadingNumberColor: '#9ca3af',
      setBookHeadingNumberColor: (c) => set({ bookHeadingNumberColor: c }),
      notionPlusParaLineHeight: 1.7,
      setNotionPlusParaLineHeight: (v) => set({ notionPlusParaLineHeight: v }),
      notionPlusSoftLineHeight: 1.15,
      setNotionPlusSoftLineHeight: (v) => set({ notionPlusSoftLineHeight: v }),
      notionPlusBlockOffsets: { ...DEFAULT_BLOCK_OFFSETS },
      setNotionPlusBlockOffsets: (offsets) => set({ notionPlusBlockOffsets: offsets }),
      resetNotionPlusBlockOffsets: () => set({ notionPlusBlockOffsets: { ...DEFAULT_BLOCK_OFFSETS } }),
      reviewNotificationTime: '08:00',
      setReviewNotificationTime: (time) => set({ reviewNotificationTime: time }),
      quickMemoDefaultRows: 5,
      setQuickMemoDefaultRows: (n) => set({ quickMemoDefaultRows: n }),
      lastViewedNotionPageId: null,
      setLastViewedNotionPageId: (id) => set({ lastViewedNotionPageId: id }),
      dragHandleOffset: 0,
      setDragHandleOffset: (n) => set({ dragHandleOffset: n }),
    }),
    { name: 'study-tracker-settings' }
  )
);

export { REVIEW_STAGE_LABELS };
