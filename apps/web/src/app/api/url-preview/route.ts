import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'no url' }, { status: 400 });

  try {
    const domain = new URL(url).hostname;
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    // YouTube は通常スクレイピングだと同意ページ等でタイトルが取れず「- YouTube」になりがち。
    // 公式 oEmbed で動画タイトルを確実に取得する。
    if (/(?:youtube\.com|youtu\.be)/.test(domain)) {
      try {
        const oe = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (oe.ok) {
          const data = await oe.json() as { title?: string };
          if (data.title) return NextResponse.json({ title: data.title, favicon, url });
        }
      } catch { /* oEmbed 失敗時は下の通常スクレイピングにフォールバック */ }
    }

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
