import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export interface TriagePage {
  id: string;
  title: string;
  icon: string;
  path: string; // 親ページ > 子ページ 形式
}

export interface TriageRequest {
  title: string;
  content: string;
  pages: TriagePage[];
}

export interface TriageSuggestion {
  pageId: string;
  title: string;
  icon: string;
  reason: string;
}

export interface TriageResponse {
  suggestions: TriageSuggestion[];
  refinedTitle: string;
  refinedContent: string;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
  }

  const body = (await req.json()) as TriageRequest;
  const { title, content, pages } = body;

  if (!title && !content) {
    return NextResponse.json({ error: 'メモが空です' }, { status: 400 });
  }

  // ページ一覧をテキスト化（多すぎる場合は先頭60件に絞る）
  const pageList = pages.slice(0, 60).map((p) =>
    `- id: ${p.id} | タイトル: ${p.title || '（無題）'} | パス: ${p.path || p.title || '（無題）'}`
  ).join('\n');

  const userMessage = `
## 特急メモ
タイトル: ${title || '（なし）'}
内容:
${content || '（なし）'}

## 利用可能なNotionPlusページ一覧
${pageList || '（ページなし）'}
`.trim();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `あなたは学習管理アプリのアシスタントです。
ユーザーが素早く書き留めた「特急メモ」を整理し、既存のNotionPlusページのどこに入れるべきかを提案します。

## 出力形式（必ずこのJSONのみを返すこと）
{
  "suggestions": [
    { "pageId": "ページのid", "reason": "この内容が合う理由（20字以内）" },
    { "pageId": "ページのid", "reason": "この内容が合う理由（20字以内）" },
    { "pageId": "ページのid", "reason": "この内容が合う理由（20字以内）" }
  ],
  "refinedTitle": "学習アイテムとして適切なタイトル（30字以内）",
  "refinedContent": "後から復習しやすいよう軽く整形した内容（元の情報を保持しつつ簡潔に）"
}

## ルール
- suggestionsは最大3件。適切なページが少ない場合はそれ以下でもよい
- ページ一覧にない pageId は絶対に使わない
- refinedContent は元の内容を大きく変えない。誤字脱字を直し読みやすくする程度
- 内容に合うページが全くない場合は suggestions を空配列にする
- JSONのみ返す（マークダウンコードブロック不要）`,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  // コードブロックを除去してJSONをパース
  const jsonText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: {
    suggestions: { pageId: string; reason: string }[];
    refinedTitle: string;
    refinedContent: string;
  };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return NextResponse.json({ error: 'AIの応答を解析できませんでした', raw: rawText }, { status: 502 });
  }

  // pageId をページ情報で補完
  const suggestions: TriageSuggestion[] = parsed.suggestions
    .map((s) => {
      const page = pages.find((p) => p.id === s.pageId);
      if (!page) return null;
      return { pageId: page.id, title: page.title, icon: page.icon, reason: s.reason };
    })
    .filter((s): s is TriageSuggestion => s !== null);

  const result: TriageResponse = {
    suggestions,
    refinedTitle: parsed.refinedTitle || title,
    refinedContent: parsed.refinedContent || content,
  };

  return NextResponse.json(result);
}
