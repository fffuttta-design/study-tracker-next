'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useDailyMemoStore } from '@/stores/dailyMemoStore';
import { AddItemDialog } from '@/components/notion/AddItemDialog';

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

  // サイドバーの日付クリックで URL が変わるので searchParams を正規ソースにする
  const urlDate = searchParams.get('date') ?? today;
  const [selectedDate, setSelectedDate] = useState<string>(urlDate);

  // URL 変化を state に反映
  useEffect(() => {
    setSelectedDate(searchParams.get('date') ?? today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('date')]);

  const [currentMemoContent, setCurrentMemoContent] = useState<string>('');
  const [memoReady, setMemoReady] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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

  return (
    <>
    <div className="flex h-full flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📓</span>
            <h1 className="text-sm font-semibold text-gray-800">
              {formatDateHeading(selectedDate)}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{saving ? '保存中...' : '自動保存'}</span>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
              title="NotionPlusを開いて学習アイテムを記録"
            >
              📚 記録
            </button>
          </div>
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

    {addDialogOpen && user && (
      <AddItemDialog uid={user.uid} onClose={() => setAddDialogOpen(false)} />
    )}
    </>
  );
}
