'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, ensureWorkspace, add } = useNotionPageStore();
  const router = useRouter();

  // ワークスペースが未作成なら作成（初回のみ）
  useEffect(() => {
    if (!user || loading) return;
    ensureWorkspace(user.uid).catch(() => {});
  }, [user, loading, ensureWorkspace]);

  const roots = pages
    .filter((p) => !p.parentId && p.id !== WORKSPACE_ID)
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.order - b.order;
    });

  const handleAdd = async () => {
    if (!user) return;
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">📝 NotionPlus</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          ＋ 新規ページ
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : roots.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-gray-400">
          <span className="text-4xl">📄</span>
          <p className="text-sm">ページがありません。「＋ 新規ページ」で作成しましょう。</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {roots.map((page) => (
            <li key={page.id}>
              <Link
                href={`/notion-plus/${page.id}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                {(page.icon ?? '').startsWith('http') || (page.icon ?? '').startsWith('data:')
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={page.icon} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
                  : <span className="text-base leading-none">{page.icon || '📄'}</span>
                }
                <span className="flex-1 truncate">{page.title || '無題'}</span>
                {page.isFavorite && <span className="text-xs text-yellow-500">★</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
