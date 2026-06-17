'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * アイコン設定ピッカー内に出す「現在の画像」プレビュー。
 * 画像をクリックすると全画面（ライトボックス）で拡大表示し、どこかをクリックすると閉じる。
 * 表示専用・状態は内部で完結（呼び出し側に副作用なし）なのでバグ混入リスクを抑えている。
 * 3か所（本文ページリンク / ページ見出し / 記録ダイアログ）で共用する。
 */
export function IconImagePreview({ src }: { src: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-medium text-gray-400">現在の画像（クリックで拡大）</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={() => setZoom(true)}
        className="block max-h-44 w-full cursor-zoom-in rounded-lg border border-gray-100 bg-gray-50 object-contain"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {zoom && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[2000] flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
          title="クリックで閉じる"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>,
        document.body,
      )}
    </div>
  );
}
