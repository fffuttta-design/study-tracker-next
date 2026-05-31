'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
      <div className="flex min-h-[80px] items-center justify-center">
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

  // ── ▼ ワークスペースエディタ切り戻しフラグ ─────────────────────────
  // 【切り戻し手順】この行を  const WORKSPACE_EDITOR = false;  に変えてデプロイ
  const WORKSPACE_EDITOR = true;
  // ──────────────────────────────────────────────────────────────────

  const [editorOpen, setEditorOpen] = useState(true);
  // __workspace__ ページが Firestore から届いたことを確認してからエディタを表示
  const [wsReady, setWsReady] = useState(false);

  const workspacePage = pages.find((p) => p.id === WORKSPACE_ID);

  useEffect(() => {
    if (!user || loading) return;
    ensureWorkspace(user.uid).catch(() => {});
  }, [user, loading, ensureWorkspace]);

  // workspacePage が store に現れたら ready フラグを立てる（以降は永続）
  useEffect(() => {
    if (workspacePage && !wsReady) setWsReady(true);
  }, [workspacePage, wsReady]);

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

  const handleSave = useCallback(async (title: string, content: string) => {
    if (!user) return;
    await update(user.uid, WORKSPACE_ID, { title, content });
  }, [user, update]);

  const handleCreateSubPage = useCallback(async () => {
    if (!user) return { id: '', title: '' };
    const page = await add(user.uid, { parentId: WORKSPACE_ID });
    router.push(`/notion-plus/${page.id}`);
    return { id: page.id, title: page.title };
  }, [user, add, router]);

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ─ ヘッダー ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-3">
        {/* ワークスペース名（クリックでエディタ開閉） */}
        {WORKSPACE_EDITOR ? (
          <button
            onClick={() => setEditorOpen((v) => !v)}
            className="flex items-center gap-2 rounded px-1 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            <span className="text-base leading-none">{workspacePage?.icon || '🏠'}</span>
            <span>{workspacePage?.title || 'NotionPlus'}</span>
            <span className="text-[10px] text-gray-400 ml-1">{editorOpen ? '▲' : '▼'}</span>
          </button>
        ) : (
          <h1 className="text-sm font-semibold text-gray-800">📝 NotionPlus</h1>
        )}

        <button
          onClick={handleAdd}
          className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          ＋ 新規ページ
        </button>
      </div>

      {/* ─ スクロール領域 ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── ▼ ワークスペースエディタ ─────────────────────────────── */}
        {WORKSPACE_EDITOR && editorOpen && (
          <div className="border-b border-gray-100">
            {wsReady && workspacePage ? (
              // workspacePage が Firestore から確実に届いてから NotionEditor を mount
              <NotionEditor
                key={WORKSPACE_ID}
                initialTitle={workspacePage.title}
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
            ) : (
              // 準備中（短時間のみ、workspacePage が届けば自動解除）
              <div className="flex min-h-[60px] items-center gap-2 px-6 py-3 text-xs text-gray-400">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-300 border-t-transparent" />
                <span>読み込み中...</span>
              </div>
            )}
          </div>
        )}
        {/* ── ▲ ワークスペースエディタ ここまで ───────────────────── */}

        {/* ─ ページ一覧 ──────────────────────────────────────────── */}
        <div className="px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">ページ一覧</span>
            {roots.length > 0 && (
              <span className="text-[11px] text-gray-400">{roots.length} 件</span>
            )}
          </div>

          {loading ? (
            <div className="flex h-20 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : roots.length === 0 ? (
            <div className="flex h-20 flex-col items-center justify-center gap-2 text-gray-400">
              <span className="text-3xl">📄</span>
              <p className="text-xs">「＋ 新規ページ」で作成しましょう。</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {roots.map((page) => (
                <li key={page.id}>
                  <Link
                    href={`/notion-plus/${page.id}`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
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

      </div>
    </div>
  );
}
