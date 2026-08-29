'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useElectronVersion } from '@/hooks/useElectronVersion';
import appIcon from '@/app/icon.png';

// 画面上部の大タブ（学習リスト / NotionPlus / 絶対覚える）。
// v1.0.296〜、左サイドバーのナビを廃止してここへ移した（本文を横いっぱい使うため）。
const NAV = [
  { href: '/learning', label: '学習リスト', icon: '📚' },
  { href: '/notion-plus', label: 'NotionPlus', icon: '📝' },
  { href: '/goals', label: '絶対覚える', icon: '🎯' },
];

export function TopTabs() {
  const pathname = usePathname();
  const version = useElectronVersion();

  return (
    <div className="flex shrink-0 items-end gap-1 border-b border-gray-200 bg-gray-50 px-3 pt-1.5">
      {/* アプリ名（左端・タブと同じ行） */}
      <div className="mb-1 mr-3 flex shrink-0 items-center gap-1.5">
        <Image src={appIcon} alt="" className="h-5 w-5 rounded" />
        <span className="text-xs font-semibold text-gray-700">Study Tracker</span>
        <span className="text-[10px] text-gray-400">{version}</span>
      </div>

      {NAV.map(({ href, label, icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`-mb-px flex items-center gap-1.5 rounded-t-lg border px-4 py-1.5 text-sm transition-colors ${
              active
                ? 'border-gray-200 border-b-white bg-white font-medium text-gray-900'
                : 'border-transparent text-gray-500 hover:bg-white/60 hover:text-gray-800'
            }`}
          >
            <span className="text-base leading-none">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
