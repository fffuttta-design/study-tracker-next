'use client';

import { useState, useMemo, useRef, useCallback, memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { AddItemDialog, toDateKey } from '@/components/notion/AddItemDialog';

// 消化モーダルに埋め込むノートエディタ（ブラウザ専用なので動的import・SSR無効）
const DigestEditor = dynamic(
  () => import('@/components/editor/NotionEditor').then((m) => ({ default: m.NotionEditor })),
  { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div> },
);
import { RegisterCelebration } from '@/components/RegisterCelebration';
import {
  type LearningItem,
  hasDueReview,
  isFullyCompleted,
  localDateKey,
  recalcNextReview,
  getNextStageIndex,
} from '@study-tracker/core';
import { useCategoryStore } from '@/stores/categoryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { format, addDays, subDays, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useSearchParams } from 'next/navigation';

// ── 定数 ──────────────────────────────────────────────────────────────

const DAILY_QUOTES = [
  '学ぶことをやめたら、教えることをやめなければならない。',
  '知識は経験によって磨かれる。',
  '今日学んだことが、明日の自分をつくる。',
  '一日一つ、必ず新しいことを学べ。',
  '失敗は成功の母。学びを恐れるな。',
  '継続は力なり。毎日の積み重ねが差を生む。',
  '好奇心こそが学びの原動力。',
  '深く考えることは、深く学ぶことだ。',
  '昨日より少しだけ賢くなることを目指せ。',
  '疑問を持つことから、真の学びが始まる。',
  '知識は分かち合うことで2倍になる。',
  '小さな進歩も、進歩であることに変わりない。',
  '人生は学びの連続。立ち止まったとき、それは終わりだ。',
  '努力した時間は裏切らない。',
  '今この瞬間の集中が、未来の自分への贈り物になる。',
];

function toHHGroup(isoDate: string): string {
  const d = new Date(isoDate);
  return `${String(d.getHours()).padStart(2, '0')}:00～`;
}

const STAGE_LABELS = ['翌日', '3日後', '7日後', '2週間後', '1ヶ月後'];
const STAGE_COLORS = [
  'bg-red-50 text-red-500 border-red-200',
  'bg-yellow-50 text-yellow-600 border-yellow-200',
  'bg-green-50 text-green-600 border-green-200',
  'bg-blue-50 text-blue-600 border-blue-200',
  'bg-purple-50 text-purple-600 border-purple-200',
];

const STAGE_CARD_BG = [
  'bg-red-100',
  'bg-yellow-100',
  'bg-green-100',
  'bg-blue-100',
  'bg-purple-100',
];

const STAGE_BADGE_COUNT_BG = ['bg-red-500', 'bg-yellow-500', 'bg-green-600', 'bg-blue-500', 'bg-purple-500'];
const STAGE_SECTION_BORDER = ['border-red-200', 'border-yellow-200', 'border-green-200', 'border-blue-200', 'border-purple-200'];

function dailyQuote(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}


// ── メインページ ─────────────────────────────────────────────────────

export default function LearningPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
      <LearningPageContent />
    </Suspense>
  );
}

