
import { create } from 'zustand';
import { type NotionPage, createNotionPage } from '@study-tracker/core';
import { subscribeCol, upsertDoc, deleteDocById, fetchWhere, batchUpsert, batchDelete } from '@study-tracker/firebase';

export interface PageHistorySnapshot {
  id: string;
  pageId: string;
  title: string;
  content: string;
  savedAt: string;
}

interface NotionPageState {
  pages: NotionPage[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string, params?: { parentId?: string; order?: number; type?: 'page' | 'database'; notionId?: string }) => Promise<NotionPage>;
  update: (uid: string, id: string, data: Partial<NotionPage>) => Promise<void>;
  batchUpdate: (uid: string, updates: Array<{ id: string; content: string }>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
  saveHistory: (uid: string, pageId: string, title: string, content: string) => Promise<void>;
  loadPageHistory: (uid: string, pageId: string) => Promise<PageHistorySnapshot[]>;
}

export const useNotionPageStore = create<NotionPageState>((set) => ({
  pages: [],
  loading: true,

  subscribe: (uid) => {
    return subscribeCol<NotionPage>(uid, 'notionPages', (pages) => {
      set({ pages, loading: false });
    });
  },

  add: async (uid, params) => {
    const page = createNotionPage(params as Parameters<typeof createNotionPage>[0]);
    await upsertDoc(uid, 'notionPages', page.id, page as unknown as Record<string, unknown>);
    return page;
  },

  update: async (uid, id, data) => {
    const updated = { ...data, updatedAt: new Date().toISOString() };
    await upsertDoc(uid, 'notionPages', id, updated as Record<string, unknown>);
  },

  batchUpdate: async (uid, updates) => {
    if (updates.length === 0) return;
    const now = new Date().toISOString();
    const items = updates.map(({ id, content }) => ({ id, content, updatedAt: now }));
    await batchUpsert(uid, 'notionPages', items);
  },

  remove: async (uid, id) => {
    // 子孫ページをすべて収集して一括削除（孤児ページ防止）
    const { pages } = useNotionPageStore.getState();
    const collectDescendants = (parentId: string): string[] => {
      const children = pages.filter((p) => p.parentId === parentId);
      return children.flatMap((c) => [c.id, ...collectDescendants(c.id)]);
    };
    const descendants = collectDescendants(id);
    const allIds = [id, ...descendants];
    await batchDelete(uid, 'notionPages', allIds);
  },

  saveHistory: async (uid, pageId, title, content) => {
    const id = `${pageId}_${Date.now()}`;
    await upsertDoc(uid, 'notionPageHistory', id, { pageId, title, content, savedAt: new Date().toISOString() });
  },

  loadPageHistory: async (uid, pageId) => {
    const all = await fetchWhere<PageHistorySnapshot>(uid, 'notionPageHistory', 'pageId', pageId);
    return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 20);
  },
}));
