'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type User } from 'firebase/auth';
import { type NotionPage, serializeBookChapters, createBookChapter } from '@study-tracker/core';
import { deleteField } from 'firebase/firestore';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID, addPageLinkToContent, removePageLinkFromContent } from '@/stores/notionPageStore';
import { useElectronVersion } from '@/hooks/useElectronVersion';
import appIcon from '@/app/icon.png';

interface SidebarProps {
  user: User;
}

const NAV = [
  { href: '/learning', label: '学習リスト', icon: '📚' },
  { href: '/notion-plus', label: 'NotionPlus', icon: '📝' },
  { href: '/goals', label: '絶対覚える', icon: '🎯' },
];

function PageIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />;
  }
  return <span className="shrink-0 text-sm leading-none">{icon}</span>;
}

// ページの祖先タイトルを "A › B" 形式で返す
function getAncestorPath(pages: NotionPage[], page: NotionPage): string {
  const parts: string[] = [];
  let current: NotionPage | undefined = page;
  while (current?.parentId && current.parentId !== WORKSPACE_ID) {
    const parent = pages.find((p) => p.id === current!.parentId);
    if (!parent) break;
    parts.unshift(parent.title || 'Untitled');
    current = parent;
  }
  return parts.join(' › ');
}

// ── W4: ページ移動モーダル ───────────────────────────────────────────
function MovePageModal({
  target, pages, uid, onClose,
}: {
  target: NotionPage;
  pages: NotionPage[];
  uid: string;
  onClose: () => void;
}) {
  const { update } = useNotionPageStore();
  const router = useRouter();

  const getDescendantIds = (id: string): string[] => {
    const children = pages.filter((p) => p.parentId === id);
    return children.flatMap((c) => [c.id, ...getDescendantIds(c.id)]);
  };

  const excludeIds = new Set([target.id, WORKSPACE_ID, ...getDescendantIds(target.id)]);
  const validTargets = pages
    .filter((p) => !excludeIds.has(p.id) && p.type !== 'database')
    .sort((a, b) => a.order - b.order);

  const getMaxOrder = (parentId: string | undefined) => {
    const siblings = pages.filter((p) =>
      p.id !== WORKSPACE_ID && p.id !== target.id &&
      (parentId ? p.parentId === parentId : !p.parentId)
    );
    return siblings.reduce((max, p) => Math.max(max, p.order ?? 0), -1) + 1;
  };

  const handleMove = async (parentId: string | undefined) => {
    const oldParentId = target.parentId;

    // 1. ページの parentId を更新
    const data: Record<string, unknown> = { order: getMaxOrder(parentId), updatedAt: new Date().toISOString() };
    if (parentId !== undefined) {
      data.parentId = parentId;
    } else {
      data.parentId = deleteField(); // フィールドを削除してルートに昇格
    }
    await update(uid, target.id, data as Partial<NotionPage>);

    // 2. 旧親ページの content からリンクを削除
    if (oldParentId) {
      const oldParent = pages.find((p) => p.id === oldParentId);
      if (oldParent) {
        const newContent = removePageLinkFromContent(oldParent.content, target.id);
        if (newContent !== oldParent.content) {
          await update(uid, oldParentId, { content: newContent });
        }
      }
    }

    // 3. 新しい親ページの content にリンクを追加
    if (parentId) {
      const newParent = pages.find((p) => p.id === parentId);
      if (newParent) {
        const newContent = addPageLinkToContent(newParent.content, target.id, target.title, target.icon);
        if (newContent !== newParent.content) {
          await update(uid, parentId, { content: newContent });
        }
      }
    }

    onClose();
    router.push(`/notion-plus/${target.id}`);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex w-96 max-h-[70vh] flex-col rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">📁 移動先を選択</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">「{target.title || 'Untitled'}」の移動先</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {/* ルートに移動 */}
          <button
            onClick={() => handleMove(undefined)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50"
          >
            <span>🏠</span>
            <span className="font-medium">ルートに移動（最上位）</span>
            {!target.parentId && <span className="ml-auto text-[10px] text-brand-400">現在</span>}
          </button>
          <div className="mx-4 my-1 border-t border-gray-100" />
          {/* ページ一覧 */}
          {validTargets.map((p) => {
            const path = getAncestorPath(pages, p);
            return (
              <button
                key={p.id}
                onClick={() => handleMove(p.id)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-brand-50 ${
                  p.id === target.parentId ? 'bg-brand-50 text-brand-600' : 'text-gray-700'
                }`}
              >
                <PageIcon icon={p.icon} />
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate font-medium">{p.title || 'Untitled'}</div>
                  {path && <div className="truncate text-[10px] text-gray-400">{path}</div>}
                </div>
                {p.id === target.parentId && (
                  <span className="ml-auto shrink-0 text-[10px] text-brand-400">現在の親</span>
                )}
              </button>
            );
          })}
          {validTargets.length === 0 && (
            <p className="px-4 py-4 text-center text-xs text-gray-400">移動可能なページがありません</p>
          )}
        </div>
      </div>
    </div>
  );
}

// currentId が parentId の子孫かどうかを確認し、直接の子ページIDを返す（BOOKは除外）
function findActiveChild(pages: NotionPage[], parentId: string, currentId: string): string | null {
  for (const p of pages) {
    if (p.parentId !== parentId || p.type === 'book') continue;
    if (p.id === currentId) return p.id;
    const found = findActiveChild(pages, p.id, currentId);
    if (found !== null) return p.id;
  }
  return null;
}

// 現在のページまでのパスを再帰的に表示するコンポーネント
function PageTreeEntry({
  page, pages, currentId, onCtxMenu,
}: {
  page: NotionPage;
  pages: NotionPage[];
  currentId: string | undefined;
  onCtxMenu: (e: React.MouseEvent, page: NotionPage) => void;
}) {
  // ブックはサイドバーツリーに表示しない
  if (page.type === 'book') return null;

  const isActive = page.id === currentId;
  const update = useNotionPageStore((s) => s.update);
  const { user } = useAuthStore();
  const router = useRouter();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    // 並び替えドラッグは無視（application/x-reorder-page-id のみ持つ）
    if (e.dataTransfer.types.includes('application/x-reorder-page-id') &&
        !e.dataTransfer.types.includes('application/x-page-id')) return;
    // application/x-page-id が取れない場合は text/plain にフォールバック
    const droppedPageId =
      e.dataTransfer.getData('application/x-page-id') ||
      e.dataTransfer.getData('text/plain');
    if (!droppedPageId || !user || droppedPageId === page.id) return;
    // UUIDっぽくない文字列（URLなど）は無視
    if (!/^[0-9a-f-]{36}$/.test(droppedPageId)) return;

    const droppedPage = pages.find((p) => p.id === droppedPageId);
    const oldParentId = droppedPage?.parentId;

    // 1. parentId を更新
    await update(user.uid, droppedPageId, { parentId: page.id });

    // 2. 旧親ページの content からリンクを削除
    if (oldParentId) {
      const oldParent = pages.find((p) => p.id === oldParentId);
      if (oldParent) {
        const newContent = removePageLinkFromContent(oldParent.content, droppedPageId);
        if (newContent !== oldParent.content) {
          await update(user.uid, oldParentId, { content: newContent });
        }
      }
    }

    // 3. 新しい親ページ（page）の content にリンクを追加
    if (droppedPage) {
      const newContent = addPageLinkToContent(page.content, droppedPageId, droppedPage.title, droppedPage.icon);
      if (newContent !== page.content) {
        await update(user.uid, page.id, { content: newContent });
      }
    }

    // 移動後に対象ページへ遷移（消えたように見えるのを防止）
    router.push(`/notion-plus/${droppedPageId}`);
  };

  return (
    <div
      onDragOver={(e) => {
        // 並び替えドラッグ中はこの要素をドロップターゲットにしない（DropZone に任せる）
        if (e.dataTransfer.types.includes('application/x-reorder-page-id') &&
            !e.dataTransfer.types.includes('application/x-page-id')) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOver(true);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={handleDrop}
    >
      <Link
        href={`/notion-plus/${page.id}`}
        onContextMenu={(e) => { e.preventDefault(); onCtxMenu(e, page); }}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
          isActive
            ? 'bg-white font-semibold text-gray-900 shadow-sm'
            : isDragOver
              ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300'
              : 'text-gray-600 hover:bg-white hover:text-gray-900'
        }`}
      >
        <PageIcon icon={page.type === 'database' && page.icon === '📄' ? '📊' : page.icon} />
        <span className="min-w-0 flex-1 truncate">{page.title || 'Untitled'}</span>
        {isDragOver && <span className="shrink-0 text-[10px] text-brand-400">↳</span>}
        {!isDragOver && page.isFavorite && <span className="shrink-0 text-[10px] text-yellow-400">★</span>}
      </Link>
    </div>
  );
}

// ── ルートページ並び替えリスト ─────────────────────────────────────────
function RootPageList({
  roots, pages, currentId, onCtxMenu, uid,
}: {
  roots: NotionPage[];
  pages: NotionPage[];
  currentId: string | undefined;
  onCtxMenu: (e: React.MouseEvent, page: NotionPage) => void;
  uid: string;
}) {
  const { update } = useNotionPageStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isDragging = dragId !== null && roots.some((p) => p.id === dragId);

  const handleDragStart = useCallback((e: React.DragEvent, pageId: string) => {
    setDragId(pageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-reorder-page-id', pageId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropIndex(null);
  }, []);

  // コンテナ全体の dragOver でマウスY座標から挿入位置を計算
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-reorder-page-id')) return;
    e.preventDefault();
    e.stopPropagation();

    const mouseY = e.clientY;
    let target = roots.length; // デフォルト: 末尾
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (mouseY < rect.top + rect.height / 2) {
        target = i;
        break;
      }
    }
    setDropIndex(target);
  }, [roots.length]);

  const handleContainerDragLeave = useCallback((e: React.DragEvent) => {
    // コンテナの外に出たときのみクリア（子要素間の移動は無視）
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setDropIndex(null);
    }
  }, []);

  const handleContainerDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const reorderPageId = e.dataTransfer.getData('application/x-reorder-page-id');
    if (!reorderPageId || !uid || dropIndex === null) { setDropIndex(null); setDragId(null); return; }
    const fromIndex = roots.findIndex((p) => p.id === reorderPageId);
    if (fromIndex === -1) { setDropIndex(null); setDragId(null); return; }

    if (dropIndex === fromIndex || dropIndex === fromIndex + 1) {
      setDropIndex(null);
      setDragId(null);
      return;
    }

    const newOrder = [...roots];
    const [moved] = newOrder.splice(fromIndex, 1);
    const insertAt = fromIndex < dropIndex ? dropIndex - 1 : dropIndex;
    newOrder.splice(insertAt, 0, moved);

    await Promise.all(
      newOrder
        .map((p, i) => ({ page: p, newOrder: i }))
        .filter(({ page, newOrder: o }) => page.order !== o)
        .map(({ page, newOrder: o }) => update(uid, page.id, { order: o }))
    );

    setDragId(null);
    setDropIndex(null);
  }, [dropIndex, roots, uid, update]);

  return (
    <div
      ref={containerRef}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
      className="space-y-0"
    >
      {/* 先頭インジケーター */}
      {isDragging && dropIndex === 0 && (
        <div className="mx-1 my-0.5 h-0.5 rounded bg-brand-400" />
      )}
      {roots.map((page, i) => (
        <div key={page.id}>
          <div
            ref={(el) => { itemRefs.current[i] = el; }}
            draggable
            onDragStart={(e) => handleDragStart(e, page.id)}
            onDragEnd={handleDragEnd}
            className={`rounded-md transition-opacity ${dragId === page.id ? 'opacity-30' : ''}`}
          >
            <PageTreeEntry page={page} pages={pages} currentId={currentId} onCtxMenu={onCtxMenu} />
          </div>
          {/* アイテムの後ろにインジケーター */}
          {isDragging && dropIndex === i + 1 && (
            <div className="mx-1 my-0.5 h-0.5 rounded bg-brand-400" />
          )}
        </div>
      ))}
    </div>
  );
}

