export const REVIEW_STAGE_LABELS = ['翌日', '3日後', '7日後', '2週間後', '1ヶ月後'] as const;
export const DEFAULT_REVIEW_STAGE_DAYS = [1, 3, 7, 14, 30] as const;

export const IMPORTANCE_HIGH = 'high';
export const IMPORTANCE_MEDIUM = 'medium';
export const IMPORTANCE_LOW = 'low';
export type Importance = 'high' | 'medium' | 'low';

export function importanceLabel(v: Importance): string {
  return v === IMPORTANCE_HIGH ? '高' : v === IMPORTANCE_MEDIUM ? '中' : '低';
}

export interface ReviewRecord {
  stageIndex: number; // 0=翌日 … 4=1ヶ月後
  scheduledDate: string; // ISO 8601
  completed: boolean;
}

export interface LearningItem {
  id: string;
  dateKey: string; // YYYY-MM-DD (登録日)
  categoryId?: string;
  title: string;
  url?: string;
  content: string;
  importance?: Importance;
  reviews: ReviewRecord[]; // 5段階
  sortOrder: number;
  createdAt?: string; // ISO 8601
  notionPageId?: string;
  notionPagePath?: string; // ページ階層 (例: "事業 / ビジネス戦闘力")
}

export function getNextStageIndex(item: LearningItem): number {
  for (let i = 0; i < item.reviews.length; i++) {
    if (!item.reviews[i].completed) return i;
  }
  return -1;
}

export function isFullyCompleted(item: LearningItem): boolean {
  return getNextStageIndex(item) === -1;
}

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function hasDueReview(item: LearningItem): boolean {
  // ローカル日付（日本時間）で比較することで 00:00 JST から正しく復習が出る
  const today = localDateKey();
  return item.reviews.some(
    (r) => !r.completed && r.scheduledDate.slice(0, 10) <= today
  );
}

export function createReviews(
  dateKey: string,
  stageDays: readonly number[] = DEFAULT_REVIEW_STAGE_DAYS
): ReviewRecord[] {
  // YYYY-MM-DD をローカル日付として解釈（UTC変換を避ける）
  const [y, mo, d] = dateKey.split('-').map(Number);
  return stageDays.map((days, i) => {
    const base = new Date(y, mo - 1, d); // ローカル時刻の深夜0時
    base.setDate(base.getDate() + days);
    return {
      stageIndex: i,
      scheduledDate: localDateKey(base), // YYYY-MM-DD（ローカル）で保存
      completed: false,
    };
  });
}
