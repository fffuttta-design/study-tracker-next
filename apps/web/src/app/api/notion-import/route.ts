import { NextRequest } from 'next/server';
import type { DbProperty, DbPropertyType, DbSelectOption } from '@study-tracker/core';

export const runtime = 'edge';

// 同時リクエスト数を制限するセマフォ（Notion APIレート制限対策）
function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
const sem = createSemaphore(3);

const NOTION_VERSION = '2022-06-28';

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function extractPageId(url: string): string | null {
  // クエリパラメーター・フラグメントを除去してから最後のパスセグメントを取得
  // （タイトル末尾がhex文字の場合に誤マッチしないよう $ でアンカー）
  const cleanUrl = url.split('?')[0].split('#')[0];
  const lastSegment = cleanUrl.split('/').pop() ?? '';
  const raw = lastSegment.replace(/-/g, '').match(/([a-f0-9]{32})$/i)?.[1];
  if (!raw) return null;
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
}

const NOTION_COLORS: Record<string, string> = {
  red: '#DC2626', orange: '#EA580C', yellow: '#CA8A04',
  green: '#16A34A', blue: '#2563EB', purple: '#7C3AED',
  pink: '#DB2777', gray: '#6B7280', brown: '#92400E',
};

const NOTION_SELECT_COLOR: Record<string, string> = {
  default: 'gray', gray: 'gray', brown: 'gray',
  orange: 'yellow', yellow: 'yellow',
  green: 'green', blue: 'blue', purple: 'purple',
  pink: 'pink', red: 'red',
};

function mapNotionPropType(notionType: string): DbPropertyType | null {
  const map: Record<string, DbPropertyType> = {
    title: 'title', rich_text: 'text', number: 'number',
    select: 'select', multi_select: 'select', checkbox: 'checkbox', date: 'date',
  };
  return map[notionType] ?? null;
}

