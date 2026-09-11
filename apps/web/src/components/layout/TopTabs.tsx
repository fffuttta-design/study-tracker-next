'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useElectronVersion } from '@/hooks/useElectronVersion';
import appIcon from '@/app/icon.png';

// 画面上部の大タブ（学習リスト / NotionPlus / 覚えるリスト）。
// v1.0.296〜、左サイドバーのナビを廃止してここへ移した（本文を横いっぱい使うため）。
const NAV = [
  { href: '/learning', label: '学習リスト', icon: '📚' },
  { href: '/notion-plus', label: 'NotionPlus', icon: '📝' },
  { href: '/goals', label: '覚えるリスト', icon: '🎯' },
];

// 🔥 タブを行き来しても「さっき見ていた所」に戻れるよう、セクションごとに最後の居場所を覚える。
// （覚えないと NotionPlus は毎回ページ一覧の入口に戻ってしまう）
const LAST_KEY = 'studytracker.lastPathBySection';

// Electron で「窓を掴んで動かせる所」を指定する CSS。
// drag = 掴める（＝タイトルバー扱い）／ no-drag = 掴めない（＝押せるボタン）。
// ブラウザでは無視されるだけなので、分岐せずそのまま付けてよい。
const DRAG = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

// 覚えてよいものだけを残す。学習リストは開いていたタブ（?tab=）だけ、
// NotionPlus はページのパスだけ（?from= や ?hl= はその場限りなので捨てる）。
function rememberable(pathname: string): string | null {
  if (pathname.startsWith('/learning/')) return null; // 学習カード単独ページは覚えない
  if (pathname === '/learning') {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab ? `/learning?tab=${tab}` : '/learning';
  }
  // 🔥 NotionPlus は「開いていたページ」を覚えない（2026-09-11 本人指示）。
  //    /notion-plus をダッシュボード＝ホーム画面にしたので、深いページを覚えていると
  //    タブを押してもホームに一度も辿り着けない。前回の続きはホームの「続きから」が受け持つ。
  if (pathname.startsWith('/notion-plus')) return null;
  if (pathname.startsWith('/goals')) return pathname;
  return null;
}

// 🔥 タブは「今いる窓」で開く（2026-09-10 本人指示）。
//    v1.0.315〜、画面ごとに担当の窓を決めて、担当外のタブを押したらその窓を前に出していた。
//    しかしそれだと NotionPlus のタブを押すだけで窓がもう1つ立ち上がる＝鬱陶しい。
//    ∴ 排他制御はやめて、どのタブもその窓のページ遷移にした。
//    ⚠ 元々の目的だった「昨日の日付のまま止まった窓が残る」問題は useToday() で別に解決済み。
function sectionOf(pathname: string): string | null {
  const hit = NAV.find(({ href }) => pathname.startsWith(href));
  return hit ? hit.href : null;
}

function readStore(): Record<string, string> {
  try {
    const store: Record<string, string> = JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
    // 🔥 NotionPlus は覚えない（rememberable 参照）。ただし v1.0.320 以前に保存された
    //    「開いていたページ」が localStorage に残っているので、読み出し側でも捨てる。
    //    ここを消し忘れると、書き込みを止めてもタブが古い記憶のまま直リンクし続ける。
    delete store['/notion-plus'];
    return store;
  } catch { return {}; }
}

export function TopTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const version = useElectronVersion();
  const [lastPath, setLastPath] = useState<Record<string, string>>({});
  // デスクトップ版だけ、右端に「─ □ ✕」が重なって描かれる（titleBarOverlay）。
  // その下にタブが潜り込まないよう余白を空ける。ブラウザでは不要なので付けない。
  // ⚠ 描画後に判定する（サーバー側では window が無く、初回描画とズレるため）
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(!!window.electronAPI);
  }, []);

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

  // 🔥 Ctrl+Tab で「学習リスト → NotionPlus → 覚えるリスト」を順送り（Ctrl+Shift+Tab で逆送り）。
  // クリックと同じ扱いにする＝離れる前に居場所を覚え、戻り先も前回の続きにする。
  // ⚠ デスクトップ（Electron）だけで効かせる。ブラウザでは Ctrl+Tab はブラウザ自身の
  //    タブ切替に予約されていて preventDefault が効かず、アプリ側も動くと二重に切り替わるため。
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.repeat || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();

      remember(); // 離れる瞬間の居場所を記録（クリック時の onClick と同じ）

      const here = window.location.pathname;
      const idx = NAV.findIndex(({ href }) => here.startsWith(href));
      const next =
        idx < 0
          ? NAV[0] // 設定画面などタブの外にいるときは先頭へ
          : NAV[(idx + (e.shiftKey ? -1 : 1) + NAV.length) % NAV.length];

      // remember() の直後なので localStorage から読み直す（state はまだ古い）
      const to = readStore()[next.href] ?? next.href;
      router.push(to); // 今いる窓でそのまま移動する
    };

    // capture で拾う＝TipTap などページ側のキー処理より先に取る
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [remember, router]);

  return (
    // 🔥 この帯が「窓のタイトルバー」そのもの（Electron側で OS のタイトルバーを消してある）。
    //    ・高さ40px は electron/main.js の TITLE_BAR.height と必ず揃える
    //    ・帯は drag ＝ 空いている所を掴めば窓を動かせる／ダブルクリックで最大化
    //    ・タブは no-drag にしないと「掴む所」になってクリックできなくなる
    <div
      style={DRAG}
      className={`flex h-10 shrink-0 items-end gap-1 border-b border-gray-200 bg-gray-50 pl-3 ${
        isDesktop ? 'pr-[146px]' : 'pr-3'
      }`}
    >
      {/* アプリ名（左端・タブと同じ行） */}
      <div className="mb-1 mr-3 flex shrink-0 items-center gap-1.5">
        <Image src={appIcon} alt="" className="h-5 w-5 rounded" />
        <span className="text-xs font-semibold text-gray-700">Study Tracker</span>
        <span className="text-[10px] text-gray-400">{version}</span>
      </div>

      {NAV.map(({ href, label, icon }) => {
        const active = pathname.startsWith(href);
        const to = active ? href : (lastPath[href] ?? href);
        return (
          <Link
            key={href}
            href={to}
            onClick={remember}
            style={NO_DRAG}
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
