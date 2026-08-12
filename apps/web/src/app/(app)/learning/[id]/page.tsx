'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  localDateKey,
  recalcNextReview,
  isFullyCompleted,
} from '@study-tracker/core';

const STAGE_LABELS = ['翌日', '3日後', '7日後', '2週間後', '1ヶ月後'];
const STAGE_COLORS = [
  'bg-red-50 text-red-600 border-red-200',
  'bg-yellow-50 text-yellow-700 border-yellow-200',
  'bg-green-50 text-green-700 border-green-200',
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
];

/**
 * 学習アイテム（特急メモ含む）1枚の専用ページ。/learning/[id]
 * Discordの復習通知や、アプリ内から「そのカードだけ」を開く入口。
 * 本文の表示・復習の完了・元ノートへのジャンプを1枚で行う。
 */
export default function LearningItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuthStore();
  const uid = user?.uid;
  const { items, loading, update } = useLearningStore();
  const reviewStageDays = useSettingsStore((s) => s.reviewStageDays);

  const item = useMemo(() => items.find((i) => i.id === id), [items, id]);

  const nextReview = item?.reviews.find((r) => !r.completed);
  const fullyDone = item ? isFullyCompleted(item) : false;

  const noteHref = (() => {
    if (!item?.notionPageId) return null;
    if (item.isPageReview) {
      const chapterQ = item.chapterId ? `&chapter=${encodeURIComponent(item.chapterId)}` : '';
      return `/notion-plus/${item.notionPageId}?from=2${chapterQ}`;
    }
    const rawLine = (item.content.split('\n').find((l) => l.trim().length > 5) ?? item.content).trim();
    const hl = rawLine
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^>\s+/, '')
      .replace(/[*_`~]/g, '')
      .trim()
      .slice(0, 80);
    return `/notion-plus/${item.notionPageId}?hl=${encodeURIComponent(hl)}&from=2`;
  })();

  const completeReview = async () => {
    if (!uid || !item || !nextReview) return;
    const today = localDateKey();
    const stageIdx = nextReview.stageIndex;
    let updated = item.reviews.map((r) =>
      !r.completed && r.stageIndex === stageIdx ? { ...r, completed: true } : r
    );
    updated = recalcNextReview(updated, stageIdx, today, reviewStageDays);
    await update(uid, item.id, { reviews: updated });
  };

  if (loading && !item) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-20 text-center">
        <div className="text-4xl">🔍</div>
        <p className="text-gray-600">このカードは見つかりませんでした（削除された可能性があります）。</p>
        <Link href="/learning?tab=2" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          今日の復習へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      {/* 戻る */}
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <span>←</span><span>戻る</span>
      </button>

      {/* パンくず（元ノートの階層） */}
      {item.notionPagePath && (
        <div className="mb-2 truncate text-xs text-gray-400">{item.notionPagePath}</div>
      )}

      {/* タイトル */}
      <h1 className="mb-3 text-2xl font-bold text-gray-900">{item.title || '（無題）'}</h1>

      {/* 状態バッジ */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        {fullyDone ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-500">復習コンプリート ✓</span>
        ) : nextReview ? (
          <span className={`rounded-full border px-2.5 py-1 font-medium ${STAGE_COLORS[nextReview.stageIndex] ?? STAGE_COLORS[0]}`}>
            次の復習：{STAGE_LABELS[nextReview.stageIndex] ?? ''}（{nextReview.scheduledDate}）
          </span>
        ) : null}
        {!item.notionPageId && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">⚡ 特急メモ</span>
        )}
      </div>

      {/* 本文（typographyプラグイン非依存で子要素を直接スタイル） */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 text-sm leading-relaxed text-gray-800 [&_a]:text-brand-600 [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-200 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-bold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-bold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]}>
          {item.content || '（本文なし）'}
        </ReactMarkdown>
      </div>

      {/* アクション */}
      <div className="flex flex-wrap gap-2">
        {nextReview && !fullyDone && (
          <button
            onClick={completeReview}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            ✓ この復習を完了
          </button>
        )}
        {noteHref && (
          <Link
            href={noteHref}
            className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-100"
          >
            📖 元ノートを開く
          </Link>
        )}
        {/* 標準機能と同じ消化モーダルへ。ページ全体/章の復習カード以外はいつでも消化できる
            （ページ紐付け済みでも、消化し直せば本文をページに入れ直せる）。 */}
        {!item.isPageReview && (
          <Link
            href={`/learning?digest=${item.id}`}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
          >
            🔀 消化する
          </Link>
        )}
        <Link
          href="/learning?tab=2"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          今日の復習リスト
        </Link>
      </div>
    </div>
  );
}