function toTextNodes(richTexts: Array<Record<string, unknown>>) {
  return richTexts.map((t) => {
    const text = (t.plain_text as string) ?? '';
    const ann = (t.annotations ?? {}) as Record<string, unknown>;
    const marks: Array<Record<string, unknown>> = [];
    if (ann.bold) marks.push({ type: 'bold' });
    if (ann.italic) marks.push({ type: 'italic' });
    if (ann.strikethrough) marks.push({ type: 'strike' });
    if (ann.code) marks.push({ type: 'code' });
    const color = ann.color as string | undefined;
    if (color && color !== 'default' && !color.endsWith('_background')) {
      const css = NOTION_COLORS[color];
      if (css) marks.push({ type: 'textStyle', attrs: { color: css } });
    }
    // インラインページメンション（@ページ）→ notion-child:// プレースホルダーリンク
    const tType = t.type as string | undefined;
    if (tType === 'mention') {
      const mention = (t.mention ?? {}) as Record<string, unknown>;
      if (mention.type === 'page') {
        const pageId = (mention.page as { id?: string } | undefined)?.id;
        if (pageId) {
          marks.push({ type: 'link', attrs: { href: `notion-child://${pageId}`, target: '_self', rel: null } });
          return { type: 'text', text: text || 'Untitled', marks };
        }
      }
      // 日付・ユーザーなどその他のメンションはプレーンテキスト
      return { type: 'text', text };
    }
    const href = t.href as string | null;
    if (href) marks.push({ type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer' } });
    return marks.length ? { type: 'text', text, marks } : { type: 'text', text };
  });
}

function convertBlock(block: Record<string, unknown>, childMetaMap?: Map<string, { title: string; icon: string }>, childrenMap?: Map<string, Record<string, unknown>[]>): Record<string, unknown> | null {
  const type = block.type as string;
  const data = (block[type] ?? {}) as Record<string, unknown>;
  const rt = (data.rich_text ?? []) as Array<Record<string, unknown>>;
  switch (type) {
    case 'paragraph':
      return { type: 'paragraph', content: toTextNodes(rt) };
    case 'heading_1':
      return { type: 'heading', attrs: { level: 1 }, content: toTextNodes(rt) };
    case 'heading_2':
      return { type: 'heading', attrs: { level: 2 }, content: toTextNodes(rt) };
    case 'heading_3':
      return { type: 'heading', attrs: { level: 3 }, content: toTextNodes(rt) };
    case 'bulleted_list_item':
      return { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: toTextNodes(rt) }] }] };
    case 'numbered_list_item':
      return { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: toTextNodes(rt) }] }] };
    case 'to_do':
      return { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: !!(data.checked) }, content: [{ type: 'paragraph', content: toTextNodes(rt) }] }] };
    case 'quote':
      return { type: 'blockquote', content: [{ type: 'paragraph', content: toTextNodes(rt) }] };
    case 'code':
      return { type: 'codeBlock', attrs: { language: (data.language as string) ?? '' }, content: [{ type: 'text', text: rt.map((t) => t.plain_text).join('') }] };
    case 'divider':
      return { type: 'horizontalRule' };
    case 'table': {
      // table ブロックの子(table_row)は childrenMap に既にフェッチ済み
      const tableData = data as { has_column_header?: boolean };
      const rows = childrenMap?.get(block.id as string) ?? [];
      if (rows.length === 0) return null;
      const tiptapRows = rows.map((row, rowIndex) => {
        const rowData = ((row['table_row'] ?? {}) as Record<string, unknown>);
        const cells = (rowData.cells ?? []) as Array<Array<Record<string, unknown>>>;
        const isHeaderRow = !!(tableData.has_column_header && rowIndex === 0);
        return {
          type: 'tableRow',
          content: cells.map((cellRichText) => ({
            type: isHeaderRow ? 'tableHeader' : 'tableCell',
            content: [{ type: 'paragraph', content: toTextNodes(cellRichText) }],
          })),
        };
      });
      return { type: 'table', content: tiptapRows };
    }
    case 'callout': {
      const emoji = ((data.icon as Record<string, unknown>)?.emoji as string) ?? '';
      const firstLineNodes = toTextNodes(rt);
      if (emoji) firstLineNodes.unshift({ type: 'text', text: `${emoji} ` });
      const innerContent: Record<string, unknown>[] = [
        { type: 'paragraph', content: firstLineNodes },
      ];
      // 子ブロック（ネストされたテキスト・ページリンクなど）を展開
      const children = childrenMap?.get(block.id as string) ?? [];
      for (const child of children) {
        const converted = convertBlock(child, childMetaMap, childrenMap);
        if (converted) innerContent.push(converted);
      }
      return { type: 'callout', attrs: { background: '#F3F4F6' }, content: innerContent };
    }
    case 'image': {
      const imgData = data as Record<string, Record<string, string>>;
      const src = imgData.external?.url ?? imgData.file?.url ?? '';
      if (!src) return null;
      const caption = (data.caption as Array<{ plain_text: string }> ?? []).map((c) => c.plain_text).join('');
      return { type: 'image', attrs: { src, alt: caption, title: caption || null } };
    }
    case 'child_page': {
      const title = (data.title as string) ?? 'Untitled';
      const meta = childMetaMap?.get(block.id as string);
      const icon = meta?.icon ?? '📄';
      return { type: 'pageLink', attrs: { href: `notion-child://${block.id as string}`, title, icon } };
    }
    case 'child_database': {
      const title = (data.title as string) ?? 'Untitled';
      return { type: 'inlineDatabase', attrs: { databaseId: `notion-child-db://${block.id as string}`, title } };
    }
    case 'link_to_page': {
      // Notion の「リンクtoページ」ブロック（child_page と異なり任意のページを参照）
      const lpData = data as { type?: string; page_id?: string; database_id?: string };
      const refId = lpData.page_id ?? lpData.database_id;
      if (!refId) return null;
      const meta = childMetaMap?.get(refId);
      const title = meta?.title ?? 'Untitled';
      const icon = meta?.icon ?? (lpData.database_id ? '📊' : '📄');
      return { type: 'pageLink', attrs: { href: `notion-child://${refId}`, title, icon } };
    }
    default:
      return rt.length > 0 ? { type: 'paragraph', content: toTextNodes(rt) } : null;
  }
}

