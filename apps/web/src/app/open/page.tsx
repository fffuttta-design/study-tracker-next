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

    // アプリが開けたかは「ページがどれだけ隠れていたか」で見分ける：
    //  ・十分に隠れていた(>1.2秒) → アプリが前面に出た＝成功。Webへは飛ばさない。
    //  ・一瞬だけ隠れて戻った / まったく隠れない → 起動できていない → Web版で開く。
    // これで「起動ダイアログで固まる」も「未インストールでWebに落ちない」も両方防ぐ。
    let settled = false;
    let hiddenSince = 0;
    const goWeb = () => {
      if (!settled && !document.hidden) {
        settled = true;
        window.location.replace(to);
      }
    };
    let t = setTimeout(goWeb, 2500);
    const onVis = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        clearTimeout(t);
      } else {
        clearTimeout(t);
        if (hiddenSince && Date.now() - hiddenSince > 1200) {
          settled = true; // 十分に隠れていた＝アプリが開いた（Webへは飛ばさない）
        } else if (!settled) {
          t = setTimeout(goWeb, 1500); // 一瞬だけ＝ダイアログ却下等 → Webへ
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);

    // Windowsアプリを起動（未インストール/未許可なら前面に出ない）
    try {
      window.location.href = scheme;
    } catch {
      /* noop */
    }
    setTried(true);

    return () => {
      clearTimeout(t);
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
