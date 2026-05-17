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

export function hasDueReview(item: LearningItem): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return item.reviews.some(
    (r) => !r.completed && r.scheduledDate.slice(0, 10) <= today
  );
}

export function createReviews(
  dateKey: string,
  stageDays: readonly number[] = DEFAULT_REVIEW_STAGE_DAYS
): ReviewRecord[] {
  const base = new Date(dateKey);
  return stageDays.map((days, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return {
      stageIndex: i,
      scheduledDate: d.toISOString(),
      completed: false,
    };
  });
}
