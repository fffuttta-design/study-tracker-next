import { NextRequest, NextResponse } from 'next/server';

const NOTION_VERSION = '2022-06-28';

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

// NotionページURLからページIDを抽出
// 例: https://www.notion.so/Title-abc123def456... → abc123de-f456-...
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

    // 文字色（"red", "blue" など。"default" や "xxx_background" は無視）
    const color = ann.color as string | undefined;
    if (color && color !== 'default' && !color.endsWith('_background')) {
      const css = NOTION_COLORS[color];
      if (css) marks.push({ type: 'textStyle', attrs: { color: css } });
    }

    // リンク
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
      // external or file（signed URL）
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
        attrs: {
          href: `notion-child://${block.id as string}`,
          title,
          icon,
        },
      };
    }
    case 'child_database':
      return null;
    default:
      return rt.length > 0 ? { type: 'paragraph', content: toTextNodes(rt) } : null;
  }
}

async function fetchPageMeta(pageId: string, token: string) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: notionHeaders(token),
  });
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
    const res = await fetch(url.toString(), { headers: notionHeaders(token) });
    if (!res.ok) break;
    const data = await res.json() as { results: Record<string, unknown>[]; has_more: boolean; next_cursor?: string };
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

export interface PageData {
  notionId: string;
  title: string;
  icon: string;
  parentNotionId: string | null;
  content: string;
}

// ページ + 全子孫を深さ優先で収集（親が必ず先）
async function crawlPage(
  pageId: string,
  token: string,
  parentNotionId: string | null,
  result: PageData[]
): Promise<void> {
  const meta = await fetchPageMeta(pageId, token);
  if (!meta) return;

  const blocks = await fetchAllBlocks(pageId, token);
  const childPageBlocks = blocks.filter((b) => b.type === 'child_page');

  // 子ページのアイコンを先に取得して pageLink ノードに埋め込む
  const childMetaMap = new Map<string, { title: string; icon: string }>();
  await Promise.all(
    childPageBlocks.map(async (b) => {
      const m = await fetchPageMeta(b.id as string, token);
      if (m) childMetaMap.set(b.id as string, m);
    })
  );

  const nodes = blocks.map((b) => convertBlock(b, childMetaMap)).filter(Boolean);

  result.push({
    notionId: meta.id,
    title: meta.title,
    icon: meta.icon,
    parentNotionId,
    content: JSON.stringify({ type: 'doc', content: nodes }),
  });

  for (const child of childPageBlocks) {
    await crawlPage(child.id as string, token, meta.id, result);
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOTION_TOKEN が設定されていません' }, { status: 500 });

  const body = await req.json() as { action: string; url?: string };

  if (body.action === 'import-url') {
    const pageId = body.url ? extractPageId(body.url) : null;
    if (!pageId) return NextResponse.json({ error: '有効なNotionページURLではありません' }, { status: 400 });

    const result: PageData[] = [];
    await crawlPage(pageId, token, null, result);

    if (result.length === 0) return NextResponse.json({ error: 'ページを取得できませんでした。インテグレーションに共有されているか確認してください。' }, { status: 404 });

    return NextResponse.json({ pages: result });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
