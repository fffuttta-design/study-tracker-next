import { v4 as uuidv4 } from 'uuid';

export interface NotionPage {
  id: string;
  title: string;
  content: string; // TipTap JSON (新形式)
  parentId?: string;
  icon: string;
  order: number;
  updatedAt: string; // ISO 8601
  isFavorite: boolean;
}

export function createNotionPage(params?: {
  parentId?: string;
  order?: number;
}): NotionPage {
  return {
    id: uuidv4(),
    title: '',
    content: '',
    parentId: params?.parentId,
    icon: '📄',
    order: params?.order ?? 0,
    updatedAt: new Date().toISOString(),
    isFavorite: false,
  };
}
