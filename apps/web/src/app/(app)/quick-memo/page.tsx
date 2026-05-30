'use client';

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
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
  hasContent: boolean;
  content: string;
  isOpen: boolean;
  onToggle: () => void;
  onSave: (_title: string, content: string) => Promise<void>;
}

const DateSection = forwardRef<HTMLDivElement, DateSectionProps>(function DateSection(
  { date, isToday, hasContent, content, isOpen, onToggle, onSave },
  ref,
) {
  const [editorKey, setEditorKey] = useState(0);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) setEditorKey((k) => k + 1);
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <div ref={ref} className="border-b border-gray-100 last:border-0">
      {/* セクションヘッダー */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-gray-50"
      >
        <span className="shrink-0 text-[10px] text-gray-300 transition-transform duration-150"
          style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>
          ▶
        </span>
        <span className={`shrink-0 text-xs font-semibold ${
          hasContent ? 'text-red-500' : isToday ? 'text-brand-500' : 'text-gray-400'
        }`}>
          {formatDateHeading(date)}
        </span>
        {isToday && (
          <span className="shrink-0 rounded bg-brand-500 px-1 py-0.5 text-[10px] text-white">今日</span>
        )}
      </button>

      {/* エディタ（展開時のみ） */}
      {isOpen && (
        <div className="px-2 pb-4">
          <NotionEditor
            key={editorKey}
            initialTitle=""
            initialContent={content}
            onSave={onSave}
            hideTitle
          />
        </div>
      )}
    </div>
  );
});

// ── メインページ ──────────────────────────────────────────────────────

export default function QuickMemoPage() {
  const { user } = useAuthStore();
  const { memos, loading, update } = useDailyMemoStore();
  const router = useRouter();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const today = toLocalDateString(new Date());

  // 表示する日付一覧（今日 + 内容のある日のみ、新しい順）
  const allDates = useMemo(() => {
    const datesWithContent = memos
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => m.id);
    const set = new Set([today, ...datesWithContent]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [memos, today]);

  // 展開中の日付セット（デフォルトは今日のみ）
  const [openDates, setOpenDates] = useState<Set<string>>(() => new Set([today]));

  const toggleDate = useCallback((date: string) => {
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/notion-plus')}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              📝 NotionPlus
            </button>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
              title="学習アイテムを記録"
            >
              📚 記録
            </button>
          </div>
        </div>

        {/* 日付リスト */}
        <div className="flex-1 overflow-y-auto">
          {allDates.map((date) => {
            const memo = memos.find((m) => m.id === date);
            const hasContent = !!(memo?.content && memo.content.trim().length > 0);
            return (
              <DateSection
                key={date}
                date={date}
                isToday={date === today}
                hasContent={hasContent}
                content={memo?.content ?? ''}
                isOpen={openDates.has(date)}
                onToggle={() => toggleDate(date)}
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
