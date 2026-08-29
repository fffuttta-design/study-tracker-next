'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
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

// 🔥 タブを行き来しても「さっき見ていた所」に戻れるよう、セクションごとに最後の居場所を覚える。
// （覚えないと NotionPlus は毎回ページ一覧の入口に戻ってしまう）
const LAST_KEY = 'studytracker.lastPathBySection';

// 覚えてよいものだけを残す。学習リストは開いていたタブ（?tab=）だけ、
// NotionPlus はページのパスだけ（?from= や ?hl= はその場限りなので捨てる）。
function rememberable(pathname: string): string | null {
  if (pathname.startsWith('/learning/')) return null; // 学習カード単独ページは覚えない
  if (pathname === '/learning') {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab ? `/learning?tab=${tab}` : '/learning';
  }
  if (pathname.startsWith('/notion-plus')) return pathname;
  if (pathname.startsWith('/goals')) return pathname;
  return null;
}

function sectionOf(pathname: string): string | null {
  const hit = NAV.find(({ href }) => pathname.startsWith(href));
  return hit ? hit.href : null;
}

function readStore(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); } catch { return {}; }
}

export function TopTabs() {
  const pathname = usePathname();
  const version = useElectronVersion();
  const [lastPath, setLastPath] = useState<Record<string, string>>({});

  // 起動時に前回の居場所を復元
  useEffect(() => { setLastPath(readStore()); }, []);

  // 今いる場所をそのセクションの居場所として記録する。
  // 🔥 タブを離れる瞬間（onClick）にも呼ぶこと。学習ページのタブ切替は
  //    history.replaceState で ?tab= を書くだけなので pathname が変わらず、
  //    ページ遷移の監視だけでは「どのタブを見ていたか」を取りこぼす。
  const remember = useCallback(() => {
    if (typeof window === 'undefined') return;
    const here = window.location.pathname;
    const section = sectionOf(here);
    const path = rememberable(here);
    if (!section || !path) return;
    const cur = readStore();
    if (cur[section] === path) return;
    const next = { ...cur, [section]: path };
    try { localStorage.setItem(LAST_KEY, JSON.stringify(next)); } catch { /* noop */ }
    setLastPath(next);
  }, []);

  useEffect(() => { remember(); }, [pathname, remember]);

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
            href={active ? href : (lastPath[href] ?? href)}
            onClick={remember}
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