async function fetchPageMeta(pageId: string, token: string) {
  const res = await sem(() => fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders(token) }));
  if (!res.ok) return null;
  const p = await res.json() as Record<string, unknown>;
  const props = (p.properties ?? {}) as Record<string, unknown>;
  const titleProp = Object.values(props).find((v) => (v as Record<string, unknown>).type === 'title') as Record<string, unknown> | undefined;
  const title = ((titleProp?.title ?? []) as Array<{ plain_text: string }>).map((t) => t.plain_text).join('') || 'Untitled';
  const iconRaw = p.icon as { type?: string; emoji?: string; external?: { url: string }; file?: { url: string } } | null;
  let icon = '📄';
  if (iconRaw?.type === 'emoji') icon = iconRaw.emoji ?? '📄';
  else if (iconRaw?.type === 'external') icon = iconRaw.external?.url ?? '📄';
  else if (iconRaw?.type === 'file') icon = iconRaw.file?.url ?? '📄';
  return { id: p.id as string, title, icon };
}

async function fetchAllBlocks(pageId: string, token: string): Promise<Record<string, unknown>[]> {
  const blocks: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const res = await sem(() => fetch(url.toString(), { headers: notionHeaders(token) }));
    if (!res.ok) break;
    const data = await res.json() as { results: Record<string, unknown>[]; has_more: boolean; next_cursor?: string };
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function fetchDatabaseMeta(dbId: string, token: string) {
  const res = await sem(() => fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: notionHeaders(token) }));
  if (!res.ok) return null;
  const db = await res.json() as Record<string, unknown>;
  const titleArr = (db.title as Array<{ plain_text: string }>) ?? [];
  const title = titleArr.map((t) => t.plain_text).join('') || 'Untitled';
  const iconRaw = db.icon as { type?: string; emoji?: string; external?: { url: string }; file?: { url: string } } | null;
  let icon = '📊';
  if (iconRaw?.type === 'emoji') icon = iconRaw.emoji ?? '📊';
  else if (iconRaw?.type === 'external') icon = iconRaw.external?.url ?? '📊';
  else if (iconRaw?.type === 'file') icon = iconRaw.file?.url ?? '📊';
  const notionProps = (db.properties ?? {}) as Record<string, Record<string, unknown>>;
  const properties: DbProperty[] = [];
  for (const [name, prop] of Object.entries(notionProps)) {
    const ourType = mapNotionPropType(prop.type as string);
    if (!ourType) continue;
    const dbProp: DbProperty = { id: prop.id as string, name, type: ourType };
    if (ourType === 'select') {
      const optionsData = prop.type === 'select'
        ? ((prop.select as Record<string, unknown>)?.options ?? [])
        : ((prop.multi_select as Record<string, unknown>)?.options ?? []);
      dbProp.options = (optionsData as Array<{ id: string; name: string; color: string }>).map((opt) => ({
        id: opt.id, name: opt.name, color: NOTION_SELECT_COLOR[opt.color] ?? 'gray',
      } satisfies DbSelectOption));
    }
    properties.push(dbProp);
  }
  const titleIdx = properties.findIndex((p) => p.type === 'title');
  if (titleIdx > 0) { const [tp] = properties.splice(titleIdx, 1); properties.unshift(tp); }
  return { id: db.id as string, title, icon, schema: { properties } };
}

