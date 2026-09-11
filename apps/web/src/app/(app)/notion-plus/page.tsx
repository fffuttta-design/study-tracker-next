'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { NotionPage } from '@study-tracker/core';

// ── 小物 ──────────────────────────────────────────────────────────────

/** アイコンは絵文字か画像URL（Sidebar と同じ扱い）。 */
function PageIcon({ icon, size = 'md' }: { icon: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
  const text = size === 'lg' ? 'text-2xl' : 'text-base';
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={`${box} shrink-0 rounded object-cover`} style={{ aspectRatio: '1/1' }} />;
  }
  return <span className={`${text} shrink-0 leading-none`}>{icon}</span>;
}

/** 親の題名を "A › B" でつないで返す（そのページがどこにあるか） */
function ancestorPath(pages: NotionPage[], page: NotionPage): string {
  const parts: string[] = [];
  let current: NotionPage | undefined = page;
  while (current?.parentId && current.parentId !== WORKSPACE_ID) {
    const parent: NotionPage | undefined = pages.find((p) => p.id === current!.parentId);
    if (!parent) break;
    parts.unshift(parent.title || 'Untitled');
    current = parent;
  }
  return parts.join(' › ');
}

/** 「3分前」「昨日」のような、ぱっと分かる更新時刻 */
function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨日';
  if (day < 30) return `${day}日前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}ヶ月前`;
  return `${Math.floor(month / 12)}年前`;
}

/** 見出し（セクションの仕切り） */
function SectionTitle({ icon, label, count }: { icon: string; label: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
      {count !== undefined && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{count}</span>
      )}
    </div>
  );
}

/** ページ1枚分のカード */
function PageCard({ page, path }: { page: NotionPage; path: string }) {
  const icon = page.type === 'database' && page.icon === '📄' ? '📊' : page.icon;
  return (
    <Link
      href={`/notion-plus/${page.id}`}
      className="flex min-w-0 items-start gap-2.5 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm"
    >
      <PageIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
            {page.title || 'Untitled'}
          </span>
          {page.isFavorite && <span className="shrink-0 text-[10px] text-yellow-400">★</span>}
        </div>
        {path && <div className="mt-0.5 truncate text-xs text-gray-400">{path}</div>}
        <div className="mt-0.5 text-xs text-gray-300">{relativeTime(page.updatedAt)}</div>
      </div>
    </Link>
  );
}

// ── ホーム画面 ────────────────────────────────────────────────────────
//
// 🔥 ここは NotionPlus のホーム（2026-09-11 本人指示）。
//    以前は「前回見ていたページへ即リダイレクト」するだけの通過点で、画面としては存在しなかった。
//    今は「続きから／最近開いたページ／お気に入り」を並べて、自分で行き先を選ぶ入口にしてある。
//    ∴ ここで router.replace して自動で飛ばさない（飛ばすとホームが一瞬も見えない）。

export default function NotionPlusHome() {
  const { user } = useAuthStore();
  const { pages, loading, add } = useNotionPageStore();
  const router = useRouter();
  const lastViewedPageId = useSettingsStore((s) => s.lastViewedNotionPageId);
  const recentIds = useSettingsStore((s) => s.recentNotionPageIds);

  const byId = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const pathOf = (p: NotionPage) => ancestorPath(pages, p);

  const rootPages = useMemo(
    () => pages.filter((p) => !p.parentId && p.id !== WORKSPACE_ID).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [pages],
  );

  // 続きから＝前回見ていたページ
  const resume = lastViewedPageId ? byId.get(lastViewedPageId) : undefined;

  // 最近開いたページ（続きからの1枚と重複させない）
  const recent = useMemo(
    () =>
      recentIds
        .filter((id) => id !== resume?.id)
        .map((id) => byId.get(id))
        .filter((p): p is NotionPage => !!p && p.id !== WORKSPACE_ID)
        .slice(0, 8),
    [recentIds, byId, resume?.id],
  );

  const favorites = useMemo(
    () => pages.filter((p) => p.id !== WORKSPACE_ID && p.isFavorite).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [pages],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // ページが1件も無いとき
  if (rootPages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">まだページがありません</p>
        <button
          onClick={async () => {
            if (!user) return;
            const page = await add(user.uid);
            router.push(`/notion-plus/${page.id}`);
          }}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          ＋ 最初のページを作成
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-bold text-gray-900">NotionPlus</h1>
      <p className="mt-1 text-sm text-gray-400">
        ノートは全部で {pages.filter((p) => p.id !== WORKSPACE_ID).length} ページ
      </p>

      {/* 続きから */}
      {resume && (
        <section className="mt-8">
          <SectionTitle icon="▶" label="続きから" />
          <Link
            href={`/notion-plus/${resume.id}`}
            className="flex items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50/50 p-5 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <PageIcon icon={resume.type === 'database' && resume.icon === '📄' ? '📊' : resume.icon} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold text-gray-900">{resume.title || 'Untitled'}</div>
              {pathOf(resume) && <div className="mt-0.5 truncate text-xs text-gray-400">{pathOf(resume)}</div>}
              <div className="mt-0.5 text-xs text-gray-400">最終更新 {relativeTime(resume.updatedAt)}</div>
            </div>
            <span className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white">開く</span>
          </Link>
        </section>
      )}

      {/* 最近開いたページ */}
      {recent.length > 0 && (
        <section className="mt-8">
          <SectionTitle icon="🕒" label="最近開いたページ" count={recent.length} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recent.map((p) => (
              <PageCard key={p.id} page={p} path={pathOf(p)} />
            ))}
          </div>
        </section>
      )}

      {/* お気に入り */}
      <section className="mt-8">
        <SectionTitle icon="★" label="お気に入り" count={favorites.length} />
        {favorites.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            ノートの右上の ☆ を押すと、ここに並びます
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {favorites.map((p) => (
              <PageCard key={p.id} page={p} path={pathOf(p)} />
            ))}
          </div>
        )}
      </section>

      {/* ページ一覧（ルート） */}
      <section className="mt-8 mb-4">
        <SectionTitle icon="📚" label="ページ一覧" count={rootPages.length} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rootPages.map((p) => (
            <PageCard key={p.id} page={p} path="" />
          ))}
        </div>
      </section>
    </div>
  );
}
