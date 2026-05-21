import { NextRequest, NextResponse } from 'next/server';
import type { DbProperty, DbPropertyType, DbSelectOption } from '@study-tracker/core';

export const maxDuration = 60;

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
const sem = createSemaphore(5); // 同時5リクエストまで

// 親→子の順になるようトポロジカルソート
function topoSort(pages: PageData[]): PageData[] {
  const sorted: PageData[] = [];
  const added = new Set<string>();
  const remaining = [...pages];
  let changed = true;
  while (changed && remaining.length > 0) {
    changed = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const p = remaining[i];
      if (!p.parentNotionId || added.has(p.parentNotionId)) {
        sorted.push(p);
        added.add(p.notionId);
        remaining.splice(i, 1);
        changed = true;
      }
    }
  }
  sorted.push(...remaining); // 親が見つからない孤立ページも追加
  return sorted;
}

const NOTION_VERSION = '2022-06-28';

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

// NotionページURLからページIDを抽出
function extractPageId(url: string): string | null {
  const raw = url.replace(/-/g, '').match(/([a-f0-9]{32})/i)?.[1];
  if (!raw) return null;
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
}

// Notion color → CSS color
const NOTION_COLORS: Record<string, string> = {
  red: '#DC2626', orange: '#EA580C', yellow: '#CA8A04',
  green: '#16A34A', blue: '#2563EB', purple: '#7C3AED',
  pink: '#DB2777', gray: '#6B7280', brown: '#92400E',
};

// Notion select color → our color name
const NOTION_SELECT_COLOR: Record<string, string> = {
  default: 'gray', gray: 'gray', brown: 'gray',
  orange: 'yellow', yellow: 'yellow',
  green: 'green', blue: 'blue', purple: 'purple',
  pink: 'pink', red: 'red',
};

// Notion property type → our DbPropertyType
function mapNotionPropType(notionType: string): DbPropertyType | null {
  const map: Record<string, DbPropertyType> = {
    title: 'title',
    rich_text: 'text',
    number: 'number',
    select: 'select',
    multi_select: 'select',
    checkbox: 'checkbox',
    date: 'date',
  };
  return map[notionType] ?? null;
}

function toTextNodes(richTexts: Array<Record<string, unknown>>) {
  return richTexts.map((t) => {
    const text = (t.plain_text as string) ?? '';
    const ann = (t.annotations ?? {}) as Record<string, unknown>;
    const href = t.href as string | null;
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

    if (href) marks.push({ type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer' } });

    return marks.length ? { type: 'text', text, marks } : { type: 'text', text };
  });
}

function convertBlock(block: Record<string, unknown>, childMetaMap?: Map<string, { title: string; icon: string }>): Record<string, unknown> | null {
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
    case 'callout': {
      const emoji = ((data.icon as Record<string, unknown>)?.emoji as string) ?? '';
      const nodes = toTextNodes(rt);
      if (emoji) nodes.unshift({ type: 'text', text: `${emoji} ` });
      return { type: 'blockquote', content: [{ type: 'paragraph', content: nodes }] };
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
      return {
        type: 'pageLink',
        attrs: { href: `notion-child://${block.id as string}`, title, icon },
      };
    }
    case 'child_database': {
      const title = (data.title as string) ?? 'Untitled';
      return {
        type: 'inlineDatabase',
        attrs: {
          databaseId: `notion-child-db://${block.id as string}`,
          title,
        },
      };
    }
    default:
      return rt.length > 0 ? { type: 'paragraph', content: toTextNodes(rt) } : null;
  }
}

async function fetchPageMeta(pageId: string, token: string) {
  const res = await sem(() => fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: notionHeaders(token),
  }));
  if (!res.ok) return null;
  const p = await res.json() as Record<string, unknown>;

  const props = (p.properties ?? {}) as Record<string, unknown>;
  const titleProp = Object.values(props).find((v) => (v as Record<string, unknown>).type === 'title') as Record<string, unknown> | undefined;
  const titleArr = ((titleProp?.title ?? []) as Array<{ plain_text: string }>);
  const title = titleArr.map((t) => t.plain_text).join('') || 'Untitled';

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

// ── データベース専用 ──────────────────────────────────────────────────

