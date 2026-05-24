'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useMemoStore } from '@/stores/memoStore';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function MemoListPage() {
  const { user } = useAuthStore();
  const { memos, loading, add, remove } = useMemoStore();
  const router = useRouter();

  const sorted = [...memos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const handleAdd = async () => {
    if (!user) return;
    const memo = await add(user.uid);
    router.push(`/memo/${memo.id}`);
  };

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    if (!confirm('このメモを削除しますか？')) return;
    await remove(user.uid, id);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <span>🗒️</span><span>メモ</span>
        </h1>
        <button
          onClick={handleAdd}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          + 新規メモ
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-4xl">🗒️</p>
          <p className="mt-3 text-sm text-gray-500">メモがまだありません</p>
          <button onClick={handleAdd} className="mt-4 text-sm text-brand-500 hover:underline">
            最初のメモを作成する
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((memo) => (
            <div
              key={memo.id}
              onClick={() => router.push(`/memo/${memo.id}`)}
              className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50"
            >
              <span className="text-lg leading-none">🗒️</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {memo.title || 'Untitled'}
                </p>
                <p className="text-xs text-gray-400">
                  {format(new Date(memo.updatedAt), 'M/d HH:mm', { locale: ja })} 更新
                </p>
              </div>
              <button
                onClick={(e) => handleRemove(e, memo.id)}
                className="shrink-0 px-2 py-0.5 text-xs text-gray-200 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
