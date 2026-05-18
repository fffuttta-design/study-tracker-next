'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { NotionEditor } from '@/components/editor/NotionEditor';
import {
  type LearningItem,
  hasDueReview,
  isFullyCompleted,
} from '@study-tracker/core';
import { format, addDays, subDays, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';

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

const STAGE_LABELS = ['翌日', '3日後', '7日後', '2週間後', '1ヶ月後'];
const STAGE_COLORS = [
  'bg-red-50 text-red-500 border-red-200',
  'bg-yellow-50 text-yellow-600 border-yellow-200',
  'bg-green-50 text-green-600 border-green-200',
  'bg-blue-50 text-blue-600 border-blue-200',
  'bg-purple-50 text-purple-600 border-purple-200',
];

function dailyQuote(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── メインページ ─────────────────────────────────────────────────────

export default function LearningPage() {
  const { user } = useAuthStore();
  const { items, loading } = useLearningStore();
  const [tab, setTab] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const dateKey = toDateKey(selectedDate);

  const todayItems = useMemo(
    () => items.filter((i) => i.dateKey === dateKey).sort((a, b) => a.sortOrder - b.sortOrder),
    [items, dateKey]
  );
  const dueItems = useMemo(() => items.filter(hasDueReview), [items]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* 日付ナビ + 格言 */}
      <div className="border-b border-gray-100 px-6 py-3">
        <p className="mb-2 text-xs italic text-gray-400">💡 {dailyQuote()}</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedDate((d) => subDays(d, 1))} className="rounded p-1 text-gray-400 hover:bg-gray-100">‹</button>
          <span className="min-w-[160px] text-center text-sm font-medium text-gray-700">
            {format(selectedDate, 'yyyy年M月d日（E）', { locale: ja })}
            {isToday(selectedDate) && <span className="ml-2 rounded bg-brand-500 px-1.5 py-0.5 text-xs text-white">今日</span>}
          </span>
          <button onClick={() => setSelectedDate((d) => addDays(d, 1))} className="rounded p-1 text-gray-400 hover:bg-gray-100">›</button>
          {!isToday(selectedDate) && (
            <button onClick={() => setSelectedDate(new Date())} className="ml-1 rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50">今日</button>
          )}
          <span className="ml-auto text-xs text-red-500">{dueItems.length > 0 ? `復習待ち ${dueItems.length}件` : ''}</span>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-100 px-6">
        {['ダッシュボード', '本日の学習', '今日の復習', '通知ログ'].map((label, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={`mr-4 border-b-2 py-2.5 text-sm transition-colors ${tab === i ? 'border-brand-500 font-medium text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {label}
            {i === 2 && dueItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{dueItems.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {tab === 0 && <DashboardTab todayItems={todayItems} dueItems={dueItems} uid={user?.uid ?? ''} selectedDate={selectedDate} onAdd={() => setQuickNoteOpen(true)} />}
        {tab === 1 && <TodayTab items={todayItems} uid={user?.uid ?? ''} onAdd={() => setQuickNoteOpen(true)} />}
        {tab === 2 && <ReviewTab dueItems={dueItems} uid={user?.uid ?? ''} />}
        {tab === 3 && <LogTab />}
      </div>

      {/* QuickNoteDialog */}
      {quickNoteOpen && user && (
        <QuickNoteDialog uid={user.uid} onClose={() => setQuickNoteOpen(false)} />
      )}
    </div>
  );
}

// ── QuickNoteDialog（NotionEditor 全画面モーダル）─────────────────────

function QuickNoteDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { add: addPage, update: updatePage } = useNotionPageStore();
  const { add: addItem } = useLearningStore();
  const [pageId, setPageId] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [recorded, setRecorded] = useState(false);
  const recordTriggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    addPage(uid).then((page) => setPageId(page.id));
  }, [uid, addPage]);

  const handleSave = async (title: string, content: string) => {
    if (!pageId) return;
    setPageTitle(title);
    await updatePage(uid, pageId, { title, content });
  };

  const handleRecordText = async (text: string) => {
    if (!text.trim()) return;
    const firstLine = text.split('\n').find((l) => l.trim())?.trim() ?? '';
    await addItem(uid, {
      dateKey: new Date().toISOString().slice(0, 10),
      title: firstLine.slice(0, 80),
      content: text,
      sortOrder: 0,
      notionPageId: pageId ?? undefined,
      notionPagePath: pageTitle || 'Untitled',
    });
    setRecorded(true);
    setTimeout(() => setRecorded(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3">
        <span className="text-sm font-medium text-gray-500">📝 新規ノート</span>
        <div className="flex items-center gap-3">
          {recorded && (
            <span className="rounded-full bg-green-50 px-3 py-0.5 text-xs font-medium text-green-600">
              ✓ 記録しました
            </span>
          )}
          <button
            onClick={() => recordTriggerRef.current?.()}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            📚 テキストを選択して記録
          </button>
          <button onClick={onClose} className="rounded p-1 text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600">✕</button>
        </div>
      </div>

      {/* エディタ */}
      <div className="flex-1 overflow-hidden">
        {pageId ? (
          <NotionEditor
            key={pageId}
            initialTitle=""
            initialContent=""
            onSave={handleSave}
            recordTriggerRef={recordTriggerRef}
            onRecordText={handleRecordText}
            notionPageId={pageId}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── ダッシュボードタブ ───────────────────────────────────────────────

function DashboardTab({ todayItems, dueItems, uid, selectedDate, onAdd }: {
  todayItems: LearningItem[];
  dueItems: LearningItem[];
  uid: string;
  selectedDate: Date;
  onAdd: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-gray-100">
      <div className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {format(selectedDate, 'M月d日', { locale: ja })}の登録 ({todayItems.length})
          </h2>
          <button onClick={onAdd} className="shrink-0 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
            + 追加
          </button>
        </div>
        {todayItems.length === 0
          ? <Empty text="今日の学習はまだありません" />
          : <ItemList items={todayItems} uid={uid} />}
      </div>
      <div className="p-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          復習待ち ({dueItems.length})
        </h2>
        {dueItems.length === 0
          ? <Empty text="復習待ちのアイテムはありません 🎉" />
          : <ItemList items={dueItems.slice(0, 10)} uid={uid} showReviewAction />}
      </div>
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
        : <ItemList items={filtered} uid={uid} showReviewAction />}
    </div>
  );
}

// ── 復習タブ ─────────────────────────────────────────────────────────

function ReviewTab({ dueItems, uid }: {
  dueItems: LearningItem[];
  uid: string;
}) {
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
        : grouped.map((g) => (
          <div key={g.index}>
            <h2 className={`mb-2 text-xs font-semibold ${STAGE_COLORS[g.index].split(' ')[1]}`}>
              {g.label}（{g.items.length}件）
            </h2>
            <ItemList items={g.items} uid={uid} showReviewAction />
          </div>
        ))}
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

function ItemList({ items, uid, showReviewAction = false }: {
  items: LearningItem[];
  uid: string;
  showReviewAction?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} uid={uid} showReviewAction={showReviewAction} />
      ))}
    </div>
  );
}

// ── アイテムカード ────────────────────────────────────────────────────

function ItemCard({ item, uid, showReviewAction }: {
  item: LearningItem;
  uid: string;
  showReviewAction: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { update, remove } = useLearningStore();
  const nextReview = item.reviews.find((r) => !r.completed);
  const fullyDone = isFullyCompleted(item);
  const due = hasDueReview(item);

  const completeReview = async () => {
    const updated = item.reviews.map((r) =>
      !r.completed && r.stageIndex === nextReview?.stageIndex ? { ...r, completed: true } : r
    );
    await update(uid, item.id, { reviews: updated });
  };

  const handleDelete = async () => {
    if (!confirm(`「${item.title || item.content.slice(0, 20)}」を削除しますか？`)) return;
    await remove(uid, item.id);
  };

  const copyContent = () => {
    navigator.clipboard.writeText([item.title, item.content].filter(Boolean).join('\n'));
  };

  const reviewBadge = fullyDone
    ? <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs text-green-600">完了</span>
    : due
    ? <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs text-red-500">復習待ち</span>
    : nextReview
    ? <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-500">次: {STAGE_LABELS[nextReview.stageIndex]}</span>
    : null;

  return (
    <div className={`rounded-lg border bg-white transition-shadow ${expanded ? 'border-brand-200 shadow-sm' : 'border-gray-100 hover:border-gray-200'}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {showReviewAction && nextReview && !fullyDone && (
          <button
            onClick={completeReview}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-gray-300 hover:border-brand-500 hover:bg-brand-50"
            title="この復習を完了"
          />
        )}

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
          <div className="flex flex-wrap items-center gap-1.5">
            {reviewBadge}
            <span className="font-medium text-gray-800 text-sm">
              {item.title || item.content.split('\n')[0].slice(0, 60)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            {item.notionPagePath && (
              <span className="flex items-center gap-0.5">
                <span>📁</span><span>{item.notionPagePath}</span>
              </span>
            )}
            {nextReview && !fullyDone && (
              <span>次: {format(new Date(nextReview.scheduledDate), 'M/d', { locale: ja })}</span>
            )}
            <span>{format(new Date(item.dateKey), 'M/d', { locale: ja })} 登録</span>
          </div>
          {!expanded && item.content && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-400">
              {item.content.replace(/[#\*`_~>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {item.notionPageId && (
            <Link
              href={`/notion-plus/${item.notionPageId}?hl=${encodeURIComponent(item.content.slice(0, 60))}`}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-brand-500 hover:bg-brand-50"
              title="ノートで開く（ハイライト表示）"
            >
              <span>📖</span>
              <span>開く</span>
            </Link>
          )}
          <button onClick={copyContent} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500" title="コピー">⎘</button>
          <button onClick={() => setEditing(true)} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500" title="編集">✎</button>
          <button onClick={handleDelete} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400" title="削除">✕</button>
          <button onClick={() => setExpanded((v) => !v)} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
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
              <ReactMarkdown>{item.content.replace(/\n(?!\n)/g, '  \n')}</ReactMarkdown>
            </div>
          )}

          {/* 復習スケジュールチップ */}
          <div className="flex flex-wrap gap-1.5">
            {item.reviews.map((r) => (
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

          {showReviewAction && nextReview && !fullyDone && (
            <button
              onClick={completeReview}
              className="mt-3 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
            >
              この復習を完了（{STAGE_LABELS[nextReview.stageIndex]}）
            </button>
          )}
        </div>
      )}

      {editing && (
        <EditModal item={item} uid={uid} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

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
            <span>📁</span><span>{item.notionPagePath}</span>
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

// ── 共通UIパーツ ─────────────────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center text-sm text-gray-300">{text}</div>;
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}

const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500';