function LearningPageContent() {
  const { user } = useAuthStore();
  const { items, loading } = useLearningStore();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = Number(searchParams.get('tab') ?? '0');
    return isNaN(t) ? 0 : Math.min(Math.max(t, 0), 6);
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [quickInboxOpen, setQuickInboxOpen] = useState(false);
  const [digestItem, setDigestItem] = useState<LearningItem | null>(null);
  const dateKey = toDateKey(selectedDate);

  const todayItems = useMemo(
    () => items.filter((i) => i.dateKey === dateKey).sort((a, b) => a.sortOrder - b.sortOrder),
    [items, dateKey]
  );
  // notionPageId なし（特急メモ）は復習ルーティンに含めない
  const dueItems = useMemo(() => items.filter(i => !!i.notionPageId && hasDueReview(i)), [items]);
  // 特急メモ = notionPageId が未設定のアイテム（インボックス）
  const inboxItems = useMemo(
    () => items.filter((i) => !i.notionPageId).sort((a, b) =>
      new Date(b.createdAt ?? b.dateKey).getTime() - new Date(a.createdAt ?? a.dateKey).getTime()
    ),
    [items]
  );

  const handleDigest = useCallback((item: LearningItem) => setDigestItem(item), []);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* 日付ヘッダー */}
      <div className={`border-b px-5 py-3 ${isToday(selectedDate) ? 'border-brand-100 bg-gradient-to-r from-brand-50/60 to-white' : 'border-gray-100 bg-white'}`}>
        <div className="flex items-start justify-between gap-4">
          {/* 左: 日付ナビ */}
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => setSelectedDate((d) => subDays(d, 1))} className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500">‹</button>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-3xl font-black text-gray-900 leading-none tracking-tight">
                  {format(selectedDate, 'M月d日', { locale: ja })}
                </span>
                <span className="text-lg font-semibold text-gray-400 leading-none">
                  （{format(selectedDate, 'E', { locale: ja })}）
                </span>
                {isToday(selectedDate) && (
                  <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white leading-none">今日</span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-gray-400 italic truncate">💡 {dailyQuote()}</p>
            </div>
            <button onClick={() => setSelectedDate((d) => addDays(d, 1))} className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500">›</button>
            {!isToday(selectedDate) && (
              <button onClick={() => setSelectedDate(new Date())} className="shrink-0 rounded-full border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-500 hover:bg-brand-50">今日へ</button>
            )}
          </div>

          {/* 右: 今日のスコア */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex flex-col items-center rounded-xl bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-gray-100">
              <span className={`text-3xl font-black leading-none ${todayItems.length > 0 ? 'text-brand-600' : 'text-gray-200'}`}>{todayItems.length}</span>
              <span className="mt-0.5 text-[10px] font-medium text-gray-400">学習</span>
            </div>
            {dueItems.length > 0 && (
              <div className="flex flex-col items-center rounded-xl bg-red-50 px-3 py-1.5 shadow-sm ring-1 ring-red-100">
                <span className="text-3xl font-black leading-none text-red-500">{dueItems.length}</span>
                <span className="mt-0.5 text-[10px] font-medium text-red-400">復習待ち</span>
              </div>
            )}
            <Link
              href="/settings"
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="設定"
            >⚙️</Link>
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-100 px-6">
        {['ダッシュボード', '本日の学習', '今日の復習', '達成リスト', '全学習リスト', '通知ログ', '⚡ 特急'].map((label, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={`mr-4 border-b-2 py-2.5 text-sm transition-colors ${tab === i ? 'border-brand-500 font-medium text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {label}
            {i === 2 && dueItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{dueItems.length}</span>
            )}
            {i === 6 && inboxItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">{inboxItems.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <div className="flex-1 overflow-y-auto bg-white">
        {tab === 0 && <DashboardTab todayItems={todayItems} dueItems={dueItems} inboxItems={inboxItems} uid={user?.uid ?? ''} onAdd={() => setAddDialogOpen(true)} onQuickAdd={() => setQuickInboxOpen(true)} onDigest={handleDigest} />}
        {tab === 1 && <TodayTab items={todayItems} uid={user?.uid ?? ''} onAdd={() => setAddDialogOpen(true)} />}
        {tab === 2 && <ReviewTab dueItems={dueItems} uid={user?.uid ?? ''} />}
        {tab === 3 && <AchievementTab items={items} uid={user?.uid ?? ''} />}
        {tab === 4 && <AllItemsTab items={items} uid={user?.uid ?? ''} />}
        {tab === 5 && <LogTab />}
        {tab === 6 && <QuickTab inboxItems={inboxItems} uid={user?.uid ?? ''} onDigest={handleDigest} />}
      </div>

      {/* 消化モーダル（特急メモ → 正式なメモへ移行） */}
      {digestItem !== null && user && (
        <DigestDialog item={digestItem} uid={user.uid} onClose={() => setDigestItem(null)} />
      )}

      {/* AddItemDialog（通常の学習追加） */}
      {addDialogOpen && user && (
        <AddItemDialog
          uid={user.uid}
          onClose={() => setAddDialogOpen(false)}
        />
      )}

      {/* 特急クイック追加モーダル */}
      {quickInboxOpen && user && (
        <QuickInboxModal uid={user.uid} onClose={() => setQuickInboxOpen(false)} />
      )}
    </div>
  );
}


// ── ダッシュボードタブ ───────────────────────────────────────────────

function DashboardTab({ todayItems, dueItems, inboxItems, uid, onAdd, onQuickAdd, onDigest }: {
  todayItems: LearningItem[];
  dueItems: LearningItem[];
  inboxItems: LearningItem[];
  uid: string;
  onAdd: () => void;
  onQuickAdd: () => void;
  onDigest: (item: LearningItem) => void;
}) {
  const [reviewSortDir, setReviewSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedInboxIds, setExpandedInboxIds] = useState<Set<string>>(new Set());
  const [editInboxItem, setEditInboxItem] = useState<LearningItem | null>(null);
  const { remove: removeItem } = useLearningStore();

  const toggleInbox = (id: string) =>
    setExpandedInboxIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  // 今日の登録を時間帯でグループ化（消化済みアイテムのみ）
  const digestedItems = todayItems.filter((i) => !!i.notionPageId);
  const hasTimeInfo = digestedItems.some((i) => i.createdAt);
  const todayGrouped = hasTimeInfo
    ? Object.entries(
        digestedItems.reduce<Record<string, LearningItem[]>>((acc, item) => {
          const key = item.createdAt ? toHHGroup(item.createdAt) : '--:--';
          (acc[key] ??= []).push(item);
          return acc;
        }, {})
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, items]) => ({ label, items }))
    : null;

  // 昨日の日付キー
  const yesterday = toDateKey(subDays(new Date(), 1));

  // 昨日学んだ → 翌日(stageIndex=0)が due → 左パネル下部に表示
  const yesterdayDueItems = useMemo(
    () => dueItems.filter((item) => {
      const next = item.reviews.find((r) => !r.completed);
      return next?.stageIndex === 0 && item.dateKey === yesterday && !!item.notionPageId;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dueItems],
  );

  // 復習待ちをステージでグループ化
  // 翌日(index=0)は昨日分を除く（左パネルに表示するため）
  const dueGrouped = STAGE_LABELS.map((label, i) => ({
    label,
    index: i,
    items: dueItems.filter((item) => {
      const next = item.reviews.find((r) => !r.completed);
      if (next?.stageIndex !== i) return false;
      if (i === 0 && item.dateKey === yesterday) return false; // 左パネルに移動済み
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-gray-300">
      {/* 今日の登録 */}
      <div className="flex flex-col">
        <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">今日の登録</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{todayItems.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onQuickAdd} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600" title="NotionPlus不要でサクッと記録">
              ⚡ 特急
            </button>
            <button onClick={onAdd} className="shrink-0 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
              + 追加
            </button>
          </div>
        </div>
        <div className="p-6">
          {/* ⚡ 特急メモ（クリックで展開・インラインリスト） */}
          {inboxItems.length > 0 && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-amber-200">
                <span className="text-xs font-semibold text-amber-700">⚡ 特急メモ（未消化）</span>
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{inboxItems.length}</span>
              </div>
              <div className="divide-y divide-amber-100">
                {inboxItems.map((item) => {
                  const isOpen = expandedInboxIds.has(item.id);
                  return (
                    <div key={item.id}>
                      {/* タイトル行（クリックで開閉） */}
                      <button
                        className="flex w-full items-center justify-between gap-2 bg-white px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                        onClick={() => toggleInbox(item.id)}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800">{item.title || '（タイトルなし）'}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] text-gray-400">{format(new Date(item.dateKey), 'M/d', { locale: ja })} 登録</span>
                          <span className="text-[10px] text-amber-400">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {/* 展開コンテンツ */}
                      {isOpen && (
                        <div className="border-t border-amber-100 bg-white px-3 py-2">
                          {item.content && (
                            <p className="mb-2 whitespace-pre-wrap text-xs text-gray-600 leading-relaxed">
                              {item.content.replace(/[#\*`_~>]/g, '').replace(/[^\S\n]+/g, ' ').trim().slice(0, 300)}
                            </p>
                          )}
                          <div className="flex items-center justify-end">
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditInboxItem(item)}
                                className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:border-amber-300 hover:text-amber-600"
                              >✏️ 編集</button>
                              <button
                                onClick={() => onDigest(item)}
                                className="rounded-lg bg-brand-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-600"
                              >消化する →</button>
                              <button
                                onClick={() => removeItem(uid, item.id)}
                                className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-400 hover:border-red-200 hover:text-red-400"
                                title="削除"
                              >🗑</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 消化済み学習アイテム（時間帯グループ） */}
          {digestedItems.length === 0 ? (
            inboxItems.length === 0 && <Empty text="今日の学習はまだありません" />
          ) : todayGrouped ? (
            <div>
              {todayGrouped.map((g) => (
                <div key={g.label}>
                  <BadgeDivider label={g.label} count={g.items.length} leftAlign />
                  <ItemList items={g.items} uid={uid} compact fromTab={0} />
                </div>
              ))}
            </div>
          ) : (
            <ItemList items={digestedItems} uid={uid} compact fromTab={0} />
          )}

          {/* 昨日の学習（翌日due → 今日復習すべきもの） */}
          {yesterdayDueItems.length > 0 && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3">
              <BadgeDivider
                label="昨日の学習"
                count={yesterdayDueItems.length}
                badgeClass={STAGE_COLORS[0]}
                countBg={STAGE_BADGE_COUNT_BG[0]}
                leftAlign
              />
              <ItemList items={yesterdayDueItems} uid={uid} showReviewAction compact fromTab={0} />
            </div>
          )}
        </div>
      </div>

      {/* 今日の復習 */}
      <div className="flex flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 bg-white px-6 lg:border-t-0 border-t border-gray-300">
          <span className="text-sm font-semibold text-gray-800">今日の復習</span>
          {dueItems.length > 0
            ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">{dueItems.length}</span>
            : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">0</span>
          }
          {dueItems.length > 0 && (
            <button
              onClick={() => setReviewSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
              className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-50"
            >
              {reviewSortDir === 'desc' ? '↓ 新しい順' : '↑ 古い順'}
            </button>
          )}
        </div>
        <div className="p-6">
          {dueItems.length === 0 ? (
            <Empty text="復習待ちのアイテムはありません 🎉" />
          ) : (
            <div>
              {dueGrouped.map((g) => {
                // ステージ内をさらに学習日（dateKey）でサブグループ化（古い順）
                const byDate = Array.from(
                  g.items.reduce((map, item) => {
                    const key = item.dateKey ?? item.createdAt?.slice(0, 10) ?? 'unknown';
                    if (!map.has(key)) map.set(key, []);
                    map.get(key)!.push(item);
                    return map;
                  }, new Map<string, LearningItem[]>())
                ).sort(([a], [b]) =>
                  reviewSortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
                );

                return (
                  <div key={g.index} className={`mb-3 rounded-xl border p-3 ${STAGE_CARD_BG[g.index]} ${STAGE_SECTION_BORDER[g.index]}`}>
                    <BadgeDivider
                      label={g.label}
                      count={g.items.length}
                      badgeClass={STAGE_COLORS[g.index]}
                      countBg={STAGE_BADGE_COUNT_BG[g.index]}
                      leftAlign
                    />
                    <div className="space-y-2">
                      {byDate.map(([dateKey, dateItems]) => (
                        <div key={dateKey}>
                          {byDate.length > 1 && (
                            <div className="mb-1.5 flex items-center gap-2 text-xs text-gray-400">
                              <span className="shrink-0 text-base font-bold text-gray-700">
                                {format(new Date(dateKey), 'M/d（E）', { locale: ja })} に学習
                              </span>
                              <div className="h-px flex-1 bg-gray-200" />
                              <span className="shrink-0 tabular-nums">{dateItems.length}件</span>
                            </div>
                          )}
                          <ItemList items={dateItems} uid={uid} showReviewAction compact fromTab={0} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 特急メモ編集モーダル */}
      {editInboxItem && (
        <InboxEditModal item={editInboxItem} uid={uid} onClose={() => setEditInboxItem(null)} />
      )}
    </div>
  );
}

// ── 本日の学習タブ ───────────────────────────────────────────────────

function TodayTab({ items, uid, onAdd }: {
  items: LearningItem[];
  uid: string;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'done'>('all');

  const filtered = items.filter((item) => {
    const matchSearch = !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.content.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ? true :
      filter === 'due' ? hasDueReview(item) :
      isFullyCompleted(item);
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="タイトル・内容を検索…"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500 min-w-[160px]"
        />
        <div className="flex gap-1">
          {(['all', 'due', 'done'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs transition ${filter === f ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {f === 'all' ? '全て' : f === 'due' ? '復習待ち' : '完了済み'}
            </button>
          ))}
        </div>
        <button onClick={onAdd} className="shrink-0 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
          + 追加
        </button>
      </div>
      {filtered.length === 0
        ? <Empty text={search || filter !== 'all' ? '条件に一致するアイテムがありません' : 'この日の学習はまだありません'} />
        : <ItemList items={filtered} uid={uid} showReviewAction fromTab={1} />}
    </div>
  );
}

// ── 復習タブ ─────────────────────────────────────────────────────────

function ReviewTab({ dueItems, uid }: {
  dueItems: LearningItem[];
  uid: string;
}) {
  // デフォルト: 降順（新しい学習日が上）
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const grouped = STAGE_LABELS.map((label, i) => ({
    label,
    index: i,
    items: dueItems.filter((item) => {
      const next = item.reviews.find((r) => !r.completed);
      return next?.stageIndex === i;
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="p-6 space-y-6">
      {dueItems.length === 0
        ? <Empty text="復習待ちのアイテムはありません 🎉" />
        : <>
          {/* ソート切替ボタン */}
          <div className="flex justify-end">
            <button
              onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 shadow-sm hover:bg-gray-50"
            >
              {sortDir === 'desc' ? '↓ 新しい順' : '↑ 古い順'}
            </button>
          </div>

          {grouped.map((g) => {
            const byDate = Array.from(
              g.items.reduce((map, item) => {
                const key = item.dateKey ?? item.createdAt?.slice(0, 10) ?? 'unknown';
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(item);
                return map;
              }, new Map<string, LearningItem[]>())
            ).sort(([a], [b]) =>
              sortDir === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
            );

            return (
              <div key={g.index} className={`rounded-xl border p-3 ${STAGE_CARD_BG[g.index]} ${STAGE_SECTION_BORDER[g.index]}`}>
                <BadgeDivider
                  label={g.label}
                  count={g.items.length}
                  badgeClass={STAGE_COLORS[g.index]}
                  countBg={STAGE_BADGE_COUNT_BG[g.index]}
                  leftAlign
                />
                <div className="space-y-2">
                  {byDate.map(([dateKey, dateItems]) => (
                    <div key={dateKey}>
                      {byDate.length > 1 && (
                        <div className="mb-1.5 flex items-center gap-2 text-xs text-gray-400">
                          <span className="shrink-0 text-base font-bold text-gray-700">
                            {format(new Date(dateKey), 'M/d（E）', { locale: ja })} に学習
                          </span>
                          <div className="h-px flex-1 bg-gray-200" />
                          <span className="shrink-0 tabular-nums">{dateItems.length}件</span>
                        </div>
                      )}
                      <ItemList items={dateItems} uid={uid} showReviewAction fromTab={2} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      }
    </div>
  );
}

// ── 全学習リストタブ ──────────────────────────────────────────────────

function AllItemsTab({ items, uid }: { items: LearningItem[]; uid: string }) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [popupDate, setPopupDate] = useState<string | null>(null);

  // dateKey でグループ化（降順）
  const byDate = useMemo(() => {
    const map = new Map<string, LearningItem[]>();
    for (const item of items) {
      const key = item.dateKey ?? toDateKey(new Date(item.createdAt ?? Date.now()));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, list]) => ({ dateKey, list: list.sort((a, b) => a.sortOrder - b.sortOrder) }));
  }, [items]);

  const totalCount = items.length;

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">全 <span className="font-bold text-gray-800">{totalCount}</span> 件</p>
        {/* ビュー切り替え */}
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1 px-3 py-1.5 transition ${view === 'list' ? 'bg-brand-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <span>☰</span> リスト
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1 border-l border-gray-200 px-3 py-1.5 transition ${view === 'calendar' ? 'bg-brand-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <span>📅</span> カレンダー
          </button>
        </div>
      </div>

      {/* リストビュー */}
      {view === 'list' && (
        <div className="space-y-6">
          {byDate.length === 0 && <Empty text="まだ学習アイテムがありません" />}
          {byDate.map(({ dateKey, list }) => {
            const d = new Date(`${dateKey}T00:00:00`);
            const label = format(d, 'yyyy年M月d日（E）', { locale: ja });
            return (
              <div key={dateKey}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">{label}</span>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">{list.length}件</span>
                </div>
                <ItemList items={list} uid={uid} showReviewAction={false} compact fromTab={3} />
              </div>
            );
          })}
        </div>
      )}

      {/* カレンダービュー */}
      {view === 'calendar' && (
        <AllItemsCalendar
          items={items}
          year={calYear}
          month={calMonth}
          onPrev={() => {
            if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
            else setCalMonth((m) => m - 1);
          }}
          onNext={() => {
            if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
            else setCalMonth((m) => m + 1);
          }}
          popupDate={popupDate}
          onDayClick={(dk) => setPopupDate(dk === popupDate ? null : dk)}
          onClosePopup={() => setPopupDate(null)}
          uid={uid}
        />
      )}
    </div>
  );
}

function AllItemsCalendar({
  items, year, month, onPrev, onNext, popupDate, onDayClick, onClosePopup, uid,
}: {
  items: LearningItem[];
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  popupDate: string | null;
  onDayClick: (dk: string) => void;
  onClosePopup: () => void;
  uid: string;
}) {
  // dateKey → アイテム数マップ
  const countMap = useMemo(() => {
    const map = new Map<string, LearningItem[]>();
    for (const item of items) {
      const key = item.dateKey ?? toDateKey(new Date(item.createdAt ?? Date.now()));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  // その月のカレンダーグリッドを生成
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=日
  const daysInMonth = lastDay.getDate();

  const cells: (string | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
  ];
  // 6行になるように末尾を埋める
  while (cells.length % 7 !== 0) cells.push(null);

  const popupItems = popupDate ? (countMap.get(popupDate) ?? []) : [];
  const todayKey = toDateKey(new Date());

  // 最大件数（カラースケール用）
  const maxCount = Math.max(1, ...Array.from(countMap.values()).map((v) => v.length));

  return (
    <div>
      {/* ナビゲーション */}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onPrev} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">‹</button>
        <span className="text-sm font-semibold text-gray-700">
          {format(new Date(year, month, 1), 'yyyy年M月', { locale: ja })}
        </span>
        <button onClick={onNext} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">›</button>
      </div>

      {/* 曜日ヘッダー */}
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-gray-400">
        {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
          <div key={d} className={d === '日' ? 'text-red-400' : d === '土' ? 'text-blue-400' : ''}>{d}</div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dk, idx) => {
          if (!dk) return <div key={idx} />;
          const count = countMap.get(dk)?.length ?? 0;
          const isToday = dk === todayKey;
          const isActive = dk === popupDate;
          // 件数に応じた濃さ
          const intensity = count > 0 ? Math.ceil((count / maxCount) * 4) : 0;
          const heatClass = [
            '',
            'bg-brand-100',
            'bg-brand-200',
            'bg-brand-300',
            'bg-brand-400',
          ][intensity];
          const day = parseInt(dk.split('-')[2]);
          const dow = (idx % 7);
          return (
            <button
              key={dk}
              onClick={() => count > 0 && onDayClick(dk)}
              className={`relative flex h-12 flex-col items-center justify-start rounded-lg pt-1 text-xs transition-all
                ${count > 0 ? 'cursor-pointer hover:ring-2 hover:ring-brand-400' : 'cursor-default'}
                ${isActive ? 'ring-2 ring-brand-500' : ''}
                ${isToday ? 'font-bold' : ''}
                ${heatClass || 'bg-gray-50'}
              `}
            >
              <span className={`leading-none ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : isToday ? 'text-brand-600' : 'text-gray-600'}`}>
                {day}
              </span>
              {count > 0 && (
                <span className={`mt-0.5 rounded-full px-1 text-[10px] font-semibold leading-none
                  ${intensity >= 3 ? 'text-white' : 'text-brand-700'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ポップアップ（クリックした日のリスト） */}
      {popupDate && popupItems.length > 0 && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <span className="text-sm font-semibold text-gray-700">
              {format(new Date(`${popupDate}T00:00:00`), 'M月d日（E）', { locale: ja })}
              <span className="ml-2 text-xs font-normal text-gray-400">{popupItems.length}件</span>
            </span>
            <button onClick={onClosePopup} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="p-2">
            <ItemList items={popupItems} uid={uid} showReviewAction={false} compact fromTab={3} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 達成リストタブ ────────────────────────────────────────────────────

const ACHIEVEMENT_STAGE_COLORS = [
  'bg-red-400',
  'bg-yellow-400',
  'bg-green-500',
  'bg-blue-500',
  'bg-purple-500',
];

function AchievementTab({ items }: { items: LearningItem[]; uid: string }) {
  const { categories } = useCategoryStore();
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');

  // カテゴリでフィルター
  const filtered = useMemo(
    () => filterCategoryId === 'all' ? items : items.filter((i) => i.categoryId === filterCategoryId),
    [items, filterCategoryId]
  );

  // 完了ステージ数でソート（多い順）
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const aStages = a.reviews.filter((r) => r.completed).length;
      const bStages = b.reviews.filter((r) => r.completed).length;
      if (bStages !== aStages) return bStages - aStages;
      return b.dateKey.localeCompare(a.dateKey);
    }),
    [filtered]
  );

  const totalCount      = items.length;
  const masteredCount   = items.filter(isFullyCompleted).length;
  const inProgressCount = items.filter((i) => !isFullyCompleted(i) && i.reviews.some((r) => r.completed)).length;
  const notStartedCount = items.filter((i) => i.reviews.every((r) => !r.completed)).length;

  // ステージ別件数（フィルター前・全体）
  const stageCounts = [0, 1, 2, 3, 4].map(
    (s) => items.filter((i) => {
      const next = getNextStageIndex(i);
      return next === s || (next === -1 && s === 4);
    }).length
  );

  return (
    <div className="px-6 py-5">
      {/* サマリーカード */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{masteredCount}</p>
          <p className="mt-0.5 text-xs text-purple-400">🏆 全制覇</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
          <p className="mt-0.5 text-xs text-blue-400">📈 進行中</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold text-gray-500">{notStartedCount}</p>
          <p className="mt-0.5 text-xs text-gray-400">📋 未着手</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalCount}</p>
          <p className="mt-0.5 text-xs text-green-400">📚 総アイテム</p>
        </div>
      </div>

      {/* ステージ分布バー */}
      <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ステージ分布（次回の復習ステージ）</p>
        <div className="space-y-2">
          {STAGE_LABELS.map((label, i) => {
            const count = stageCounts[i];
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-medium text-white ${ACHIEVEMENT_STAGE_COLORS[i]}`}>
                  {label}
                </span>
                <div className="flex-1 rounded-full bg-gray-100 h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${ACHIEVEMENT_STAGE_COLORS[i]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs text-gray-400">{count}件</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* カテゴリフィルター */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategoryId('all')}
          className={`rounded-full border px-3 py-1 text-xs transition ${filterCategoryId === 'all' ? 'border-brand-400 bg-brand-50 font-medium text-brand-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          すべて（{items.length}件）
        </button>
        {categories.map((cat) => {
          const cnt = items.filter((i) => i.categoryId === cat.id).length;
          if (cnt === 0) return null;
          return (
            <button
              key={cat.id}
              onClick={() => setFilterCategoryId(cat.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${filterCategoryId === cat.id ? 'border-brand-400 bg-brand-50 font-medium text-brand-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              {cat.name}（{cnt}件）
            </button>
          );
        })}
      </div>

      {/* アイテムリスト */}
      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">アイテムがありません</p>
        )}
        {sorted.map((item) => {
          const completedCount = item.reviews.filter((r) => r.completed).length;
          const totalStages = item.reviews.length;
          const fully = isFullyCompleted(item);
          const nextIdx = getNextStageIndex(item);
          const catName = categories.find((c) => c.id === item.categoryId)?.name;

          return (
            <div
              key={item.id}
              className={`rounded-xl border px-4 py-3 ${fully ? 'border-purple-200 bg-purple-50' : 'border-gray-100 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {fully && <span className="text-sm">🏆</span>}
                    <p className={`font-medium leading-snug ${fully ? 'text-purple-700' : 'text-gray-800'} text-sm`}>
                      {item.title || item.content.split('\n')[0].slice(0, 60)}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {catName && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{catName}</span>
                    )}
                    <span className="text-xs text-gray-400">{item.dateKey} 登録</span>
                  </div>
                </div>

                {/* ステージ進捗 */}
                <div className="shrink-0 text-right">
                  <div className="flex items-center gap-1">
                    {item.reviews.map((r) => (
                      <div
                        key={r.stageIndex}
                        title={`${STAGE_LABELS[r.stageIndex]}${r.completed ? '（完了）' : ''}`}
                        className={`h-3 w-3 rounded-full ${r.completed ? ACHIEVEMENT_STAGE_COLORS[r.stageIndex] : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <p className={`mt-1 text-xs font-medium ${fully ? 'text-purple-500' : 'text-gray-500'}`}>
                    {fully
                      ? '全制覇！'
                      : nextIdx >= 0
                      ? `${completedCount}/${totalStages} クリア`
                      : ''}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ⚡ 特急クイック追加モーダル ────────────────────────────────────────

function QuickInboxModal({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { add } = useLearningStore();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await add(uid, {
        dateKey: localDateKey(),
        title: title.trim(),
        content: content.trim(),
        sortOrder: Date.now(),
      });
    } catch {
      setSaving(false);
      return;
    }
    // 派手にお祝いしてから閉じる（テンションUP）
    setCelebrate(true);
    setTimeout(() => { setCelebrate(false); onClose(); }, 1300);
  };

  if (celebrate) {
    return <RegisterCelebration message="登録しました！" sub="特急メモに追加しました" />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">⚡ 特急メモ</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }}
          placeholder="タイトルを入力... (Enter で保存)"
          className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="メモ（任意）"
          rows={3}
          className="mb-4 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? '保存中...' : '⚡ 特急で保存'}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-400">「消化する」で正式なメモへ移行できます（⚡ 特急タブ）</p>
      </div>
    </div>
  );
}

// ── 特急メモ編集モーダル ───────────────────────────────────────────────

function InboxEditModal({ item, uid, onClose }: { item: LearningItem; uid: string; onClose: () => void }) {
  const { update } = useLearningStore();
  const [title, setTitle] = useState(item.title ?? '');
  const [content, setContent] = useState(item.content ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await update(uid, item.id, { title: title.trim(), content: content.trim() });
    } catch {
      setSaving(false);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">✏️ 特急メモを編集</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }}
          placeholder="タイトルを入力..."
          className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="メモ（任意）"
          rows={6}
          className="mb-4 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ⚡ 特急タブ ─────────────────────────────────────────────────────────

function QuickTab({ inboxItems, uid, onDigest }: {
  inboxItems: LearningItem[];
  uid: string;
  onDigest: (item: LearningItem) => void;
}) {
  const { remove } = useLearningStore();
  const [editItem, setEditItem] = useState<LearningItem | null>(null);

  if (inboxItems.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
        <span className="text-4xl">⚡</span>
        <p className="text-sm">特急メモはありません 🎉</p>
        <p className="text-xs text-gray-300">ダッシュボードの「⚡ 特急」ボタンで素早く記録</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <p className="mb-4 text-xs text-gray-400">
        まだ消化していない特急メモです。「消化する」を押すと、内容を整えて正式なメモ（既存／新規ページ）へ移行できます。
      </p>
      <div className="space-y-3">
        {inboxItems.map((item) => (
          <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-800">{item.title}</p>
                {item.content && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.content}</p>
                )}
                <p className="mt-1 text-[11px] text-gray-400">{item.dateKey}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  onClick={() => setEditItem(item)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-amber-300 hover:text-amber-600"
                >
                  ✏️ 編集
                </button>
                <button
                  onClick={() => onDigest(item)}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                >
                  消化する →
                </button>
                <button
                  onClick={() => remove(uid, item.id)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-400 hover:border-red-200 hover:text-red-400"
                  title="削除"
                >🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 特急メモ編集モーダル */}
      {editItem && (
        <InboxEditModal item={editItem} uid={uid} onClose={() => setEditItem(null)} />
      )}
    </div>
  );
}

// ── 通知ログタブ ─────────────────────────────────────────────────────

function LogTab() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      通知ログは準備中です
    </div>
  );
}

// ── アイテムリスト ────────────────────────────────────────────────────

function ItemList({ items, uid, showReviewAction = false, compact = false, fromTab }: {
  items: LearningItem[];
  uid: string;
  showReviewAction?: boolean;
  compact?: boolean;
  fromTab?: number;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} uid={uid} showReviewAction={showReviewAction} compact={compact} fromTab={fromTab} />
      ))}
    </div>
  );
}

// ── アイテムカード ────────────────────────────────────────────────────

const ItemCard = memo(function ItemCard({ item, uid, showReviewAction, compact = false, fromTab }: {
  item: LearningItem;
  uid: string;
  showReviewAction: boolean;
  compact?: boolean;
  fromTab?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { update, remove } = useLearningStore();
  const { pages } = useNotionPageStore();
  const reviewStageDays = useSettingsStore((s) => s.reviewStageDays);
  const linkedPage = item.notionPageId ? pages.find((p) => p.id === item.notionPageId) : null;
  // リンク先ページが削除済み（IDはあるがページが見つからない）
  const pageDeleted = !!item.notionPageId && pages.length > 0 && !linkedPage;
  const nextReview = item.reviews.find((r) => !r.completed);
  const fullyDone = isFullyCompleted(item);
  const isInboxItem = !item.notionPageId; // 特急メモ（復習バッジ不要）

  const completeReview = async () => {
    const today = localDateKey();
    const stageIdx = nextReview?.stageIndex ?? 0;
    // 1. 今のステージを完了にする
    let updated = item.reviews.map((r) =>
      !r.completed && r.stageIndex === stageIdx ? { ...r, completed: true } : r
    );
    // 2. 次ステージの予定日を「今日 + stageDays[nextStage]」で再計算
    updated = recalcNextReview(updated, stageIdx, today, reviewStageDays);
    await update(uid, item.id, { reviews: updated });
  };

  const handleDelete = async () => {
    if (!confirm(`「${item.title || item.content.slice(0, 20)}」を削除しますか？`)) return;
    await remove(uid, item.id);
  };

  const copyContent = () => {
    navigator.clipboard.writeText([item.title, item.content].filter(Boolean).join('\n'));
  };

  const noteLinkHref = (() => {
    if (!item.notionPageId) return null;
    // ページ全体（ブックは章）の復習はハイライト不要。章指定があれば ?chapter= で該当章を開く。
    if (item.isPageReview) {
      const chapterQ = item.chapterId ? `&chapter=${encodeURIComponent(item.chapterId)}` : '';
      return `/notion-plus/${item.notionPageId}?from=${fromTab ?? 0}${chapterQ}`;
    }
    const rawLine = (item.content.split('\n').find(l => l.trim().length > 5) ?? item.content).trim();
    // Markdown 記号を除去してからハイライト文字列を作る
    const hlText = rawLine
      .replace(/^#{1,6}\s+/, '')   // ## 見出し → 見出し
      .replace(/^\*{1,3}/, '').replace(/\*{1,3}$/, '')  // **bold**
      .replace(/^_{1,3}/, '').replace(/_{1,3}$/, '')    // __italic__
      .replace(/^[-*+]\s+/, '')    // - リスト → リスト
      .replace(/^>\s+/, '')        // > 引用 → 引用
      .replace(/^`{1,3}/, '').replace(/`{1,3}$/, '')    // `code`
      .trim()
      .slice(0, 80);
    return `/notion-plus/${item.notionPageId}?hl=${encodeURIComponent(hlText)}&from=${fromTab ?? 0}`;
  })();

  const cardBg = 'bg-white';

  // ── コンパクトレイアウト（ダッシュボード専用）────────────────────────
  if (compact) {
    return (
      <div
        className={`rounded-lg border transition-shadow cursor-pointer ${pageDeleted ? 'bg-gray-300 border-gray-400' : `${cardBg} ${expanded ? 'border-brand-200 shadow-sm' : 'border-gray-300 hover:border-gray-400'}`}`}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* 削除済みノート警告バナー */}
        {pageDeleted && (
          <div className="flex items-center gap-1 rounded-t-lg bg-gray-400 px-3 py-1 text-xs text-white">
            <span>🗑️</span><span>リンク先のノートが削除されました</span>
          </div>
        )}
        {/* 行1: 復習チェック + タイトル */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
          {showReviewAction && nextReview && !fullyDone && (
            <button
              onClick={(e) => { e.stopPropagation(); completeReview(); }}
              className="h-4 w-4 shrink-0 rounded border-2 border-gray-300 hover:border-brand-500 hover:bg-brand-50"
              title="この復習を完了"
            />
          )}
          <p className={`min-w-0 flex-1 truncate font-bold text-gray-900 ${expanded ? 'text-2xl' : 'text-sm'}`}>
            {item.title || item.content.split('\n')[0].slice(0, 60)}
          </p>
          {item.isPageReview && (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700" title="ページ（章）まるごとの復習">
              {item.chapterId ? '📖 章' : '📄 ページ全体'}
            </span>
          )}
        </div>
        {/* 行2: ノートを開く + 3アイコン（ボタン個別にstopPropagation） */}
        <div className="flex items-center gap-1 px-3 pb-1">
          {noteLinkHref && (
            <Link
              href={noteLinkHref}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-100"
              title="ノートを開く"
            >
              <span>📖</span><span>ノートを開く</span>
            </Link>
          )}
          <button onClick={(e) => { e.stopPropagation(); copyContent(); }} className={`rounded p-1 hover:bg-gray-100 hover:text-gray-500 ${pageDeleted ? 'text-gray-500' : 'text-gray-300'}`} title="コピー">⎘</button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className={`rounded p-1 hover:bg-gray-100 hover:text-gray-500 ${pageDeleted ? 'text-gray-500' : 'text-gray-300'}`} title="編集">✎</button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} className={`rounded p-1 hover:bg-red-50 hover:text-red-400 ${pageDeleted ? 'text-gray-500' : 'text-gray-300'}`} title="削除">✕</button>
        </div>
        {/* 行3: ノートパス（空白クリックでも開閉） */}
        {item.notionPagePath && (
          <div className="flex min-w-0 items-center gap-1 px-3 pb-2 text-xs text-gray-400">
            <NotionPageIconInline page={linkedPage} fallbackIcon="📁" />
            <span className="min-w-0 truncate">{item.notionPagePath}</span>
          </div>
        )}

        {/* 展開コンテンツ（中のクリックでは閉じない） */}
        {expanded && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()} onDoubleClick={() => setExpanded(false)}>
            {item.content && (
              <div className="mb-3 max-w-none text-sm text-gray-700
                [&_strong]:font-bold [&_em]:italic [&_del]:line-through
                [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                [&_li]:my-0.5 [&_p]:my-1
                [&_h1]:text-xl [&_h1]:font-bold [&_h1]:my-2
                [&_h2]:text-lg [&_h2]:font-bold [&_h2]:my-1.5
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:my-1
                [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs
                [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_pre]:overflow-x-auto
                [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]}>{item.content}</ReactMarkdown>
              </div>
            )}

            {/* 復習スケジュールチップ + 登録日（特急メモはチップ非表示） */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {!isInboxItem && item.reviews.map((r) => (
                  <span
                    key={r.stageIndex}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      r.completed
                        ? 'border-gray-100 bg-gray-50 text-gray-300 line-through'
                        : r.stageIndex === nextReview?.stageIndex
                        ? STAGE_COLORS[r.stageIndex]
                        : 'border-gray-100 bg-gray-50 text-gray-400'
                    }`}
                  >
                    {STAGE_LABELS[r.stageIndex]} {format(new Date(r.scheduledDate), 'M/d', { locale: ja })}
                    {r.completed && ' ✓'}
                  </span>
                ))}
              </div>
              <span className="shrink-0 text-xs text-gray-400">{format(new Date(item.dateKey), 'M/d', { locale: ja })} 登録</span>
            </div>

            {showReviewAction && nextReview && !fullyDone && !isInboxItem && (
              <button
                onClick={completeReview}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-brand-500 px-4 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
              >
                ◯ この復習を完了（{STAGE_LABELS[nextReview.stageIndex]}）
              </button>
            )}
          </div>
        )}

        {editing && <EditModal item={item} uid={uid} onClose={() => setEditing(false)} />}
      </div>
    );
  }

  // ── 通常レイアウト（他タブ、またはコンパクトカードを展開した状態）────
  return (
    <div
      className={`rounded-lg border transition-shadow cursor-pointer ${pageDeleted ? 'bg-gray-300 border-gray-400' : `${cardBg} ${expanded ? 'border-brand-200 shadow-sm' : 'border-gray-300 hover:border-gray-400'}`}`}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* 削除済みノート警告バナー */}
      {pageDeleted && (
        <div className="flex items-center gap-1 rounded-t-lg bg-red-100 px-3 py-1 text-xs text-red-500">
          <span>⚠️</span><span>リンク先のノートが削除されました</span>
        </div>
      )}
      {/* カードヘッダー */}
      <div className={`flex gap-3 px-4 py-3 ${expanded ? 'items-center' : 'items-start'}`}>
        {showReviewAction && nextReview && !fullyDone && (
          <button
            onClick={(e) => { e.stopPropagation(); completeReview(); }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-gray-300 hover:border-brand-500 hover:bg-brand-50"
            title="この復習を完了"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`min-w-0 font-bold text-gray-900 leading-snug ${expanded ? 'text-2xl' : 'truncate text-sm'}`}>
              {item.title || item.content.split('\n')[0].slice(0, 60)}
            </p>
            {item.isPageReview && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700" title="ページ（章）まるごとの復習">
                {item.chapterId ? '📖 章' : '📄 ページ全体'}
              </span>
            )}
          </div>
          {!expanded && item.content && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-400">
              {item.content.replace(/[#\*`_~>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            {noteLinkHref && (
              <Link
                href={noteLinkHref}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
                title="ノートを開く（ハイライト表示）"
              >
                <span>📖</span><span>ノートを開く</span>
              </Link>
            )}
            <button onClick={(e) => { e.stopPropagation(); copyContent(); }} className={`rounded p-1 hover:bg-gray-100 hover:text-gray-500 ${pageDeleted ? 'text-gray-500' : 'text-gray-300'}`} title="コピー">⎘</button>
            <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className={`rounded p-1 hover:bg-gray-100 hover:text-gray-500 ${pageDeleted ? 'text-gray-500' : 'text-gray-300'}`} title="編集">✎</button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} className={`rounded p-1 hover:bg-red-50 hover:text-red-400 ${pageDeleted ? 'text-gray-500' : 'text-gray-300'}`} title="削除">✕</button>
          </div>
          {item.notionPagePath && (
            <div className="flex min-w-0 items-center gap-1 text-xs text-gray-400">
              <NotionPageIconInline page={linkedPage} fallbackIcon="📁" />
              <span className="min-w-0 truncate">{item.notionPagePath}</span>
            </div>
          )}
        </div>
      </div>

      {/* 本文エリア（中のクリックでは閉じない） */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()} onDoubleClick={() => setExpanded(false)}>
          {item.content && (
            <div className="mb-3 max-w-none text-sm text-gray-700
              [&_strong]:font-bold [&_em]:italic [&_del]:line-through
              [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
              [&_li]:my-0.5 [&_p]:my-1
              [&_h1]:text-xl [&_h1]:font-bold [&_h1]:my-2
              [&_h2]:text-lg [&_h2]:font-bold [&_h2]:my-1.5
              [&_h3]:text-base [&_h3]:font-semibold [&_h3]:my-1
              [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs
              [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_pre]:overflow-x-auto
              [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]}>{item.content}</ReactMarkdown>
            </div>
          )}

          {/* 復習スケジュールチップ + 登録日 */}
          {/* 復習スケジュールチップ + 登録日（特急メモはチップ非表示） */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {!isInboxItem && item.reviews.map((r) => (
                <span
                  key={r.stageIndex}
                  className={`rounded border px-2 py-0.5 text-xs ${
                    r.completed
                      ? 'border-gray-100 bg-gray-50 text-gray-300 line-through'
                      : r.stageIndex === nextReview?.stageIndex
                      ? STAGE_COLORS[r.stageIndex]
                      : 'border-gray-100 bg-gray-50 text-gray-400'
                  }`}
                >
                  {STAGE_LABELS[r.stageIndex]} {format(new Date(r.scheduledDate), 'M/d', { locale: ja })}
                  {r.completed && ' ✓'}
                </span>
              ))}
            </div>
            <span className="shrink-0 text-xs text-gray-400">{format(new Date(item.dateKey), 'M/d', { locale: ja })} 登録</span>
          </div>

          {showReviewAction && nextReview && !fullyDone && !isInboxItem && (
            <button
              onClick={completeReview}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-brand-500 px-4 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
            >
              ◯ この復習を完了（{STAGE_LABELS[nextReview.stageIndex]}）
            </button>
          )}
        </div>
      )}

      {editing && (
        <EditModal item={item} uid={uid} onClose={() => setEditing(false)} />
      )}
    </div>
  );
});

// ── 編集モーダル ─────────────────────────────────────────────────────

function EditModal({ item, uid, onClose }: {
  item: LearningItem;
  uid: string;
  onClose: () => void;
}) {
  const update = useLearningStore((s) => s.update);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);

  const submit = async () => {
    await update(uid, item.id, { title: title.trim(), content: content.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-semibold text-gray-800">アイテム編集</h3>
        {item.notionPagePath && (
          <p className="mb-3 flex items-center gap-1 text-xs text-gray-400">
            <span>📁</span><span className="min-w-0 truncate">{item.notionPagePath}</span>
          </p>
        )}
        <div className="space-y-3">
          <input placeholder="タイトル" value={title} onChange={(e) => setTitle(e.target.value)} className={cls} />
          <textarea placeholder="内容（Markdown対応）" value={content} onChange={(e) => setContent(e.target.value)} rows={5} className={cls} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={submit} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">保存</button>
        </div>
      </div>
    </div>
  );
}

// ── ノートページのアイコンをインライン表示（URL画像 or 絵文字） ───────
function NotionPageIconInline({
  page, fallbackIcon = '📁',
}: {
  page: { icon: string } | null | undefined;
  fallbackIcon?: string;
}) {
  const icon = page?.icon;
  if (!icon) return <span className="shrink-0">{fallbackIcon}</span>;
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        className="h-3.5 w-3.5 shrink-0 rounded object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return <span className="shrink-0">{icon}</span>;
}

// ── 共通UIパーツ ─────────────────────────────────────────────────────

function BadgeDivider({
  label, count, badgeClass = 'border-gray-200 bg-white text-gray-500', countBg = 'bg-gray-400', leftAlign = false,
}: {
  label: string; count?: number; badgeClass?: string; countBg?: string; leftAlign?: boolean;
}) {
  return (
    <div className="my-3 flex items-center gap-2">
      {!leftAlign && <div className="h-px flex-1 bg-gray-200" />}
      <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${badgeClass}`}>
        {label}
        {count !== undefined && (
          <span className={`flex h-4 min-w-[1rem] items-center justify-center rounded-full px-0.5 text-[10px] text-white ${countBg}`}>
            {count}
          </span>
        )}
      </div>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center text-sm text-gray-300">{text}</div>;
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}

const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500';


// ── 消化モーダル（特急メモ → 正式なメモへ移行） ───────────────────────────

// ページ階層パス（例: 事業 > IT スキル）
function buildPagePath(pageId: string, pages: { id: string; title: string; parentId?: string }[]): string {
  const parts: string[] = [];
  let current = pages.find((p) => p.id === pageId);
  while (current) {
    parts.unshift(current.title || '（無題）');
    current = current.parentId ? pages.find((p) => p.id === current!.parentId) : undefined;
  }
  return parts.join(' > ');
}

function isImg(s: string) {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:');
}

// 特急メモを TipTap doc(JSON文字列) に変換（見出し3＝タイトル＋本文段落）
function memoToDocJson(title: string, body: string): string {
  const nodes: object[] = [];
  const t = (title || '').trim();
  if (t) nodes.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: t }] });
  const lines = (body || '').replace(/\r\n/g, '\n').split('\n');
  const hasBody = !(lines.length === 1 && lines[0].trim() === '');
  if (hasBody) {
    for (const line of lines) {
      nodes.push(line.trim() ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' });
    }
  }
  if (nodes.length === 0) nodes.push({ type: 'paragraph' });
  return JSON.stringify({ type: 'doc', content: nodes });
}

// 合成した doc の中身ブロックを、対象ページ本文(doc)の末尾に追記する
// 合成した doc を、対象ページ本文の指定位置に挿入する。
// atIndex: null=末尾 / 数値=そのトップレベルブロック配列の splice 位置（0=先頭, len=末尾）。
function insertDocIntoPageContent(pageContent: string, addedDocJson: string, atIndex: number | null): string {
  let base: { type: string; content: unknown[] };
  try {
    const p = JSON.parse(pageContent || '') as { type?: string; content?: unknown[] };
    base = (p && p.type === 'doc' && Array.isArray(p.content)) ? (p as { type: string; content: unknown[] }) : { type: 'doc', content: [] };
  } catch { base = { type: 'doc', content: [] }; }
  let added: { content?: unknown[] };
  try { added = JSON.parse(addedDocJson || '') as { content?: unknown[] }; } catch { added = { content: [] }; }
  const addedBlocks = Array.isArray(added.content) ? added.content : [];
  if (addedBlocks.length === 0) return pageContent || JSON.stringify(base);
  const blocks = base.content;
  let content: unknown[];
  if (atIndex === null || atIndex >= blocks.length) content = [...blocks, ...addedBlocks];
  else if (atIndex <= 0) content = [...addedBlocks, ...blocks];
  else content = [...blocks.slice(0, atIndex), ...addedBlocks, ...blocks.slice(atIndex)];
  return JSON.stringify({ ...base, content });
}

// ページ本文のトップレベルブロック一覧（挿入位置プレビュー用）
function pageBlocks(pageContent: string): { type?: string; attrs?: { level?: number; title?: string }; content?: unknown[] }[] {
  try {
    const d = JSON.parse(pageContent || '') as { content?: unknown[] };
    return Array.isArray(d?.content) ? (d.content as { type?: string; attrs?: { level?: number; title?: string }; content?: unknown[] }[]) : [];
  } catch { return []; }
}

// ブロック内の全テキストを連結
function blockText(node: { type?: string; text?: string; content?: unknown[] }): string {
  const parts: string[] = [];
  const walk = (n: { type?: string; text?: string; content?: unknown[] }) => {
    if (n.type === 'text' && n.text) parts.push(n.text);
    if (Array.isArray(n.content)) (n.content as { type?: string; text?: string; content?: unknown[] }[]).forEach(walk);
  };
  walk(node);
  return parts.join('').trim();
}

// ブロックを「ラベル＋プレビュー文」に
function blockPreview(block: { type?: string; attrs?: { level?: number; title?: string }; content?: unknown[] }): { label: string; text: string } {
  const t = blockText(block);
  switch (block.type) {
    case 'heading':        return { label: 'H' + (block.attrs?.level ?? 1), text: t || '（無題の見出し）' };
    case 'paragraph':      return { label: '¶',   text: t || '（空行）' };
    case 'bulletList':     return { label: '•',   text: t || 'リスト' };
    case 'orderedList':    return { label: '1.',  text: t || 'リスト' };
    case 'taskList':       return { label: '☑',  text: t || 'Todo' };
    case 'blockquote':     return { label: '❝',  text: t || '引用' };
    case 'codeBlock':      return { label: '</>', text: t || 'コード' };
    case 'horizontalRule': return { label: '—',  text: '区切り線' };
    case 'callout':        return { label: '💡', text: t || 'コールアウト' };
    case 'toggleHeading':  return { label: '▶',  text: t || 'トグル見出し' };
    case 'pageTable':      return { label: '📋', text: '看板（ページテーブル）' };
    case 'pageDescTable':  return { label: '▤',  text: 'テーブルビュー' };
    case 'pageLink':       return { label: '🔗', text: block.attrs?.title || 'ページリンク' };
    case 'inlineDatabase': return { label: '▦',  text: 'データベース' };
    case 'image':          return { label: '🖼', text: '画像' };
    case 'table':          return { label: '⊞',  text: '表' };
    case 'toc':            return { label: '≡',  text: '目次' };
    default:               return { label: '▫',  text: block.type || '' };
  }
}

// doc から復習アイテム用のプレーンテキストを抽出（ブロックごとに改行）
function docToPlainText(docJson: string): string {
  try {
    const doc = JSON.parse(docJson) as { content?: { content?: unknown[] }[] };
    const blocks = Array.isArray(doc.content) ? doc.content : [];
    const lines: string[] = [];
    for (const block of blocks) {
      const parts: string[] = [];
      const walk = (n: { type?: string; text?: string; content?: unknown[] }) => {
        if (n.type === 'text' && n.text) parts.push(n.text);
        if (Array.isArray(n.content)) (n.content as { type?: string; text?: string; content?: unknown[] }[]).forEach(walk);
      };
      walk(block as { content?: unknown[] });
      lines.push(parts.join(''));
    }
    return lines.join('\n').trim();
  } catch { return ''; }
}

function DigestDialog({ item, uid, onClose }: {
  item: LearningItem;
  uid: string;
  onClose: () => void;
}) {
  const { pages, add: addPage, update: updatePage } = useNotionPageStore();
  const { add: addItem, remove: removeItem } = useLearningStore();
  const contentRef = useRef<(() => string) | null>(null);

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null); // null=末尾 / 数値=splice位置
  const [posPickerOpen, setPosPickerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(item.title || '無題メモ');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) ?? null, [pages, selectedPageId]);
  // 現在の挿入位置のサマリー表示
  const insertSummary = useMemo(() => {
    if (!selectedPage) return '';
    if (insertAt === null) return 'ページの末尾';
    if (insertAt <= 0) return 'ページの先頭';
    const blocks = pageBlocks(selectedPage.content);
    const prev = blocks[insertAt - 1];
    return prev ? `「${blockPreview(prev).text}」の後` : 'ページの末尾';
  }, [selectedPage, insertAt]);

  // ページを選び直したら挿入位置は末尾に戻す
  const pickPage = (pageId: string) => { setSelectedPageId(pageId); setInsertAt(null); };

  // 最初からこのメモを入れておく（推奨A）
  const initialDoc = useMemo(() => memoToDocJson(item.title, item.content), [item.title, item.content]);

  const candidatePages = useMemo(
    () => pages
      .filter((p) => p.id !== 'workspace' && !p.type)
      .filter((p) => (p.title || '').toLowerCase().includes(query.toLowerCase()))
      .slice()
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 40),
    [pages, query],
  );

  const canConfirm = mode === 'new' ? newTitle.trim().length > 0 : !!selectedPageId;

  const handleConfirm = async () => {
    if (saving || !canConfirm) return;
    const composed = contentRef.current?.() || initialDoc;
    const plain = docToPlainText(composed) || item.content;
    setSaving(true);
    try {
      let targetId: string;
      let targetPath: string;
      if (mode === 'new') {
        const t = newTitle.trim() || '無題メモ';
        const np = await addPage(uid, { title: t, icon: '📝' });
        await updatePage(uid, np.id, { content: insertDocIntoPageContent('', composed, null) });
        targetId = np.id;
        targetPath = t;
      } else {
        const page = pages.find((p) => p.id === selectedPageId);
        if (!page) { setSaving(false); return; }
        await updatePage(uid, page.id, { content: insertDocIntoPageContent(page.content, composed, insertAt) });
        targetId = page.id;
        targetPath = buildPagePath(page.id, pages);
      }
      await addItem(uid, {
        dateKey: localDateKey(),
        title: item.title,
        content: plain,
        sortOrder: Date.now(),
        notionPageId: targetId,
        notionPagePath: targetPath,
      });
      await removeItem(uid, item.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="flex shrink-0 items-center justify-between border-b border-brand-100 bg-brand-50 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-brand-700">📥 消化（正式なメモへ移行）</h3>
            <p className="mt-0.5 text-[11px] text-brand-500">内容を整えて、選んだページへ追記＋復習に登録します（「/特急メモ」で他のメモも呼べます）</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600">✕</button>
        </div>

        {/* エディタ（本物のノート編集画面・スラッシュ可） */}
        <div className="flex min-h-0 flex-1 flex-col">
          <DigestEditor
            initialTitle=""
            initialContent={initialDoc}
            onSave={async () => {}}
            contentGetterRef={contentRef}
            hideTitle
            stickyToolbar
          />
        </div>

        {/* 追記先の選択 */}
        <div className="shrink-0 space-y-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-gray-500">追記先：</span>
            <button onClick={() => setMode('existing')}
              className={`rounded-full px-3 py-1 ${mode === 'existing' ? 'bg-brand-500 font-medium text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>既存ページ</button>
            <button onClick={() => setMode('new')}
              className={`rounded-full px-3 py-1 ${mode === 'new' ? 'bg-brand-500 font-medium text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>新規ページ</button>
          </div>

          {mode === 'new' ? (
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="新しいページのタイトル"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-400" />
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ページを検索..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-400" />
              <div className="max-h-28 space-y-1 overflow-y-auto">
                {candidatePages.length === 0 ? (
                  <p className="rounded-lg border border-gray-200 bg-white p-2 text-center text-xs text-gray-400">該当ページなし</p>
                ) : candidatePages.map((p) => (
                  <button key={p.id} onClick={() => pickPage(p.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left ${selectedPageId === p.id ? 'border-brand-400 bg-brand-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden text-sm leading-none">{isImg(p.icon)
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.icon} alt="" className="h-4 w-4 rounded object-cover" />
                      : (p.icon || '📄')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-gray-700">{p.title || '（無題）'}</span>
                      <span className="block truncate text-[10px] text-gray-400">{buildPagePath(p.id, pages)}</span>
                    </span>
                    {selectedPageId === p.id && <span className="shrink-0 text-xs text-brand-500">✓</span>}
                  </button>
                ))}
              </div>

              {/* 挿入位置（ページ選択後）：ノートを開いて視覚的に選ぶ */}
              {selectedPage && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <span className="shrink-0 text-[10px] font-semibold text-gray-500">挿入位置</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{insertSummary}</span>
                  <button onClick={() => setPosPickerOpen(true)}
                    className="shrink-0 rounded-lg border border-brand-200 px-2.5 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-50">📍 ノートを開いて選ぶ</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* フッター */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-gray-400 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleConfirm} disabled={!canConfirm || saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-40">
            {saving ? '消化中...' : '確定して復習に登録'}
          </button>
        </div>
      </div>

      {/* 挿入位置ピッカー（ノートを直接開いてブロック間をクリック） */}
      {posPickerOpen && selectedPage && (
        <InsertPositionPicker
          pageTitle={selectedPage.title || '（無題）'}
          pageContent={selectedPage.content}
          current={insertAt}
          onPick={(at) => { setInsertAt(at); setPosPickerOpen(false); }}
          onClose={() => setPosPickerOpen(false)}
        />
      )}
    </div>
  );
}

// 挿入位置ピッカー：対象ノートの中身をプレビューし、ブロックの間をクリックして位置を決める
function InsertPositionPicker({ pageTitle, pageContent, current, onPick, onClose }: {
  pageTitle: string;
  pageContent: string;
  current: number | null;
  onPick: (atIndex: number | null) => void;
  onClose: () => void;
}) {
  const blocks = useMemo(() => pageBlocks(pageContent), [pageContent]);
  const endIndex = blocks.length;
  const sel = current === null ? endIndex : current;

  // 挿入バー（クリックでその位置に決定）。at===endIndex は末尾（null）として返す。
  const Bar = ({ at }: { at: number }) => (
    <button onClick={() => onPick(at >= endIndex ? null : at)}
      className="group flex w-full items-center gap-2 py-1" title="ここに挿入">
      <span className={`h-0.5 flex-1 rounded ${sel === at ? 'bg-brand-500' : 'bg-gray-200 group-hover:bg-brand-300'}`} />
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${sel === at ? 'bg-brand-500 text-white' : 'border border-gray-200 text-gray-400 group-hover:border-brand-300 group-hover:text-brand-500'}`}>
        {sel === at ? 'ここ ✓' : 'ここに挿入'}
      </span>
      <span className={`h-0.5 flex-1 rounded ${sel === at ? 'bg-brand-500' : 'bg-gray-200 group-hover:bg-brand-300'}`} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">📍 挿入位置を選ぶ</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">「{pageTitle}」のどこに入れるか、線をクリックして選んでください</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {blocks.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">このページは空です。先頭（＝末尾）に挿入します。</p>
          ) : (
            <>
              <Bar at={0} />
              {blocks.map((b, i) => {
                const pv = blockPreview(b);
                return (
                  <div key={i}>
                    <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
                      <span className="mt-0.5 shrink-0 text-[10px] font-semibold text-gray-400">{pv.label}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{pv.text}</span>
                    </div>
                    <Bar at={i + 1} />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
