
import { create } from 'zustand';
import { type NotionPage, createNotionPage } from '@study-tracker/core';
import { subscribeCol, upsertDoc, deleteDocById } from '@study-tracker/firebase';

interface NotionPageState {
  pages: NotionPage[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string, params?: { parentId?: string; order?: number }) => Promise<NotionPage>;
  update: (uid: string, id: string, data: Partial<NotionPage>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
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
    const page = createNotionPage(params);
    await upsertDoc(uid, 'notionPages', page.id, page as unknown as Record<string, unknown>);
    return page;
  },

  update: async (uid, id, data) => {
    const updated = { ...data, updatedAt: new Date().toISOString() };
    await upsertDoc(uid, 'notionPages', id, updated as Record<string, unknown>);
  },

  remove: async (uid, id) => {
    await deleteDocById(uid, 'notionPages', id);
  },
}));
