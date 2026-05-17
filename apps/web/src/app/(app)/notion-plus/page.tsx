'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { type NotionPage } from '@study-tracker/core';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, add, remove } = useNotionPageStore();
  const router = useRouter();

  const roots = pages
    .filter((p) => !p.parentId)
    .sort((a, b) => a.order - b.order);

  const addPage = async () => {
    if (!user) return;
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  if (loading) {
    return <div className="flex justify-center pt-20"><Spinner /></div>;
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">NotionPlus</h1>
        <button
          onClick={addPage}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          + 新規ページ
        </button>
      </div>

      {roots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-4xl">📝</p>
          <p className="mt-3 text-sm text-gray-500">ページがまだありません</p>
          <button onClick={addPage} className="mt-4 text-sm text-brand-500 hover:underline">
            最初のページを作成する
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {roots.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              pages={pages}
              uid={user?.uid ?? ''}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageRow({ page, pages, uid, onRemove }: {
  page: NotionPage;
  pages: NotionPage[];
  uid: string;
  onRemove: (uid: string, id: string) => Promise<void>;
}) {
  const router = useRouter();
  const children = pages.filter((p) => p.parentId === page.id).sort((a, b) => a.order - b.order);

  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 bg-white px-4 py-3 hover:border-gray-200"
        onClick={() => router.push(`/notion-plus/${page.id}`)}
      >
        <span className="text-lg">{page.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-800">
            {page.title || 'Untitled'}
          </p>
          <p className="text-xs text-gray-400">
            {format(new Date(page.updatedAt), 'M/d HH:mm', { locale: ja })} 更新
          </p>
        </div>
        {page.isFavorite && <span className="text-xs text-yellow-400">★</span>}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(uid, page.id); }}
          className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-red-50 hover:text-red-400"
        >
          削除
        </button>
      </div>
      {children.length > 0 && (
        <div className="ml-6 border-l border-gray-100 pl-3">
          {children.map((child) => (
            <PageRow key={child.id} page={child} pages={pages} uid={uid} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
