'use client';

/**
 * 窓を掴んで動かすための、見えない帯（高さ40px・画面いちばん上）。
 *
 * 🔥 v1.0.313 で OS のタイトルバーを消した（`electron/main.js` の `TITLE_BAR`）ので、
 *    ふだんは `TopTabs` の帯がタイトルバーの代わりをしている。
 *    ただし **`TopTabs` が出ない画面**（ログイン画面・読み込み中のぐるぐる）には
 *    掴む所が1つも無くなり、**窓を動かせなくなる**。その穴を埋めるための保険。
 *
 * - `TopTabs` がある画面では使わない（あちらが帯そのもの）。
 * - ブラウザでは `WebkitAppRegion` が無視されるだけなので、置いても害はない。
 * - 高さ40pxは `TITLE_BAR.height` と合わせてある。
 */
export function WindowDragStrip() {
  return (
    <div
      aria-hidden
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="fixed inset-x-0 top-0 z-50 h-10"
    />
  );
}
