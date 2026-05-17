'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type User } from 'firebase/auth';
import { useAuthStore } from '@/stores/authStore';

interface SidebarProps {
  user: User;
}

const NAV = [
  { href: '/learning', label: '学習リスト', icon: '📚' },
  { href: '/notion-plus', label: 'NotionPlus', icon: '📝' },
  { href: '/settings', label: '設定', icon: '⚙️' },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-100 bg-gray-50">
      {/* アプリ名 */}
      <div className="px-4 py-5">
        <span className="text-sm font-semibold text-gray-800">Study Tracker</span>
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
