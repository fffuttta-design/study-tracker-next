import { v4 as uuidv4 } from 'uuid';

// ── ブック: チャプター ─────────────────────────────────────────────
export interface BookChapter {
  id: string;
  title: string;
  content: string; // TipTap JSON
  order: number;
}

export function createBookChapter(order: number): BookChapter {
  return { id: uuidv4(), title: `第${order + 1}章`, content: '', order };
}

export function parseBookChapters(content: string): BookChapter[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.chapters) && parsed.chapters.length > 0) {
      return parsed.chapters;
    }
  } catch { /* ignore */ }
  return [createBookChapter(0)];
}

export function serializeBookChapters(chapters: BookChapter[]): string {
  return JSON.stringify({ chapters });
}

// ── NotionPage ────────────────────────────────────────────────────
export interface NotionPage {
  id: string;
  title: string;
  content: string; // TipTap JSON (page) | DbSchema JSON (database) | { chapters } JSON (book)
  parentId?: string;
  icon: string;
  order: number;
  updatedAt: string; // ISO 8601
  isFavorite: boolean;
  type?: 'page' | 'database' | 'book';
  notionId?: string; // Notion側のページID（インポート時に設定、再インポート重複防止用）
}

export function createNotionPage(params?: {
  parentId?: string;
  order?: number;
  type?: 'page' | 'database' | 'book';
  notionId?: string;
}): NotionPage {
  const isDb   = params?.type === 'database';
  const isBook = params?.type === 'book';
  const page: NotionPage = {
    id: uuidv4(),
    title: '',
    content: isDb
      ? JSON.stringify({ properties: [{ id: 'title', name: '名前', type: 'title' }] })
      : isBook
      ? serializeBookChapters([createBookChapter(0)])
      : '',
    icon: isDb ? '📊' : isBook ? '📖' : '📄',
    order: params?.order ?? 0,
    updatedAt: new Date().toISOString(),
    isFavorite: false,
  };
  if (isDb)   page.type = 'database';
  if (isBook) page.type = 'book';
  if (params?.parentId !== undefined) page.parentId = params.parentId;
  if (params?.notionId !== undefined) page.notionId = params.notionId;
  return page;
}
