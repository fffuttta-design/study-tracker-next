'use client';

import { useCallback, useEffect, useRef } from 'react';
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
  const hasWorkspace = !!workspacePage;
  const uid = user?.uid;

  // 親ページ一覧（ルートレベルのページ、ワークスペース除く）
  const rootPages = pages
    .filter((p) => !p.parentId && p.id !== WORKSPACE_ID)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // ワークスペースが未作成なら作成。
  // deps に boolean と uid を使い、オブジェクト参照変化による多重実行を防ぐ
  useEffect(() => {
    if (!loading && !hasWorkspace && uid) {
      ensureWorkspace(uid).catch((err) => console.error('[NotionPlus] workspace作成失敗:', err));
    }
  // ensureWorkspace は Zustand の安定参照のため deps 省略
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasWorkspace, uid]);

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

      {/* 親ページ一覧 */}
      {rootPages.length > 0 && (
        <div className="shrink-0 border-b border-gray-100 px-6 py-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">ページ</p>
          <div className="flex flex-wrap gap-2">
            {rootPages.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/notion-plus/${p.id}`)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {p.icon && (
                  p.icon.startsWith('http') || p.icon.startsWith('data:')
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.icon} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
                    : <span className="shrink-0 text-base leading-none">{p.icon}</span>
                )}
                <span className="max-w-[160px] truncate font-medium">{p.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ワークスペースエディタ（フルページ・自由に書けるノート） */}
      <div className="flex min-h-0 flex-1 flex-col">
        <NotionEditor
          key={WORKSPACE_ID}
          initialTitle={workspacePage.title || 'NotionPlus'}
          initialContent={workspacePage.content}
          onSave={handleSave}
          hideTitle
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
