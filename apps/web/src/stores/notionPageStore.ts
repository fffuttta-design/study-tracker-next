
import { create } from 'zustand';
import { type NotionPage, type BookChapter, createNotionPage } from '@study-tracker/core';
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

// content 内に該当ページへのリンクが既に存在するか（本文の単体リンク + 看板=pageTable の中も再帰的に走査）
// これを見ないと、看板にしか無いページを「本文にリンクが無い」と誤判定して単体リンクを二重追加してしまう
function contentHasPageLink(nodes: TipTapNode[], href: string): boolean {
  for (const n of nodes) {
    if (n.type === 'pageLink' && n.attrs?.href === href) return true;
    // ページテーブル（看板）: attrs.sections[].columns[].links[].href を確認
    if (n.type === 'pageTable' && n.attrs?.sections) {
      let secs: unknown = n.attrs.sections;
      if (typeof secs === 'string') { try { secs = JSON.parse(secs); } catch { secs = null; } }
      if (Array.isArray(secs)) {
        for (const sec of secs as { columns?: { links?: { href?: string }[] }[] }[]) {
          for (const col of sec.columns ?? []) {
            for (const lk of col.links ?? []) {
              if (lk.href === href) return true;
            }
          }
        }
      }
    }
    // テーブルビュー: attrs.rows[].href を確認
    if (n.type === 'pageDescTable' && n.attrs?.rows) {
      let rws: unknown = n.attrs.rows;
      if (typeof rws === 'string') { try { rws = JSON.parse(rws); } catch { rws = null; } }
      if (Array.isArray(rws)) {
        for (const r of rws as { href?: string }[]) {
          if (r.href === href) return true;
        }
      }
    }
    if (Array.isArray(n.content) && contentHasPageLink(n.content, href)) return true;
  }
  return false;
}

