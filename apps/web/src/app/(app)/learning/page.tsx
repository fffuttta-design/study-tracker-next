'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useCategoryStore } from '@/stores/categoryStore';
import {
  type LearningItem,
  type LearningCategory,
  hasDueReview,
  isFullyCompleted,
  categoryPath,
  IMPORTANCE_HIGH,
  IMPORTANCE_LOW,
  importanceLabel,
} from '@study-tracker/core';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

const DAILY_QUOTES = [
  '学ぶことをやめたら、教えることをやめなければならない。',
  '知識は経験によって磨かれる。',
  '今日学んだことが、明日の自分をつくる。',
  '一日一つ、必ず新しいことを学べ。',
  '継続は力なり。毎日の積み重ねが差を生む。',
  '好奇心こそが学びの原動力。',
  '深く考えることは、深く学ぶことだ。',
  '昨日より少しだけ賢くなることを目指せ。',
];

function dailyQuote() {
  const idx = new Date().getDate() % DAILY_QUOTES.length;
  return DAILY_QUOTES[idx];
}

function importanceBadge(importance: string) {
  if (importance === IMPORTANCE_HIGH) return 'bg-red-50 text-red-600';
  if (importance === IMPORTANCE_LOW) return 'bg-gray-100 text-gray-500';
  return 'bg-yellow-50 text-yellow-600';
}

export default function LearningPage() {
  const { user } = useAuthStore();
  const { items, loading } = useLearningStore();
  const { categories } = useCategoryStore();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const filtered = items.filter((item) => {
    const matchSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.content.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || item.categoryId === filterCat;
    return matchSearch && matchCat;
  });

  const dueItems = filtered.filter((i) => hasDueReview(i));
  const otherItems = filtered.filter((i) => !hasDueReview(i) && !isFullyCompleted(i));
  const doneItems = filtered.filter((i) => isFullyCompleted(i));

  if (loading) {
    return <PageShell><div className="flex justify-center pt-20"><Spinner /></div></PageShell>;
  }

  return (
    <PageShell>
      {/* ヘッダー */}
      <div className="border-b border-gray-100 px-6 py-4">
        <p className="text-xs text-gray-400 italic">💡 {dailyQuote()}</p>
        <div className="mt-3 flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="検索..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          >
            <option value="">すべてのカテゴリ</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryPath(c, categories)}
              </option>
            ))}
          </select>
          {user && (
            <AddButton uid={user.uid} categories={categories} />
          )}
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        <Section title={`復習期限 (${dueItems.length})`} accent="red" items={dueItems} categories={categories} uid={user?.uid ?? ''} />
        <Section title={`学習中 (${otherItems.length})`} items={otherItems} categories={categories} uid={user?.uid ?? ''} />
        <Section title={`完了 (${doneItems.length})`} accent="gray" items={doneItems} categories={categories} uid={user?.uid ?? ''} />
      </div>
    </PageShell>
  );
}

function Section({
  title, items, categories, uid, accent,
}: {
  title: string;
  items: LearningItem[];
  categories: LearningCategory[];
  uid: string;
  accent?: 'red' | 'gray';
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${accent === 'red' ? 'text-red-500' : accent === 'gray' ? 'text-gray-400' : 'text-brand-600'}`}>
        {title}
      </h2>
      <div className="space-y-1">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} categories={categories} uid={uid} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({
  item, categories, uid,
}: {
  item: LearningItem;
  categories: LearningCategory[];
  uid: string;
}) {
  const update = useLearningStore((s) => s.update);
  const cat = categories.find((c) => c.id === item.categoryId);

  const nextReview = item.reviews.find((r) => !r.completed);

  const completeReview = async () => {
    const updated = item.reviews.map((r) =>
      r === nextReview ? { ...r, completed: true } : r
    );
    await update(uid, item.id, { reviews: updated });
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 hover:border-gray-200">
      {nextReview && (
        <button
          onClick={completeReview}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gray-300 hover:border-brand-500"
          title="復習完了"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800">{item.title || item.content}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${importanceBadge(item.importance)}`}>
            {importanceLabel(item.importance)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
          {cat && <span>{cat.name}</span>}
          {nextReview && (
            <span>次の復習: {format(new Date(nextReview.scheduledDate), 'M/d', { locale: ja })}</span>
          )}
          <span>{format(new Date(item.dateKey), 'yyyy/M/d', { locale: ja })} 登録</span>
        </div>
      </div>
    </div>
  );
}

function AddButton({ uid, categories }: { uid: string; categories: LearningCategory[] }) {
  const [open, setOpen] = useState(false);
  const add = useLearningStore((s) => s.add);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [importance, setImportance] = useState<'high' | 'medium' | 'low'>('medium');

  const submit = async () => {
    if (!content.trim() && !title.trim()) return;
    await add(uid, {
      dateKey: new Date().toISOString().slice(0, 10),
      categoryId,
      title: title.trim(),
      url: '',
      content: content.trim(),
      importance,
      sortOrder: 0,
    });
    setTitle(''); setContent(''); setCategoryId(''); setImportance('medium');
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
      >
        + 追加
      </button>
      {open && (
        <Modal title="学習アイテム追加" onClose={() => setOpen(false)} onSubmit={submit} submitLabel="追加">
          <input placeholder="タイトル" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          <textarea placeholder="内容 *" value={content} onChange={(e) => setContent(e.target.value)} rows={3} className={inputCls} />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
            <option value="">カテゴリなし</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={importance} onChange={(e) => setImportance(e.target.value as 'high' | 'medium' | 'low')} className={inputCls}>
            <option value="high">重要度: 高</option>
            <option value="medium">重要度: 中</option>
            <option value="low">重要度: 低</option>
          </select>
        </Modal>
      )}
    </>
  );
}

// ── 共通UIパーツ ────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col">{children}</div>;
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}

function Modal({ title, children, onClose, onSubmit, submitLabel }: {
  title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; submitLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">{title}</h3>
        <div className="space-y-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={onSubmit} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500';
