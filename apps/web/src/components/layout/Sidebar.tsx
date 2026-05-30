'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type User } from 'firebase/auth';
import { type NotionPage } from '@study-tracker/core';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';
import { useDailyMemoStore } from '@/stores/dailyMemoStore';
import { useElectronVersion } from '@/hooks/useElectronVersion';
import appIcon from '@/app/icon.png';

interface SidebarProps {
  user: User;
}

const NAV = [
  { href: '/learning', label: '学習リスト', icon: '📚' },
  { href: '/notion-plus', label: 'NotionPlus', icon: '📝' },
  { href: '/quick-memo', label: '学習メモ', icon: '📓' },
  { href: '/goals', label: '絶対覚える', icon: '🎯' },
];

function PageIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />;
  }
  return <span className="shrink-0 text-sm leading-none">{icon}</span>;
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
  const isActive = page.id === currentId;
  const activeChildId = currentId && currentId !== page.id
    ? findActiveChild(pages, page.id, currentId)
    : null;
  const activeChild = activeChildId ? pages.find((p) => p.id === activeChildId) : null;
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
    await update(user.uid, droppedPageId, { parentId: page.id });
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
      {/* 現在いるページへのパス上にある子ページを再帰表示 */}
      {activeChild && (
        <div className="ml-4 border-l border-gray-200 pl-2 pt-0.5">
          <PageTreeEntry page={activeChild} pages={pages} currentId={currentId} onCtxMenu={onCtxMenu} />
        </div>
      )}
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
  const { pages, add, remove, loading } = useNotionPageStore();
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

  // お気に入りのみ表示（BOOKは除外）
  const roots = pages
    .filter((p) => !p.parentId && p.id !== WORKSPACE_ID && p.type !== 'book' && p.isFavorite)
    .sort((a, b) => a.order - b.order);

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
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
        <Link href="/notion-plus" className="flex items-center gap-1.5 rounded px-1 hover:bg-gray-100">
          <span className="text-base">📝</span>
          <span className="text-sm font-semibold text-gray-800">NotionPlus</span>
        </Link>
        <div className="flex items-center gap-0.5">
          {/* 設定ボタン */}
          <Link
            href="/notion-plus/settings"
            title="NotionPlus設定"
            className={`rounded p-1 text-sm transition-colors ${
              pathname === '/notion-plus/settings'
                ? 'bg-gray-200 text-gray-700'
                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700'
            }`}
          >
            ⚙️
          </Link>
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

      {/* ページリスト（お気に入りのみ） */}
      <nav className="flex-1 overflow-y-auto px-1 py-1">
        {loading && <p className="px-3 py-2 text-xs text-gray-400">読込中...</p>}

        {!loading && roots.length === 0 && (
          <p className="px-3 py-4 text-center text-[11px] text-gray-400">
            ★ をつけたノートが<br />ここに表示されます
          </p>
        )}

        {/* お気に入りページ一覧（ドラッグで並び替え可能） */}
        <RootPageList
          roots={roots}
          pages={pages}
          currentId={currentId}
          onCtxMenu={handleCtxMenu}
          uid={user.uid}
        />

        {/* コンテキストメニュー */}
        {ctxMenu && (
          <>
            <div className="fixed inset-0 z-[80]" onClick={() => setCtxMenu(null)} />
            <div
              className="fixed z-[90] w-44 rounded-xl border border-gray-100 bg-white py-1 shadow-2xl"
              style={{ top: ctxMenu.y, left: ctxMenu.x }}
            >
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

      {/* フッター: 学習リストに戻るのみ */}
      <div className="border-t border-gray-100">
        <Suspense fallback={
          <Link href="/learning" className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700">
            <span>←</span><span>学習リストに戻る</span>
          </Link>
        }>
          <BackToLearningLink />
        </Suspense>
      </div>
    </aside>
  );
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function QuickMemoSidebar({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const version = useElectronVersion();
  const { memos } = useDailyMemoStore();

  const today = toLocalDateString(new Date());
  const selectedDate = searchParams.get('date') ?? today;

  const pastDates = memos
    .map((m) => m.id)
    .filter((d) => d !== today)
    .sort((a, b) => b.localeCompare(a));
  const dateList = [today, ...pastDates];

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const formatLabel = (dateStr: string) => {
    if (dateStr === today) return '今日';
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
  };

  const handleSelect = (date: string) => {
    router.push(`/quick-memo?date=${date}`);
  };

  return (
    <aside className="flex h-full w-44 flex-col border-r border-gray-100 bg-gray-50">
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-3">
        <span className="text-base">📓</span>
        <span className="text-sm font-semibold text-gray-800">学習メモ</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {dateList.map((date) => {
          const isActive = date === selectedDate;
          const memo = memos.find((m) => m.id === date);
          const hasContent = !!memo?.content;
          const isToday = date === today;
          return (
            <button
              key={date}
              onClick={() => handleSelect(date)}
              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                isActive
                  ? 'bg-white font-semibold text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:bg-white hover:text-gray-800'
              }`}
            >
              {isToday && (
                <span className="shrink-0 text-[9px] font-bold text-brand-500">●</span>
              )}
              <span className={hasContent ? 'text-gray-800' : isToday ? 'text-gray-500' : 'text-gray-300'}>
                {formatLabel(date)}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-gray-100">
        <Link
          href="/learning"
          className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <span>←</span>
          <span>学習リストに戻る</span>
        </Link>
        <div className="border-t border-gray-100 py-1">
          <UserFooter user={user} />
        </div>
        <p className="px-4 pb-2 text-[10px] text-gray-300">{version}</p>
      </div>
    </aside>
  );
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const signOut = useAuthStore((s) => s.signOut);
  const version = useElectronVersion();

  // NotionPlus エリアではページサイドバーに切り替え
  if (pathname.startsWith('/notion-plus')) {
    return <NotionPageSidebar user={user} />;
  }

  // quick-memo エリアでは日付サイドバーに切り替え
  if (pathname.startsWith('/quick-memo')) {
    return (
      <Suspense fallback={<aside className="w-44 border-r border-gray-100 bg-gray-50" />}>
        <QuickMemoSidebar user={user} />
      </Suspense>
    );
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-100 bg-gray-50">
      {/* アプリ名 + 設定ボタン（右上） */}
      <div className="flex items-center gap-2 px-4 py-5">
        <Image src={appIcon} alt="" className="h-7 w-7 rounded-lg" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Study Tracker</p>
          <p className="text-xs text-gray-400">{version}</p>
        </div>
        <Link
          href="/settings"
          title="設定"
          className={`shrink-0 rounded-md p-1.5 text-base transition-colors ${
            pathname.startsWith('/settings')
              ? 'bg-gray-200 text-gray-700'
              : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700'
          }`}
        >
          ⚙️
        </Link>
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
