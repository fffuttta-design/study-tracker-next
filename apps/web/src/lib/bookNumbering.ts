// ブックの自動見出し番号（本のような採番）ユーティリティ。
// 表示時に計算するだけ（本文データには書き込まない＝可逆）。Phase 1: 章番号＋目次の見出し番号。

const KANJI = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 1〜99 を漢数字に（章番号用）。100以上は算用数字でフォールバック。
export function toKanji(n: number): string {
  if (n <= 0) return '零';
  if (n < 10) return KANJI[n];
  if (n < 20) return '十' + (n % 10 ? KANJI[n % 10] : '');
  if (n < 100) {
    const tens = Math.floor(n / 10);
    return KANJI[tens] + '十' + (n % 10 ? KANJI[n % 10] : '');
  }
  return String(n);
}

// デフォルト章名（「第1章」「第一章」など）か＝ユーザーが命名していないか
function isDefaultChapterTitle(title: string): boolean {
  const t = (title ?? '').trim();
  return !t || /^第\s*\d+\s*章$/.test(t) || /^第[一二三四五六七八九十百]+章$/.test(t);
}

// 章の表示ラベル：自動「第一章」＋カスタム名（デフォルト名は番号へ統合して二重表示を防ぐ）
export function chapterLabel(index: number, title: string): string {
  const auto = `第${toKanji(index + 1)}章`;
  const t = (title ?? '').trim();
  return isDefaultChapterTitle(t) ? auto : `${auto} ${t}`;
}

// 見出し階層番号（1 / 1.1 / 1.1.1 …）をチャプター内ローカルで計算
export function numberHeadings<T extends { level: number }>(
  headings: T[],
): (T & { num: string })[] {
  const counters = [0, 0, 0, 0, 0, 0, 0]; // index = 見出しレベル(1..6)
  return headings.map((h) => {
    const lvl = Math.min(Math.max(h.level, 1), 6);
    counters[lvl]++;
    for (let l = lvl + 1; l < counters.length; l++) counters[l] = 0;
    const num = counters.slice(1, lvl + 1).join('.');
    return { ...h, num };
  });
}
