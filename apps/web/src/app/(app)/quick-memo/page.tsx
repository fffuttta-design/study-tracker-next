'use client';

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useDailyMemoStore } from '@/stores/dailyMemoStore';
import { AddItemDialog } from '@/components/notion/AddItemDialog';

const NotionEditor = dynamic(
  () => import('@/components/editor/NotionEditor').then((m) => ({ default: m.NotionEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-24 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    ),
  }
);

// ── ユーティリティ ────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${weekdays[d.getDay()]}）`;
}

// ── 日付セクション ────────────────────────────────────────────────────

interface DateSectionProps {
  date: string;
  isToday: boolean;
  content: string;
  onSave: (_title: string, content: string) => Promise<void>;
}

const DateSection = forwardRef<HTMLDivElement, DateSectionProps>(function DateSection(
  { date, isToday, content, onSave },
  ref,
) {
  return (
    <div ref={ref}>
      {/* 日付ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-100 bg-white/95 px-4 py-2 backdrop-blur-sm">
        <span
          className={`text-xs font-semibold ${isToday ? 'text-brand-600' : 'text-gray-500'}`}
        >
          {formatDateHeading(date)}
        </span>
        {isToday && (
          <span className="rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
            今日
          </span>
        )}
      </div>

      {/* エディタ */}
      <div className="px-2 pb-10">
        <NotionEditor
          initialTitle=""
          initialContent={content}
          onSave={onSave}
          hideTitle
        />
      </div>
    </div>
  );
});

// ── メインページ ──────────────────────────────────────────────────────

export default function QuickMemoPage() {
  const { user } = useAuthStore();
  const { memos, loading, update } = useDailyMemoStore();
  const searchParams = useSearchParams();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const today = toLocalDateString(new Date());

  // サイドバーからジャンプしてきた日付
  const jumpDate = searchParams.get('date');

  // 表示する日付一覧（今日 + 内容のある日のみ、新しい順）
  const allDates = useMemo(() => {
    const datesWithContent = memos
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => m.id);
    const set = new Set([today, ...datesWithContent]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [memos, today]);

  // セクションへのスクロール用 refs
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // サイドバー日付クリック → 該当セクションにスクロール
  useEffect(() => {
    if (!jumpDate) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        sectionRefs.current.get(jumpDate)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    });
  }, [jumpDate]);

  const makeSaveHandler = useCallback(
    (date: string) =>
      async (_title: string, content: string) => {
        if (!user) return;
        await update(user.uid, date, content);
      },
    [user, update],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* ページヘッダー */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📓</span>
            <h1 className="text-sm font-semibold text-gray-800">学習メモ</h1>
          </div>
          <button
            onClick={() => setAddDialogOpen(true)}
            className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
            title="学習アイテムを記録"
          >
            📚 記録
          </button>
        </div>

        {/* ノート本体（連続スクロール） */}
        <div className="flex-1 overflow-y-auto">
          {allDates.map((date) => {
            const memo = memos.find((m) => m.id === date);
            return (
              <DateSection
                key={date}
                ref={(el) => {
                  if (el) sectionRefs.current.set(date, el);
                  else sectionRefs.current.delete(date);
                }}
                date={date}
                isToday={date === today}
                content={memo?.content ?? ''}
                onSave={makeSaveHandler(date)}
              />
            );
          })}
        </div>
      </div>

      {addDialogOpen && user && (
        <AddItemDialog uid={user.uid} onClose={() => setAddDialogOpen(false)} />
      )}
    </>
  );
}