/** 親ページの content に PageLinkNode を追加（本文・看板のどこかに既存なら何もしない） */
export function addPageLinkToContent(
  content: string, pageId: string, title: string, icon: string,
): string {
  const href = `/notion-plus/${pageId}`;
  const doc  = parseTipTapDoc(content);
  if (contentHasPageLink(doc.content, href)) return content;
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

// ── 本文からページリンクを一括書き換える共通処理 ───────────────────────
// 「親ページが消えたら子へのリンクも消す」「リンク切れ(存在しないページ)を掃除する」を同じ仕組みで実現。
const hrefToId = (href: unknown): string | undefined =>
  (typeof href === 'string' ? (href.match(/\/notion-plus\/([^/?#]+)/)?.[1] ?? undefined) : undefined);

interface LinkRewriteOpts {
  dropSingle: (id: string) => boolean;          // 本文中の単体 pageLink を消すか
  dropTableLink?: (id: string) => boolean;      // 看板/テーブルビューの中のリンクも消すか（未指定なら触らない）
}

// 1つの TipTap doc(JSON文字列) からリンクを除去する。changed=trueなら content は書き換わっている。
function rewriteDocLinks(content: string, opts: LinkRewriteOpts): { content: string; changed: boolean } {
  if (!content) return { content, changed: false };
  let doc: TipTapDoc;
  try { doc = JSON.parse(content) as TipTapDoc; } catch { return { content, changed: false }; }
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) return { content, changed: false };
  let changed = false;

  const walk = (nodes: TipTapNode[]): TipTapNode[] => {
    const out: TipTapNode[] = [];
    for (const n of nodes) {
      // 単体ページリンク
      if (n.type === 'pageLink') {
        const id = hrefToId(n.attrs?.href);
        if (id && opts.dropSingle(id)) { changed = true; continue; }
      }
      let node: TipTapNode = n;
      // 看板（pageTable）の中のリンク
      if (opts.dropTableLink && node.type === 'pageTable' && node.attrs?.sections) {
        let secs: unknown = node.attrs.sections;
        if (typeof secs === 'string') { try { secs = JSON.parse(secs); } catch { secs = null; } }
        if (Array.isArray(secs)) {
          let secChanged = false;
          const ns = (secs as Array<{ columns?: Array<{ links?: Array<{ href?: string }> }> }>).map((sec) => ({
            ...sec,
            columns: (sec.columns ?? []).map((col) => ({
              ...col,
              links: (col.links ?? []).filter((lk) => {
                const id = hrefToId(lk.href);
                const drop = !!id && opts.dropTableLink!(id);
                if (drop) secChanged = true;
                return !drop;
              }),
            })),
          }));
          if (secChanged) { changed = true; node = { ...node, attrs: { ...node.attrs, sections: ns } }; }
        }
      }
      // テーブルビュー（pageDescTable）の中の行
      if (opts.dropTableLink && node.type === 'pageDescTable' && node.attrs?.rows) {
        let rws: unknown = node.attrs.rows;
        if (typeof rws === 'string') { try { rws = JSON.parse(rws); } catch { rws = null; } }
        if (Array.isArray(rws)) {
          let rowsChanged = false;
          const nr = (rws as Array<{ href?: string }>).filter((r) => {
            const id = hrefToId(r.href);
            const drop = !!id && opts.dropTableLink!(id);
            if (drop) rowsChanged = true;
            return !drop;
          });
          if (rowsChanged) { changed = true; node = { ...node, attrs: { ...node.attrs, rows: nr } }; }
        }
      }
      // 子を再帰
      if (Array.isArray(node.content)) node = { ...node, content: walk(node.content) };
      out.push(node);
    }
    return out;
  };

  const newContent = walk(doc.content);
  if (!changed) return { content, changed: false };
  return { content: JSON.stringify({ ...doc, content: newContent }), changed: true };
}

// ページ種別を考慮してリンクを除去（ブックは全チャプターを処理／DBは対象外）
function rewritePageContentLinks(page: NotionPage, opts: LinkRewriteOpts): { content: string; changed: boolean } {
  if (page.type === 'database') return { content: page.content, changed: false };
  if (page.type === 'book') {
    let parsed: { chapters?: BookChapter[] };
    try { parsed = JSON.parse(page.content || '{}'); } catch { return { content: page.content, changed: false }; }
    if (!Array.isArray(parsed.chapters)) return { content: page.content, changed: false };
    let changed = false;
    const chapters = parsed.chapters.map((ch) => {
      const r = rewriteDocLinks(ch.content, opts);
      if (r.changed) { changed = true; return { ...ch, content: r.content }; }
      return ch;
    });
    if (!changed) return { content: page.content, changed: false };
    return { content: JSON.stringify({ ...parsed, chapters }), changed: true };
  }
  return rewriteDocLinks(page.content || '', opts);
}

/** 存在しないページ（existingIds に無い）を指す本文の単体リンクを除去。看板/テーブルビューには触らない（誤検出で説明文を失わないため）。 */
export function stripDeadSingleLinks(page: NotionPage, existingIds: Set<string>): { content: string; changed: boolean } {
  return rewritePageContentLinks(page, { dropSingle: (id) => !existingIds.has(id) });
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
    const idSet = new Set(allIds);

    // 削除されるページへのリンクを、残る全ページの本文（単体リンク・看板・テーブルビュー・ブック章）から除去。
    // ＝親（や参照元）が消えたら、その子へのリンクも自動で消える＝リンク切れ "Untitled" を残さない。
    const contentUpdates: { id: string; content: string; updatedAt: string }[] = [];
    const now = new Date().toISOString();
    for (const p of pages) {
      if (idSet.has(p.id)) continue; // これから消すページ自身は対象外
      const { content, changed } = rewritePageContentLinks(p, {
        dropSingle: (lid) => idSet.has(lid),
        dropTableLink: (lid) => idSet.has(lid),
      });
      if (changed) contentUpdates.push({ id: p.id, content, updatedAt: now });
    }
    if (contentUpdates.length > 0) await batchUpsert(uid, 'notionPages', contentUpdates);

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
