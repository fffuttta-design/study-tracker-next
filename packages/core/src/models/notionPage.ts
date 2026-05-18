import { v4 as uuidv4 } from 'uuid';

export interface NotionPage {
  id: string;
  title: string;
  content: string; // TipTap JSON (新形式) or DbSchema JSON (database)
  parentId?: string;
  icon: string;
  order: number;
  updatedAt: string; // ISO 8601
  isFavorite: boolean;
  type?: 'page' | 'database';
}

export function createNotionPage(params?: {
  parentId?: string;
  order?: number;
  type?: 'page' | 'database';
}): NotionPage {
  const isDb = params?.type === 'database';
  const page: NotionPage = {
    id: uuidv4(),
    title: '',
    content: isDb ? JSON.stringify({ properties: [{ id: 'title', name: '名前', type: 'title' }] }) : '',
    icon: isDb ? '📊' : '📄',
    order: params?.order ?? 0,
    updatedAt: new Date().toISOString(),
    isFavorite: false,
  };
  if (isDb) page.type = 'database';
  if (params?.parentId !== undefined) page.parentId = params.parentId;
  return page;
}