async function fetchDatabaseMeta(dbId: string, token: string) {
  const res = await sem(() => fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    headers: notionHeaders(token),
  }));
  if (!res.ok) return null;
  const db = await res.json() as Record<string, unknown>;

  // タイトル
  const titleArr = (db.title as Array<{ plain_text: string }>) ?? [];
  const title = titleArr.map((t) => t.plain_text).join('') || 'Untitled';

  // アイコン
  const iconRaw = db.icon as { type?: string; emoji?: string; external?: { url: string }; file?: { url: string } } | null;
  let icon = '📊';
  if (iconRaw?.type === 'emoji') icon = iconRaw.emoji ?? '📊';
  else if (iconRaw?.type === 'external') icon = iconRaw.external?.url ?? '📊';
  else if (iconRaw?.type === 'file') icon = iconRaw.file?.url ?? '📊';

  // プロパティ → スキーマ
  const notionProps = (db.properties ?? {}) as Record<string, Record<string, unknown>>;
  const properties: DbProperty[] = [];

  for (const [name, prop] of Object.entries(notionProps)) {
    const ourType = mapNotionPropType(prop.type as string);
    if (!ourType) continue;

    const dbProp: DbProperty = {
      id: prop.id as string, // Notion の prop ID をそのまま使用
      name,
      type: ourType,
    };

    // セレクトオプション
    if (ourType === 'select') {
      const optionsData = prop.type === 'select'
        ? ((prop.select as Record<string, unknown>)?.options ?? [])
        : ((prop.multi_select as Record<string, unknown>)?.options ?? []);
      dbProp.options = (optionsData as Array<{ id: string; name: string; color: string }>).map((opt) => ({
        id: opt.id,
        name: opt.name,
        color: NOTION_SELECT_COLOR[opt.color] ?? 'gray',
      } satisfies DbSelectOption));
    }

    properties.push(dbProp);
  }

  // title プロパティを先頭に
  const titleIdx = properties.findIndex((p) => p.type === 'title');
  if (titleIdx > 0) {
    const [tp] = properties.splice(titleIdx, 1);
    properties.unshift(tp);
  }

  return { id: db.id as string, title, icon, schema: { properties } };
}

