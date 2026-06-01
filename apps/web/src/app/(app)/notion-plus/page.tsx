'use client';

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';

const NotionEditor = dynamic(
  () => import('@/components/editor/NotionEditor').then((m) => ({ default: m.NotionEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[120px] items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    ),
  },
);

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, ensureWorkspace, add, update } = useNotionPageStore();
  const router = useRouter();
  const recordTriggerRef = useRef<(() => void) | null>(null);

  // ワークスペースページを取得（全ページのルートノート）
  const workspacePage = pages.find((p) => p.id === WORKSPACE_ID);

  // ワークスペースが未作成なら作成
  if (!loading && !workspacePage && user) {
    ensureWorkspace(user.uid).catch(() => {});
  }

  // ワークスペースエディタの保存
  const handleSave = useCallback(async (title: string, content: string) => {
    if (!user) return;
    await update(user.uid, WORKSPACE_ID, { title, content });
  }, [user, update]);

  // サブページ作成（エディタ内の /page コマンドから）
  const handleCreateSubPage = useCallback(async () => {
    if (!user) return { id: '', title: '' };
    const page = await add(user.uid, { parentId: WORKSPACE_ID });
    router.push(`/notion-plus/${page.id}`);
    return { id: page.id, title: page.title };
  }, [user, add, router]);

  // 新規ページ作成ボタン
  const handleAdd = async () => {
    if (!user) return;
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  // データ読み込み中
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // ワークスペースページが届くまで待つ（タイミング問題の根本解決）
  // loading=false かつ workspacePage が undefined の場合は ensureWorkspace を待つ
  if (!workspacePage) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-2">
        <h1 className="text-sm font-semibold text-gray-500">📝 NotionPlus</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            ＋ 新規ページ
          </button>
          <Link
            href="/notion-plus/settings"
            className="flex items-center justify-center rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            title="設定"
          >⚙️</Link>
        </div>
      </div>

      {/* コンテンツ全体をひとつのスクロール領域に */}
      <div className="flex-1 overflow-y-auto">
        {/* ワークスペースエディタ（自由に書けるノート） */}
        <NotionEditor
          key={WORKSPACE_ID}
          initialTitle={workspacePage.title || 'NotionPlus'}
          initialContent={workspacePage.content}
          onSave={handleSave}
          hideTitle
          compact
          onCreateSubPage={handleCreateSubPage}
          recordTriggerRef={recordTriggerRef}
          notionPageId={WORKSPACE_ID}
          onPageNavigate={(href) => {
            const id = href.match(/\/notion-plus\/([^/?#]+)/)?.[1];
            if (id) router.push(`/notion-plus/${id}`);
          }}
        />

      </div>
    </div>
  );
}
