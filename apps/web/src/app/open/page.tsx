'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * 橋渡しページ `/open?to=<内部パス>`
 *
 * Discordの復習通知リンクの飛び先。押すと：
 *  1) `studytracker://open?to=<path>` でWindowsアプリ（Electron）を起動しようとする
 *  2) アプリが入っていなければ、少し待ってWeb版の該当ページへ飛ぶ（フォールバック）
 *
 * `to` は内部パス（`/` 始まり）だけ許可（オープンリダイレクト防止）。
 */
function OpenInner() {
  const sp = useSearchParams();
  const raw = sp.get('to') || '/learning';
  const to = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/learning';
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const scheme = `studytracker://open?to=${encodeURIComponent(to)}`;

    // アプリが前面に出た＝起動できた、をイベントで確実に記録する（1時点の hidden 判定は
    // 起動ダイアログで一瞬隠れると誤作動して固まるため使わない）。
    let launched = false;
    const markLaunched = () => { launched = true; };
    const onVis = () => { if (document.hidden) launched = true; };
    window.addEventListener('blur', markLaunched);
    window.addEventListener('pagehide', markLaunched);
    document.addEventListener('visibilitychange', onVis);

    // ① Windowsアプリを起動（未インストール/未許可なら前面に出ない）
    try {
      window.location.href = scheme;
    } catch {
      /* noop */
    }
    setTried(true);

    // ② 2.5秒待って、一度も前面が奪われていない＝アプリが開けなかった → Web版で開く。
    //    アプリが開けていれば launched=true になり、Webへは飛ばさない（二重に開かない）。
    const t = setTimeout(() => {
      if (!launched && !document.hidden) window.location.replace(to);
    }, 2500);

    return () => {
      clearTimeout(t);
      window.removeEventListener('blur', markLaunched);
      window.removeEventListener('pagehide', markLaunched);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [to]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#374151',
      }}
    >
      <div style={{ fontSize: 40 }}>📚</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>
        {tried ? 'アプリで開いています…' : '準備中…'}
      </div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>
        Windowsアプリが開かない場合は、下から選んでください。
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => {
            window.location.href = `studytracker://open?to=${encodeURIComponent(to)}`;
          }}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid #6366F1',
            background: '#6366F1',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ▶ アプリで開く
        </button>
        <button
          onClick={() => window.location.replace(to)}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🌐 ブラウザで開く
        </button>
      </div>
    </div>
  );
}

export default function OpenPage() {
  return (
    <Suspense fallback={null}>
      <OpenInner />
    </Suspense>
  );
}