function extractRowCellValue(
  propValue: Record<string, unknown>,
): string | number | boolean | null {
  const notionType = propValue.type as string;
  switch (notionType) {
    case 'title':
    case 'rich_text': {
      const items = (propValue[notionType] as Array<{ plain_text: string }>) ?? [];
      return items.map((i) => i.plain_text).join('') || null;
    }
    case 'number':
      return (propValue.number as number | null) ?? null;
    case 'select': {
      const sel = propValue.select as { id: string } | null;
      return sel?.id ?? null;
    }
    case 'multi_select': {
      const items = (propValue.multi_select as Array<{ id: string }>) ?? [];
      return items[0]?.id ?? null; // 先頭のみ
    }
    case 'checkbox':
      return (propValue.checkbox as boolean) ?? false;
    case 'date': {
      const d = propValue.date as { start: string } | null;
      return d?.start ?? null;
    }
    default:
      return null;
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

// ── ページクロール ────────────────────────────────────────────────────

async function crawlPage(
  pageId: string,
  token: string,
  parentNotionId: string | null,
  result: PageData[],
  depth = 0
): Promise<void> {
  if (depth > 5) return; // 深さ制限（無限再帰防止）

  let meta;
  try {
    meta = await fetchPageMeta(pageId, token);
  } catch { return; }
  if (!meta) return;

  let blocks: Record<string, unknown>[] = [];
  try {
    blocks = await fetchAllBlocks(pageId, token);
  } catch { /* ブロック取得失敗時は空コンテンツで続行 */ }

  const childPageBlocks = blocks.filter((b) => b.type === 'child_page');
  const childDbBlocks = blocks.filter((b) => b.type === 'child_database');

  // 子ページのメタを並列取得
  const childMetaMap = new Map<string, { title: string; icon: string }>();
  await Promise.all(
    childPageBlocks.map(async (b) => {
      try {
        const m = await fetchPageMeta(b.id as string, token);
        if (m) childMetaMap.set(b.id as string, m);
      } catch { /* 個別失敗は無視 */ }
    })
  );

  const rawNodes = blocks
    .map((b) => convertBlock(b, childMetaMap))
    .filter(Boolean) as Record<string, unknown>[];

  const nodes = rawNodes.filter((node, i) => {
    if (node.type !== 'paragraph') return true;
    const content = node.content as unknown[] | undefined;
    if (content && content.length > 0) return true;
    const prev = i > 0 ? rawNodes[i - 1] : null;
    const next = i < rawNodes.length - 1 ? rawNodes[i + 1] : null;
    return !(
      (prev && prev.type === 'pageLink') ||
      (next && next.type === 'pageLink')
    );
  });

  result.push({
    notionId: meta.id,
    title: meta.title,
    icon: meta.icon,
    parentNotionId,
    content: JSON.stringify({ type: 'doc', content: nodes }),
  });

  // 子ページ・子DBを並列クロール（同一深さは並列、各ブランチは独立）
  await Promise.all([
    ...childPageBlocks.map((child) =>
      crawlPage(child.id as string, token, meta.id, result, depth + 1).catch(() => { /* 個別失敗は無視 */ })
    ),
    ...childDbBlocks.map((child) =>
      crawlDatabase(child.id as string, token, meta.id, result).catch(() => { /* 個別失敗は無視 */ })
    ),
  ]);
}

// ── データベースクロール ──────────────────────────────────────────────

async function crawlDatabase(
  dbId: string,
  token: string,
  parentNotionId: string | null,
  result: PageData[]
): Promise<void> {
  const meta = await fetchDatabaseMeta(dbId, token);
  if (!meta) return;

  // 全行を取得
  const notionRows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const res = await sem(() => fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    }));
    if (!res.ok) break;
    const data = await res.json() as { results: Record<string, unknown>[]; has_more: boolean; next_cursor?: string };
    notionRows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  // 各行を変換
  const importedRows: ImportedDbRow[] = [];
  for (let i = 0; i < notionRows.length; i++) {
    const notionRow = notionRows[i];
    const rowId = notionRow.id as string;
    const rowProps = (notionRow.properties ?? {}) as Record<string, Record<string, unknown>>;

    // プロパティ値を変換（Notion propID でマッチ）
    const cells: Record<string, string | number | boolean | null> = {};
    for (const dbProp of meta.schema.properties) {
      // rowProps はキー＝プロパティ名 だが .id フィールドで dbProp.id と照合
      const entry = Object.values(rowProps).find(
        (v) => (v as Record<string, unknown>).id === dbProp.id
      );
      if (!entry) continue;
      const val = extractRowCellValue(entry as Record<string, unknown>);
      if (val !== null) cells[dbProp.id] = val;
    }

    // 行のページ本文を取得
    const blocks = await fetchAllBlocks(rowId, token);
    const rawNodes = blocks.map((b) => convertBlock(b)).filter(Boolean) as Record<string, unknown>[];
    const pageContent = JSON.stringify({
      type: 'doc',
      content: rawNodes.length > 0 ? rawNodes : [{ type: 'paragraph' }],
    });

    importedRows.push({ notionId: rowId, cells, pageContent, order: i });
  }

  result.push({
    notionId: meta.id,
    title: meta.title,
    icon: meta.icon,
    parentNotionId,
    type: 'database',
    content: JSON.stringify(meta.schema),
    rows: importedRows,
  });
}

// ── エントリポイント ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN が設定されていません' }, { status: 500 });

  const body = await req.json() as { action: string; url?: string };

  if (body.action === 'import-url') {
    const pageId = body.url ? extractPageId(body.url) : null;
    if (!pageId) return NextResponse.json({ error: '有効なNotionページURLではありません' }, { status: 400 });

    const result: PageData[] = [];

    // まずページとして試みる。失敗したらデータベースとして試みる
    const pageMeta = await fetchPageMeta(pageId, token);
    if (pageMeta) {
      await crawlPage(pageId, token, null, result);
    } else {
      await crawlDatabase(pageId, token, null, result);
    }

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'ページを取得できませんでした。インテグレーションに共有されているか確認してください。' },
        { status: 404 }
      );
    }

    return NextResponse.json({ pages: topoSort(result) });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
