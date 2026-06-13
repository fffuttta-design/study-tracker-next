
import { create } from 'zustand';
import { type NotionPage, createNotionPage } from '@study-tracker/core';
import { subscribeCol, upsertDoc, deleteDocById, fetchWhere, batchUpsert, batchDelete } from '@study-tracker/firebase';

// ── TipTap content 内の PageLinkNode を操作するユーティリティ ─────────────

type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[] };
type TipTapDoc  = { type: 'doc'; content: TipTapNode[] };

function parseTipTapDoc(content: string): TipTapDoc {
  if (!content) return { type: 'doc', content: [] };
  try {
    const doc = JSON.parse(content) as TipTapDoc;
    if (doc.type === 'doc' && Array.isArray(doc.content)) return doc;
  } catch { /* ignore */ }
  return { type: 'doc', content: [] };
}

/** 親ページの content に PageLinkNode を追加（既存なら何もしない） */
export function addPageLinkToContent(
  content: string, pageId: string, title: string, icon: string,
): string {
  const href = `/notion-plus/${pageId}`;
  const doc  = parseTipTapDoc(content);
  if (doc.content.some((n) => n.type === 'pageLink' && n.attrs?.href === href)) return content;
  const newDoc: TipTapDoc = {
    ...doc,
    content: [...doc.content, { type: 'pageLink', attrs: { href, title: title || 'Untitled', icon: icon || '📄' } }],
  };
  return JSON.stringify(newDoc);
}

/** 親ページの content から PageLinkNode を削除（なければ何もしない） */
export function removePageLinkFromContent(content: string, pageId: string): string {
  if (!content) return content;
  const href = `/notion-plus/${pageId}`;
  const doc  = parseTipTapDoc(content);
  const filtered = doc.content.filter((n) => !(n.type === 'pageLink' && n.attrs?.href === href));
  if (filtered.length === doc.content.length) return content; // 変化なし
  return JSON.stringify({ ...doc, content: filtered });
}

// '__workspace__' は Firestore の予約済み ID で書き込み不可のため変更
export const WORKSPACE_ID = 'workspace';
// 旧 ID（移行用）
const LEGACY_WORKSPACE_ID = '__workspace__';

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
  add: (uid: string, params?: { parentId?: string; order?: number; type?: 'page' | 'database' | 'book'; notionId?: string; title?: string; icon?: string }) => Promise<NotionPage>;
  update: (uid: string, id: string, data: Partial<NotionPage>) => Promise<void>;
  batchUpdate: (uid: string, updates: Array<{ id: string; content: string }>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
  ensureWorkspace: (uid: string) => Promise<void>;
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

  ensureWorkspace: async (uid) => {
    const { pages } = useNotionPageStore.getState();
    if (pages.find((p) => p.id === WORKSPACE_ID)) return;

    // 旧 ID(__workspace__) のデータがあればコンテンツを引き継ぐ
    const legacy = pages.find((p) => p.id === LEGACY_WORKSPACE_ID);
    const workspace: NotionPage = legacy
      ? { ...legacy, id: WORKSPACE_ID, updatedAt: new Date().toISOString() }
      : {
          id: WORKSPACE_ID,
          title: 'ワークスペース',
          content: '',
          icon: '🏠',
          order: -9999,
          updatedAt: new Date().toISOString(),
          isFavorite: false,
        };
    await upsertDoc(uid, 'notionPages', WORKSPACE_ID, workspace as unknown as Record<string, unknown>);

    // 旧ワークスペースの子ページの parentId を新 ID に更新
    if (legacy) {
      const children = useNotionPageStore.getState().pages.filter(
        (p) => p.parentId === LEGACY_WORKSPACE_ID,
      );
      if (children.length > 0) {
        const now = new Date().toISOString();
        await batchUpsert(
          uid,
          'notionPages',
          children.map((c) => ({ id: c.id, parentId: WORKSPACE_ID, updatedAt: now })),
        );
      }
    }
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