function extractRowCellValue(propValue: Record<string, unknown>): string | number | boolean | null {
  const notionType = propValue.type as string;
  switch (notionType) {
    case 'title': case 'rich_text': {
      const items = (propValue[notionType] as Array<{ plain_text: string }>) ?? [];
      return items.map((i) => i.plain_text).join('') || null;
    }
    case 'number': return (propValue.number as number | null) ?? null;
    case 'select': { const sel = propValue.select as { id: string } | null; return sel?.id ?? null; }
    case 'multi_select': { const items = (propValue.multi_select as Array<{ id: string }>) ?? []; return items[0]?.id ?? null; }
    case 'checkbox': return (propValue.checkbox as boolean) ?? false;
    case 'date': { const d = propValue.date as { start: string } | null; return d?.start ?? null; }
    default: return null;
  }
}

// ── 型定義 ────────────────────────────────────────────────────────────

export interface ImportedDbRow {
  notionId: string;
  cells: Record<string, string | number | boolean | null>;
  pageContent: string;
  order: number;
}

export interface PageData {
  notionId: string;
  title: string;
  icon: string;
  parentNotionId: string | null;
  content: string;
  type?: 'page' | 'database';
  rows?: ImportedDbRow[];
}

type StreamEvent =
  | { type: 'page'; data: PageData }
  | { type: 'skip'; notionId: string; title: string; reason: string }
  | { type: 'done'; total: number; skipped: number }
  | { type: 'error'; message: string };

// ── ページクロール（ストリーミング版） ────────────────────────────────

async function crawlPage(
  pageId: string,
  token: string,
  parentNotionId: string | null,
  emit: (event: StreamEvent) => void,
  depth = 0
): Promise<void> {
  if (depth > 5) {
    emit({ type: 'skip', notionId: pageId, title: '(depth limit)', reason: '階層が深すぎるためスキップ (depth > 5)' });
    return;
  }
  let meta;
  try { meta = await fetchPageMeta(pageId, token); } catch (e) {
    emit({ type: 'skip', notionId: pageId, title: '???', reason: `メタ取得失敗: ${String(e)}` });
    return;
  }
  if (!meta) {
    emit({ type: 'skip', notionId: pageId, title: '???', reason: 'ページが見つからない（共有未設定？）' });
    return;
  }

  let blocks: Record<string, unknown>[] = [];
  try { blocks = await fetchAllBlocks(pageId, token); } catch (e) {
    emit({ type: 'skip', notionId: meta.id, title: meta.title, reason: `ブロック取得失敗: ${String(e)}` });
    return;
  }

  const childPageBlocks = blocks.filter((b) => b.type === 'child_page');
  const childDbBlocks = blocks.filter((b) => b.type === 'child_database');

  // 子メタを並列取得（表示用のみ・軽量）
  const childMetaMap = new Map<string, { title: string; icon: string }>();
  await Promise.all(childPageBlocks.map(async (b) => {
    try { const m = await fetchPageMeta(b.id as string, token); if (m) childMetaMap.set(b.id as string, m); } catch { /* 無視 */ }
  }));

  // has_children なブロック（コールアウトなど）の子ブロックを並列取得
  const childrenMap = new Map<string, Record<string, unknown>[]>();
  const hasChildBlocks = blocks.filter(
    (b) => b.has_children && b.type !== 'child_page' && b.type !== 'child_database'
  );
  await Promise.all(hasChildBlocks.map(async (b) => {
    try {
      const children = await fetchAllBlocks(b.id as string, token);
      if (children.length > 0) childrenMap.set(b.id as string, children);
    } catch { /* 無視 */ }
  }));

  const rawNodes = blocks.map((b) => convertBlock(b, childMetaMap, childrenMap)).filter(Boolean) as Record<string, unknown>[];
  const nodes = rawNodes.filter((node, i) => {
    if (node.type !== 'paragraph') return true;
    const content = node.content as unknown[] | undefined;
    if (content && content.length > 0) return true;
    const prev = i > 0 ? rawNodes[i - 1] : null;
    const next = i < rawNodes.length - 1 ? rawNodes[i + 1] : null;
    return !((prev && prev.type === 'pageLink') || (next && next.type === 'pageLink'));
  });

  // 親を先にemit（DFS順を保証）
  emit({ type: 'page', data: {
    notionId: meta.id, title: meta.title, icon: meta.icon,
    parentNotionId, content: JSON.stringify({ type: 'doc', content: nodes }),
  }});

  // 子ページ・子DBを順番にクロール（DFS順維持のため直列）
  for (const child of childPageBlocks) {
    await crawlPage(child.id as string, token, meta.id, emit, depth + 1).catch((e) => {
      const childMeta = childMetaMap.get(child.id as string);
      emit({ type: 'skip', notionId: child.id as string, title: childMeta?.title ?? 'Untitled', reason: `クロール例外: ${String(e)}` });
    });
  }
  for (const child of childDbBlocks) {
    await crawlDatabase(child.id as string, token, meta.id, emit).catch((e) => {
      emit({ type: 'skip', notionId: child.id as string, title: 'DB', reason: `DBクロール例外: ${String(e)}` });
    });
  }
}

