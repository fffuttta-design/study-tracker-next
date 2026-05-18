'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type User } from 'firebase/auth';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { APP_VERSION } from '@/lib/version';

interface SidebarProps {
  user: User;
}

const NAV = [
  { href: '/learning', label: '学習リスト', icon: '📚' },
  { href: '/notion-plus', label: 'NotionPlus', icon: '📝' },
  { href: '/settings', label: '設定', icon: '⚙️' },
];

function PageIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />;
  }
  return <span className="shrink-0 text-sm leading-none">{icon}</span>;
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
  const { pages, add, loading } = useNotionPageStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const currentId = pathname.match(/\/notion-plus\/([^/?#]+)/)?.[1];

  const roots = pages
    .filter((p) => !p.parentId)
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.order - b.order;
    });

  // アクティブページの親を自動展開
  useEffect(() => {
    if (!currentId || !pages.length) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      // アクティブページ自身がルートなら展開
      if (pages.find((p) => p.id === currentId && !p.parentId)) {
        if (!next.has(currentId)) { next.add(currentId); changed = true; }
      }
      // アクティブページが子ページなら親を展開
      const parent = roots.find((r) => pages.some((c) => c.parentId === r.id && c.id === currentId));
      if (parent && !next.has(parent.id)) { next.add(parent.id); changed = true; }
      return changed ? next : prev;
    });
  }, [currentId, pages, roots]);

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addPage = async () => {
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-100 bg-gray-50">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
        <Link href="/notion-plus" className="flex items-center gap-1.5 rounded px-1 hover:bg-gray-100">
          <span className="text-base">📝</span>
          <span className="text-sm font-semibold text-gray-800">NotionPlus</span>
        </Link>
        <button
          onClick={addPage}
          title="新規ページ"
          className="rounded p-1 text-lg leading-none text-gray-400 hover:bg-gray-200 hover:text-brand-500"
        >
          +
        </button>
      </div>

      {/* ページリスト */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-1 py-1">
        {loading && <p className="px-3 py-2 text-xs text-gray-400">読込中...</p>}
        {roots.map((page) => {
          const children = pages.filter((p) => p.parentId === page.id).sort((a, b) => a.order - b.order);
          const isActive = page.id === currentId;
          const isExpanded = expandedIds.has(page.id);

          return (
            <div key={page.id}>
              <div className="flex items-center gap-0.5">
                {/* 開閉ボタン */}
                <button
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] text-gray-400 hover:bg-gray-200 hover:text-gray-600 ${children.length === 0 ? 'invisible' : ''}`}
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                  onClick={() => toggle(page.id)}
                  title={isExpanded ? '閉じる' : '開く'}
                >
                  ▶
                </button>
                <Link
                  href={`/notion-plus/${page.id}`}
                  className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    isActive
                      ? 'bg-white font-semibold text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:bg-white hover:text-gray-900'
                  }`}
                >
                  <PageIcon icon={page.icon} />
                  <span className="min-w-0 flex-1 truncate">{page.title || 'Untitled'}</span>
                  {page.isFavorite && <span className="shrink-0 text-xs text-yellow-400">★</span>}
                </Link>
              </div>

              {/* 子ページ */}
              {isExpanded && children.length > 0 && (
                <div className="ml-5 space-y-0.5 border-l border-gray-200 pl-2 pt-0.5">
                  {children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/notion-plus/${child.id}`}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                        child.id === currentId
                          ? 'bg-white font-semibold text-gray-800 shadow-sm'
                          : 'text-gray-500 hover:bg-white hover:text-gray-700'
                      }`}
                    >
                      <PageIcon icon={child.icon} />
                      <span className="min-w-0 flex-1 truncate">{child.title || 'Untitled'}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* フッター: 学習リストに戻る + ユーザー */}
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
    <aside className="flex h-full w-56 flex-col border-r border-gray-100 bg-gray-50">
      {/* アプリ名 */}
      <div className="px-4 py-5">
        <span className="text-sm font-semibold text-gray-800">Study Tracker</span>
        <p className="text-xs text-gray-400">{APP_VERSION}</p>
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

      {/* ユーザー情報 */}
      <div className="border-t border-gray-100 p-3">
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
