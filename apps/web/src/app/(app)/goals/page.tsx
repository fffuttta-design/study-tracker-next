'use client';

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGoalStore, type Goal } from '@/stores/goalStore';

// ── 覚えるリスト ──────────────────────────────────────────────────────
// 2026-09-05：ステータス3段階（未着手→学習中→習得済み）・カテゴリ・優先度を廃止し、
// 「タイトル＋完了チェックボックス」だけの素直なチェックリストにした（本人指示）。
// ※ Goal 型には category / priority が残っているが、これは既存データ用の名残で画面では使わない。

type Filter = 'all' | 'todo' | 'done';

const FILTER_LABEL: Record<Filter, string> = { all: '全て', todo: '未完了', done: '完了' };

const isDone = (g: Goal) => g.status === 'done';

export default function GoalsPage() {
  const { user } = useAuthStore();
  const { goals, loading, add, update, remove } = useGoalStore();
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const uid = user?.uid ?? '';

  const counts = useMemo(() => ({
    all: goals.length,
    todo: goals.filter((g) => !isDone(g)).length,
    done: goals.filter((g) => isDone(g)).length,
  }), [goals]);

  const filtered = useMemo(() => {
    if (filter === 'all') return goals;
    if (filter === 'done') return goals.filter((g) => isDone(g));
    return goals.filter((g) => !isDone(g));
  }, [goals, filter]);

  // 未完了 → 完了 の順に並べる（完了は下に沈める）
  const sections = useMemo(() => ([
    { key: 'todo' as const, label: '未完了', items: filtered.filter((g) => !isDone(g)) },
    { key: 'done' as const, label: '完了', items: filtered.filter((g) => isDone(g)) },
  ].filter((s) => s.items.length > 0)), [filtered]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">覚えるリスト</h1>
              <p className="text-xs text-gray-400">{counts.done} / {counts.all} 件 完了</p>
            </div>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <span>＋</span> 追加
          </button>
        </div>

        {/* フィルター（全て / 未完了 / 完了） */}
        <div className="mt-4 flex items-center gap-1.5">
          {(['all', 'todo', 'done'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {FILTER_LABEL[f]} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="mx-auto max-w-3xl px-6 py-6 space-y-8">
        {goals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <span className="text-5xl">🎯</span>
            <p className="text-gray-500 font-medium">まだ何も登録されていません</p>
            <p className="text-sm text-gray-400">「＋ 追加」から覚えたいことを登録しましょう</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-gray-400">該当するアイテムはありません</p>
          </div>
        ) : (
          sections.map(({ key, label, items }) => (
            <section key={key}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">{label}</span>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-500">{items.length}</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="space-y-2">
                {items.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} uid={uid} onUpdate={update} onRemove={remove} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {addOpen && <AddModal uid={uid} onAdd={add} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

// ── カード（チェックボックス＋タイトル）──────────────────────────────

function GoalCard({
  goal, uid, onUpdate, onRemove,
}: {
  goal: Goal;
  uid: string;
  onUpdate: (uid: string, id: string, data: Partial<Goal>) => Promise<void>;
  onRemove: (uid: string, id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const done = isDone(goal);

  const toggleDone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onUpdate(uid, goal.id, { status: done ? 'todo' : 'done' });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`「${goal.title}」を削除しますか？`)) return;
    await onRemove(uid, goal.id);
  };

  return (
    <div
      className={`rounded-xl border bg-white transition-all ${goal.memo ? 'cursor-pointer' : ''} ${
        expanded ? 'border-brand-200 shadow-md' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
      } ${done ? 'opacity-60' : ''}`}
      onClick={() => goal.memo && setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* 完了チェックボックス */}
        <button
          onClick={toggleDone}
          title={done ? '未完了に戻す' : '完了にする'}
          aria-label={done ? '未完了に戻す' : '完了にする'}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-xs font-bold transition-colors ${
            done
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-gray-300 bg-white text-transparent hover:border-brand-400'
          }`}
        >
          ✓
        </button>

        {/* 本体 */}
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-snug ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {goal.title}
          </p>
          {!expanded && goal.memo && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-400">{goal.memo}</p>
          )}
        </div>

        {/* 右側アクション */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="rounded p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
            title="編集"
          >✎</button>
          <button
            onClick={handleDelete}
            className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-400"
            title="削除"
          >✕</button>
        </div>
      </div>

      {/* 展開：メモ全文 */}
      {expanded && goal.memo && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{goal.memo}</p>
        </div>
      )}

      {editing && (
        <EditModal goal={goal} uid={uid} onSave={onUpdate} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

// ── 追加モーダル ──────────────────────────────────────────────────────

function AddModal({
  uid, onAdd, onClose,
}: {
  uid: string;
  onAdd: (uid: string, params: Pick<Goal, 'title' | 'memo'>) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onAdd(uid, { title: title.trim(), memo: memo.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-lg font-bold text-gray-900">🎯 覚えることを追加</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">タイトル *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              placeholder="例：ビジネスモデル9種類"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 resize-none"
              placeholder="覚えたい理由・参考リンクなど（任意）"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            {saving ? '保存中…' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 編集モーダル ──────────────────────────────────────────────────────

function EditModal({
  goal, uid, onSave, onClose,
}: {
  goal: Goal;
  uid: string;
  onSave: (uid: string, id: string, data: Partial<Goal>) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [memo, setMemo] = useState(goal.memo);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(uid, goal.id, { title: title.trim(), memo: memo.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-lg font-bold text-gray-900">✎ 編集</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">タイトル *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