// ── データベースクロール（ストリーミング版） ──────────────────────────

async function crawlDatabase(
  dbId: string,
  token: string,
  parentNotionId: string | null,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const meta = await fetchDatabaseMeta(dbId, token);
  if (!meta) return;

  const notionRows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const res = await sem(() => fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST', headers: notionHeaders(token),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    }));
    if (!res.ok) break;
    const data = await res.json() as { results: Record<string, unknown>[]; has_more: boolean; next_cursor?: string };
    notionRows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  const importedRows: ImportedDbRow[] = [];
  for (let i = 0; i < notionRows.length; i++) {
    const notionRow = notionRows[i];
    const rowId = notionRow.id as string;
    const rowProps = (notionRow.properties ?? {}) as Record<string, Record<string, unknown>>;
    const cells: Record<string, string | number | boolean | null> = {};
    for (const dbProp of meta.schema.properties) {
      const entry = Object.values(rowProps).find((v) => (v as Record<string, unknown>).id === dbProp.id);
      if (!entry) continue;
      const val = extractRowCellValue(entry as Record<string, unknown>);
      if (val !== null) cells[dbProp.id] = val;
    }
    const rowBlocks = await fetchAllBlocks(rowId, token);
    const rawNodes = rowBlocks.map((b) => convertBlock(b)).filter(Boolean) as Record<string, unknown>[];
    const pageContent = JSON.stringify({ type: 'doc', content: rawNodes.length > 0 ? rawNodes : [{ type: 'paragraph' }] });
    importedRows.push({ notionId: rowId, cells, pageContent, order: i });
  }

  emit({ type: 'page', data: {
    notionId: meta.id, title: meta.title, icon: meta.icon,
    parentNotionId, type: 'database',
    content: JSON.stringify(meta.schema), rows: importedRows,
  }});
}

// ── エントリポイント ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'NOTION_TOKEN が設定されていません' }), { status: 500 });
  }

  const body = await req.json() as { action: string; url?: string };
  if (body.action !== 'import-url') {
    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  }

  const pageId = body.url ? extractPageId(body.url) : null;
  if (!pageId) {
    return new Response(JSON.stringify({ error: '有効なNotionページURLではありません' }), { status: 400 });
  }

  const encoder = new TextEncoder();
  let total = 0;
  let skipped = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        if (event.type === 'page') total++;
        if (event.type === 'skip') skipped++;
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        const pageMeta = await fetchPageMeta(pageId, token);
        if (pageMeta) {
          await crawlPage(pageId, token, null, emit);
        } else {
          await crawlDatabase(pageId, token, null, emit);
        }

        if (total === 0) {
          emit({ type: 'error', message: 'ページを取得できませんでした。インテグレーションに共有されているか確認してください。' });
        } else {
          emit({ type: 'done', total, skipped });
        }
      } catch (e) {
        emit({ type: 'error', message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}
