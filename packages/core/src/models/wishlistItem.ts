export const WISH_PRIORITY_HIGH = 'high';
export const WISH_PRIORITY_MEDIUM = 'medium';
export const WISH_PRIORITY_LOW = 'low';
export type WishPriority = 'high' | 'medium' | 'low';

export interface WishlistItem {
  id: string;
  title: string;
  detail: string;
  categoryId?: string;
  priority: WishPriority;
  colorValue?: number; // undefined = 色なし
  dueDate?: string;    // ISO 8601
  sortOrder: number;
  createdAt: string;   // ISO 8601
}
