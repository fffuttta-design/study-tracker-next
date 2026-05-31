// ─── 学習アイテム ─────────────────────────────────────────
export const REVIEW_STAGE_LABELS = ['翌日', '3日後', '7日後', '2週間後', '1ヶ月後'] as const;
export const DEFAULT_REVIEW_STAGE_DAYS = [1, 3, 7, 14, 30] as const;

export type Importance = 'high' | 'medium' | 'low';

export interface ReviewRecord {
  stageIndex: number;
  scheduledDate: string; // YYYY-MM-DD
  completed: boolean;
}

export interface LearningItem {
  id: string;
  dateKey: string; // YYYY-MM-DD
  categoryId?: string;
  title: string;
  url?: string;
  content: string;
  importance?: Importance;
  reviews: ReviewRecord[];
  sortOrder: number;
  createdAt?: string;
  notionPageId?: string;
  notionPagePath?: string;
}

// ─── カテゴリ ─────────────────────────────────────────────
export interface LearningCategory {
  id: string;
  name: string;
  colorValue: number; // 0xAARRGGBB
  parentId?: string;
  sortOrder: number;
}

// ─── NotionPlus ───────────────────────────────────────────
export interface NotionPage {
  id: string;
  title: string;
  content: string; // TipTap JSON（Web作成）or Markdown（モバイル作成）
  parentId?: string;
  order: number;       // Webと共通フィールド名
  updatedAt?: string;
  icon?: string;
  isFavorite?: boolean;
  type?: 'page' | 'database';
}

/** TipTap JSON からプレーンテキストを抽出 */
export function extractTextFromTipTap(content: string): string {
  if (!content) return '';
  try {
    const json = JSON.parse(content);
    if (json?.type !== 'doc') return content; // JSONでなければそのまま
    const lines: string[] = [];
    const walk = (node: any) => {
      if (node.type === 'text') { lines.push(node.text ?? ''); return; }
      if (node.type === 'hardBreak') { lines.push('\n'); return; }
      if (node.content) node.content.forEach(walk);
      if (['paragraph','heading','listItem','taskItem','blockquote'].includes(node.type)) lines.push('\n');
    };
    if (json.content) json.content.forEach(walk);
    return lines.join('').trim();
  } catch {
    return content; // パース失敗はそのまま返す
  }

}

/** TipTap JSON かどうか判定 */
export function isTipTapContent(content: string): boolean {
  if (!content || !content.startsWith('{')) return false;
  try { const j = JSON.parse(content); return j?.type === 'doc'; } catch { return false; }
}

// ─── ユーティリティ ───────────────────────────────────────
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function hasDueReview(item: LearningItem): boolean {
  if (!item.reviews?.length) return false;
  const today = localDateKey();
  return item.reviews.some(r => !r.completed && (r.scheduledDate ?? '').slice(0, 10) <= today);
}

export function isFullyCompleted(item: LearningItem): boolean {
  if (!item.reviews?.length) return true;
  return item.reviews.every(r => r.completed);
}

export function createReviews(
  dateKey: string,
  stageDays: readonly number[] = DEFAULT_REVIEW_STAGE_DAYS,
): ReviewRecord[] {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return stageDays.map((days, i) => {
    const base = new Date(y, mo - 1, d);
    base.setDate(base.getDate() + days);
    return {
      stageIndex: i,
      scheduledDate: localDateKey(base),
      completed: false,
    };
  });
}

/** 復習完了時に次ステージの日程を「復習日 + stageDays[nextStage]」で再計算 */
export function recalcNextReview(
  reviews: ReviewRecord[],
  completedStageIndex: number,
  reviewedDateKey: string,
  stageDays: readonly number[] = DEFAULT_REVIEW_STAGE_DAYS,
): ReviewRecord[] {
  const nextStage = completedStageIndex + 1;
  if (nextStage >= reviews.length) return reviews;
  const [y, mo, d] = reviewedDateKey.split('-').map(Number);
  const nextDate = new Date(y, mo - 1, d);
  nextDate.setDate(nextDate.getDate() + stageDays[nextStage]);
  return reviews.map((r) =>
    r.stageIndex === nextStage ? { ...r, scheduledDate: localDateKey(nextDate) } : r,
  );
}

export function colorValueToHex(colorValue: number): string {
  const r = (colorValue >> 16) & 0xff;
  const g = (colorValue >> 8) & 0xff;
  const b = colorValue & 0xff;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function importanceLabel(v: Importance): string {
  return v === 'high' ? '高' : v === 'medium' ? '中' : '低';
}

export function importanceColor(v?: Importance): string {
  return v === 'high' ? '#ef4444' : v === 'medium' ? '#f59e0b' : '#6b7280';
}

/** TipTap JSON 内の指定インデックスの taskItem の checked を反転して返す */
export function toggleTipTapTask(content: string, taskIndex: number): string {
  try {
    const doc = JSON.parse(content);
    let idx = 0;
    const toggle = (node: any): any => {
      if (node.type === 'taskItem') {
        if (idx === taskIndex) {
          idx++;
          return { ...node, attrs: { ...(node.attrs ?? {}), checked: !(node.attrs?.checked ?? false) } };
        }
        idx++;
      }
      if (node.content) return { ...node, content: node.content.map(toggle) };
      return node;
    };
    return JSON.stringify({ ...doc, content: doc.content.map(toggle) });
  } catch {
    return content;
  }
}
