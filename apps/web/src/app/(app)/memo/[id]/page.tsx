'use client';

import { use, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useMemoStore } from '@/stores/memoStore';

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

export default function MemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuthStore();
  const { memos, update, remove } = useMemoStore();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const memo = memos.find((m) => m.id === id);

  const handleSave = useCallback(
    async (title: string, content: string) => {
      if (!user || !memo) return;
      setSaving(true);
      try {
        await update(user.uid, memo.id, { title, content });
      } finally {
        setSaving(false);
      }
    },
    [user, memo, update]
  );

  const handleDelete = async () => {
    if (!user || !memo) return;
    if (!confirm(`「${memo.title || 'Untitled'}」を削除しますか？`)) return;
    await remove(user.uid, memo.id);
    router.replace('/memo');
  };

  if (!memo) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* トップバー */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-2">
        <Link
          href="/memo"
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          ← メモ一覧
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{saving ? '保存中...' : '自動保存'}</span>
          <button
            onClick={handleDelete}
            className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-red-50 hover:text-red-400"
          >
            🗑️ 削除
          </button>
        </div>
      </div>

      {/* エディタ */}
      <NotionEditor
        key={memo.id}
        initialTitle={memo.title}
        initialContent={memo.content}
        onSave={handleSave}
      />
    </div>
  );
}