function UserFooter({ user }: { user: User }) {
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {user.photoURL && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" className="h-6 w-6 rounded-full" />
      )}
      <p className="min-w-0 flex-1 truncate text-xs text-gray-600">{user.displayName}</p>
    </div>
  );
}

function BackToLearningLink() {
  const searchParams = useSearchParams();
  const fromTab = searchParams.get('from') ?? '0';
  return (
    <Link
      href={`/learning?tab=${fromTab}`}
      className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
    >
      <span>←</span>
      <span>学習リストに戻る</span>
    </Link>
  );
}

const SIDEBAR_WIDTH_KEY = 'notionplus-sidebar-width';
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 480;

function NotionPageSidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const { pages, add, remove, loading, update } = useNotionPageStore();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; page: NotionPage } | null>(null);
  const [open, setOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
    return Number(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? SIDEBAR_DEFAULT);
  });
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(SIDEBAR_DEFAULT);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = ev.clientX - startXRef.current;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidthRef.current + delta));
      setSidebarWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setSidebarWidth((w) => { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w)); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const currentId = pathname.match(/\/notion-plus\/([^/?#]+)/)?.[1];
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [moveModalPage, setMoveModalPage] = useState<NotionPage | null>(null);

  // W3: 検索結果（query があるときのみ非 null）
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return pages
      .filter((p) => p.id !== WORKSPACE_ID && p.title.toLowerCase().includes(q))
      .slice(0, 40);
  }, [pages, searchQuery]);

  const getPagePath = useCallback(
    (page: NotionPage) => getAncestorPath(pages, page),
    [pages],
  );

  // お気に入り（BOOKは除外）
  const roots = pages
    .filter((p) => !p.parentId && p.id !== WORKSPACE_ID && p.type !== 'book' && p.isFavorite)
    .sort((a, b) => a.order - b.order);

  // ページ一覧（全ルートページ）
  const allRootPages = pages
    .filter((p) => !p.parentId && p.id !== WORKSPACE_ID)
    .sort((a, b) => a.order - b.order);

  // 現在地のルート祖先ID（子ページを開いていても親ルートをハイライトするため）
  const activeRootId = useMemo(() => {
    if (!currentId) return null;
    let cur = pages.find((p) => p.id === currentId);
    while (cur) {
      if (!cur.parentId || cur.parentId === WORKSPACE_ID) return cur.id;
      cur = pages.find((p) => p.id === cur!.parentId);
    }
    return null;
  }, [currentId, pages]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuOpen]);

  const addPage = async () => {
    setAddMenuOpen(false);
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  const addDatabase = async () => {
    setAddMenuOpen(false);
    const page = await add(user.uid, { type: 'database' });
    router.push(`/notion-plus/${page.id}`);
  };


  // W2: ノートをブックに変換
  const convertToBook = useCallback(async () => {
    const target = ctxMenu?.page;
    setCtxMenu(null);
    if (!target) return;
    if (!window.confirm(`「${target.title || 'Untitled'}」をブックに変換しますか？\n現在の内容は第1章になります。`)) return;
    const firstChapter = { ...createBookChapter(0), content: target.content };
    await update(user.uid, target.id, {
      type: 'book' as const,
      icon: target.icon === '📄' ? '📖' : target.icon,
      content: serializeBookChapters([firstChapter]),
    });
    router.push(`/notion-plus/${target.id}`);
  }, [ctxMenu, update, user.uid, router]);

  const handleCtxMenu = (e: React.MouseEvent, page: NotionPage) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, page });
  };

  /* 閉じている間はナロー帯（w-8）のみ表示 */
  if (!open) {
    return (
      <aside className="flex h-full w-8 flex-col items-center border-r border-gray-100 bg-gray-50 pt-3 transition-all duration-200">
        <button
          onClick={() => setOpen(true)}
          title="サイドバーを開く"
          className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="relative flex h-full flex-col border-r border-gray-100 bg-gray-50"
      style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX }}
    >
      {/* リサイズハンドル */}
      <div
        onMouseDown={onDragStart}
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-brand-300 active:bg-brand-400"
        title="ドラッグでサイズ変更"
      />
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        {/* 左：縦2行（NotionPlus / ホームに戻る） */}
        <div className="flex flex-col gap-0.5">
          <Link href="/notion-plus" className="flex items-center gap-1.5 rounded px-1 hover:bg-gray-100">
            <span className="text-base leading-none">📝</span>
            <span className="text-sm font-semibold text-gray-800">NotionPlus</span>
          </Link>
          <Link
            href="/learning"
            className="flex items-center gap-1 rounded px-1 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <span className="text-[11px] leading-none">🏠</span>
            <span>ホームに戻る</span>
          </Link>
        </div>
        {/* 右：設定 + 新規作成 + 閉じる */}
        <div className="flex items-center gap-0.5">
          <Link
            href="/notion-plus/settings"
            title="NotionPlus設定（Notionインポートなど）"
            className="rounded p-1 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >⚙️</Link>
          <div ref={addMenuRef} className="relative">
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              title="新規作成"
              className="rounded p-1 text-lg leading-none text-gray-400 hover:bg-gray-200 hover:text-brand-500"
            >
              +
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                <button
                  onClick={addPage}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span>📄</span>
                  <span>ページを作成</span>
                </button>
                <button
                  onClick={addDatabase}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span>📊</span>
                  <span>データベースを作成</span>
                </button>
              </div>
            )}
          </div>
          {/* 閉じるボタン */}
          <button
            onClick={() => setOpen(false)}
            title="サイドバーを閉じる"
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          >
            ‹
          </button>
        </div>
      </div>

      {/* W3: 検索バー */}
      <div className="shrink-0 border-b border-gray-100 px-2 py-1.5">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ノートを検索..."
            className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-6 pr-6 text-xs outline-none focus:border-brand-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-[11px]"
            >✕</button>
          )}
        </div>
      </div>

      {/* ページリスト（お気に入りのみ） or 検索結果 */}
      <nav className="flex-1 overflow-y-auto px-1 py-1">
        {loading && <p className="px-3 py-2 text-xs text-gray-400">読込中...</p>}

        {/* 検索結果 */}
        {searchResults && (
          <div className="space-y-0.5">
            {searchResults.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-gray-400">
                「{searchQuery}」に一致するページがありません
              </p>
            ) : (
              searchResults.map((p) => {
                const path = getPagePath(p);
                return (
                  <Link
                    key={p.id}
                    href={`/notion-plus/${p.id}`}
                    onClick={() => setSearchQuery('')}
                    onContextMenu={(e) => { e.preventDefault(); handleCtxMenu(e, p); }}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
                      p.id === currentId
                        ? 'bg-white font-semibold text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:bg-white hover:text-gray-900'
                    }`}
                  >
                    <PageIcon icon={p.icon} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{p.title || 'Untitled'}</div>
                      {path && <div className="truncate text-[9px] text-gray-400">{path}</div>}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}

        {/* 通常ページリスト（検索なし時） */}
        {!searchResults && (
          <>
            {/* ★ お気に入り */}
            <p className="mt-1 px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">★ お気に入り</p>
            {!loading && roots.length === 0 && (
              <p className="px-3 py-2 text-center text-[11px] text-gray-400">
                ★ をつけたノートが<br />ここに表示されます
              </p>
            )}
            <RootPageList
              roots={roots}
              pages={pages}
              currentId={currentId}
              onCtxMenu={handleCtxMenu}
              uid={user.uid}
            />

            {/* ページ一覧（全ルートページ・フラット表示・D&D並び替え可） */}
            {!loading && allRootPages.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-2">
                <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">ページ一覧</p>
                <RootPageList
                  roots={allRootPages}
                  pages={pages}
                  currentId={activeRootId ?? undefined}
                  onCtxMenu={handleCtxMenu}
                  uid={user.uid}
                />
              </div>
            )}
          </>
        )}

        {/* コンテキストメニュー */}
        {ctxMenu && (
          <>
            <div className="fixed inset-0 z-[80]" onClick={() => setCtxMenu(null)} />
            <div
              className="fixed z-[90] w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-2xl"
              style={{ top: ctxMenu.y, left: ctxMenu.x }}
            >
              {/* W2: ブックに変換（page のみ） */}
              {ctxMenu.page.type !== 'database' && ctxMenu.page.type !== 'book' && (
                <button
                  onClick={convertToBook}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span>📖</span><span>ブックに変換</span>
                </button>
              )}
              {/* W4: ページを移動 */}
              <button
                onClick={() => { setMoveModalPage(ctxMenu.page); setCtxMenu(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <span>📁</span><span>ページを移動</span>
              </button>
              <div className="mx-2 my-1 border-t border-gray-100" />
              {/* 削除 */}
              <button
                onClick={async () => {
                  const target = ctxMenu.page;
                  setCtxMenu(null);
                  if (!confirm(`「${target.title || 'Untitled'}」を削除しますか？`)) return;
                  await remove(user.uid, target.id);
                  if (currentId === target.id) router.replace('/notion-plus');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50"
              >
                <span>🗑️</span><span>削除</span>
              </button>
            </div>
          </>
        )}
      </nav>

      {/* W4: ページ移動モーダル */}
      {moveModalPage && (
        <MovePageModal
          target={moveModalPage}
          pages={pages}
          uid={user.uid}
          onClose={() => setMoveModalPage(null)}
        />
      )}

    </aside>
  );
}


export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const signOut = useAuthStore((s) => s.signOut);
  const version = useElectronVersion();

  // ── サイドバー幅のドラッグリサイズ ──────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(224); // デフォルト w-56
  const isDragging = useRef(false);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(400, Math.max(160, ev.clientX));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // NotionPlus エリアではページサイドバーに切り替え
  if (pathname.startsWith('/notion-plus')) {
    return <NotionPageSidebar user={user} />;
  }

  return (
    <aside
      className="relative flex h-full flex-col border-r border-gray-100 bg-gray-50 shrink-0"
      style={{ width: sidebarWidth }}
    >
      {/* ドラッグハンドル */}
      <div
        onMouseDown={handleDragStart}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-brand-300 transition-colors z-10"
      />
      {/* アプリ名 */}
      <div className="flex items-center gap-2 px-4 py-5">
        <Image src={appIcon} alt="" className="h-7 w-7 rounded-lg" />
        <div>
          <p className="text-sm font-semibold text-gray-800">Study Tracker</p>
          <p className="text-xs text-gray-400">{version}</p>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-white font-medium text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
