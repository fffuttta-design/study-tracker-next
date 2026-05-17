import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'no url' }, { status: 400 });

  try {
    const domain = new URL(url).hostname;
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudyTracker/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    let title = titleMatch?.[1]?.trim() ?? '';
    // HTML エンティティのデコード
    title = title
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n)));

    return NextResponse.json({ title: title || domain, favicon, url });
  } catch {
    try {
      const domain = new URL(url).hostname;
      return NextResponse.json({
        title: domain,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
        url,
      });
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
  }
}
