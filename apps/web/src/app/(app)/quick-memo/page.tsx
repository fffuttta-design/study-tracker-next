'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useDailyMemoStore } from '@/stores/dailyMemoStore';

const NotionEditor = dynamic(
  () => import('@/components/editor/NotionEditor').then((m) => ({ default: m.NotionEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    ),
  }
);

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return '今日';
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${weekdays[d.getDay()]}）`;
}

export default function QuickMemoPage() {
  const { user } = useAuthStore();
  const { memos, loading, getOrCreate, update } = useDailyMemoStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = toLocalDateString(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return searchParams.get('date') ?? today;
  });
  const [currentMemoContent, setCurrentMemoContent] = useState<string>('');
  const [memoReady, setMemoReady] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);

  // 日付リスト: 今日 + メモがある日（降順）
  const memoDateSet = new Set(memos.map((m) => m.id));
  const pastDates = memos
    .map((m) => m.id)
    .filter((d) => d !== today)
    .sort((a, b) => b.localeCompare(a));
  const dateList = [today, ...pastDates];

  // 選択日付変更時にメモをロード
  useEffect(() => {
    if (!user || loading) return;
    setMemoReady(false);

    getOrCreate(user.uid, selectedDate).then((memo) => {
      setCurrentMemoContent(memo.content);
      setMemoReady(true);
      setEditorKey((k) => k + 1);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, user?.uid, loading]);

  const handleSave = useCallback(
    async (_title: string, content: string) => {
      if (!user) return;
      setSaving(true);
      try {
        await update(user.uid, selectedDate, content);
      } finally {
        setSaving(false);
      }
    },
    [user, selectedDate, update]
  );

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    router.replace(`/quick-memo?date=${date}`, { scroll: false });
  };

  return (
    <div className="flex h-full">
      {/* 日付リスト */}
      <div className="flex w-36 shrink-0 flex-col border-r border-gray-100 bg-gray-50">
        <div className="border-b border-gray-100 px-3 py-3">
          <p className="text-xs font-semibold text-gray-500">日付</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-1">
          {dateList.map((date) => {
            const isActive = date === selectedDate;
            const hasContent = memoDateSet.has(date) && memos.find((m) => m.id === date)?.content;
            const isToday = date === today;
            return (
              <button
                key={date}
                onClick={() => handleSelectDate(date)}
                className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs transition-colors ${
                  isActive
                    ? 'bg-white font-semibold text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:bg-white hover:text-gray-800'
                }`}
              >
                {isToday && (
                  <span className="shrink-0 text-[10px] font-bold text-brand-500">●</span>
                )}
                <span className={hasContent ? 'text-gray-800' : 'text-gray-400'}>
                  {formatDateLabel(date, today)}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* エディタエリア */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📓</span>
            <h1 className="text-sm font-semibold text-gray-800">
              {formatDateHeading(selectedDate)}
            </h1>
          </div>
          <span className="text-xs text-gray-400">{saving ? '保存中...' : '自動保存'}</span>
        </div>

        {/* エディタ */}
        {!memoReady || loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : (
          <NotionEditor
            key={editorKey}
            initialTitle=""
            initialContent={currentMemoContent}
            onSave={handleSave}
            hideTitle
          />
        )}
      </div>
    </div>
  );
}
