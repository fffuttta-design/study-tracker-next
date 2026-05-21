'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type User } from 'firebase/auth';
import { type NotionPage } from '@study-tracker/core';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { APP_VERSION } from '@/lib/version';
import appIcon from '@/app/icon.png';

interface SidebarProps {
  user: User;
}

const NAV = [
  { href: '/learning', label: '学習リスト', icon: '📚' },
  { href: '/notion-plus', label: 'NotionPlus', icon: '📝' },
];

function PageIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />;
  }
  return <span className="shrink-0 text-sm leading-none">{icon}</span>;
}

// currentId が parentId の子孫かどうかを確認し、直接の子ページIDを返す
function findActiveChild(pages: NotionPage[], parentId: string, currentId: string): string | null {
  for (const p of pages) {
    if (p.parentId !== parentId) continue;
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

  return (
    <div>
      <Link
        href={`/notion-plus/${page.id}`}
        onContextMenu={(e) => { e.preventDefault(); onCtxMenu(e, page); }}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
          isActive
            ? 'bg-white font-semibold text-gray-900 shadow-sm'
            : 'text-gray-600 hover:bg-white hover:text-gray-900'
        }`}
      >
        <PageIcon icon={page.type === 'database' && page.icon === '📄' ? '📊' : page.icon} />
        <span className="min-w-0 flex-1 truncate">{page.title || 'Untitled'}</span>
        {page.isFavorite && <span className="shrink-0 text-[10px] text-yellow-400">★</span>}
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

function UserFooter({ user }: { user: User }) {
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {user.photoURL && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" className="h-6 w-6 rounded-full" />
      )}
      <p className="min-w-0 flex-1 truncate text-xs text-gray-600">{user.displayName}</p>
      <button onClick={() => signOut()} className="shrink-0 text-xs text-gray-400 hover:text-gray-600" title="ログアウト">↩</button>
    </div>
  );
}

function NotionPageSidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromTab = searchParams.get('from') ?? '0';
  const { pages, add, remove, loading } = useNotionPageStore();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; page: NotionPage } | null>(null);
  const [open, setOpen] = useState(true);

  const currentId = pathname.match(/\/notion-plus\/([^/?#]+)/)?.[1];
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const roots = pages
    .filter((p) => !p.parentId)
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.order - b.order;
    });

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
    <aside className="flex h-full w-56 flex-col border-r border-gray-100 bg-gray-50 transition-all duration-200">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
        <Link href="/notion-plus" className="flex items-center gap-1.5 rounded px-1 hover:bg-gray-100">
          <span className="text-base">📝</span>
          <span className="text-sm font-semibold text-gray-800">NotionPlus</span>
        </Link>
        <div className="flex items-center gap-0.5">
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

      {/* ページリスト */}
      <nav className="flex-1 overflow-y-auto px-1 py-1">
        {loading && <p className="px-3 py-2 text-xs text-gray-400">読込中...</p>}

        {/* お気に入りセクション */}
        {roots.some((p) => p.isFavorite) && (
          <div className="mb-1">
            <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-500">★ お気に入り</p>
            {roots.filter((p) => p.isFavorite).map((page) => (
              <Link
                key={`fav-${page.id}`}
                href={`/notion-plus/${page.id}`}
                onContextMenu={(e) => { e.preventDefault(); handleCtxMenu(e, page); }}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 pl-4 text-xs transition-colors ${
                  page.id === currentId
                    ? 'bg-white font-semibold text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                <PageIcon icon={page.icon} />
                <span className="min-w-0 flex-1 truncate">{page.title || 'Untitled'}</span>
              </Link>
            ))}
            <div className="mx-2 mb-1 mt-1 border-b border-gray-200" />
          </div>
        )}

        {/* 全ページツリー（再帰的にアクティブパスを表示） */}
        <div className="space-y-0.5">
          {roots.map((page) => (
            <PageTreeEntry key={page.id} page={page} pages={pages} currentId={currentId} onCtxMenu={handleCtxMenu} />
          ))}
        </div>

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

      {/* フッター: 学習リストに戻る + ユーザー */}
      <div className="border-t border-gray-100">
        <Link
          href={`/learning?tab=${fromTab}`}
          className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <span>←</span>
          <span>学習リストに戻る</span>
        </Link>
        <div className="border-t border-gray-100 py-1">
          <UserFooter user={user} />
        </div>
        <p className="px-4 pb-2 text-[10px] text-gray-300">{APP_VERSION}</p>
      </div>
    </aside>
  );
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const signOut = useAuthStore((s) => s.signOut);

  // NotionPlus エリアではページサイドバーに切り替え
  if (pathname.startsWith('/notion-plus')) {
    return <NotionPageSidebar user={user} />;
  }

  return (
    <aside className="flex h-full w-40 flex-col border-r border-gray-100 bg-gray-50">
      {/* アプリ名 */}
      <div className="flex items-center gap-2 px-4 py-5">
        <Image src={appIcon} alt="" className="h-7 w-7 rounded-lg" />
        <div>
          <p className="text-sm font-semibold text-gray-800">Study Tracker</p>
          <p className="text-xs text-gray-400">{APP_VERSION}</p>
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

      {/* 設定 + ユーザー情報 */}
      <div className="border-t border-gray-100 p-3 space-y-1">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
            pathname.startsWith('/settings')
              ? 'bg-white font-medium text-gray-900 shadow-sm'
              : 'text-gray-600 hover:bg-white hover:text-gray-900'
          }`}
        >
          <span>⚙️</span>
          <span>設定</span>
        </Link>
        <div className="flex items-center gap-2 rounded-md px-2 py-2">
          {user.photoURL && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" className="h-7 w-7 rounded-full" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-700">{user.displayName}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
            title="ログアウト"
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  );
}
