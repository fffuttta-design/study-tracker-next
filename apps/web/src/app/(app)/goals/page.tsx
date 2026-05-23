'use client';

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGoalStore, type Goal, type GoalStatus, type GoalPriority } from '@/stores/goalStore';

// ── 定数 ──────────────────────────────────────────────────────────────

const STATUS_ORDER: GoalStatus[] = ['learning', 'todo', 'done'];
const STATUS_LABEL: Record<GoalStatus, string> = {
  learning: '学習中',
  todo: '未着手',
  done: '習得済み',
};
const STATUS_NEXT: Record<GoalStatus, GoalStatus> = {
  todo: 'learning',
  learning: 'done',
  done: 'todo',
};
const STATUS_COLORS: Record<GoalStatus, string> = {
  todo: 'bg-gray-100 text-gray-500 border-gray-200',
  learning: 'bg-brand-50 text-brand-600 border-brand-200',
  done: 'bg-green-50 text-green-600 border-green-200',
};
const STATUS_DOT: Record<GoalStatus, string> = {
  todo: 'bg-gray-300',
  learning: 'bg-brand-500',
  done: 'bg-green-500',
};

const PRIORITY_LABEL: Record<GoalPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};
const PRIORITY_COLORS: Record<GoalPriority, string> = {
  high: 'text-red-500 bg-red-50 border-red-200',
  medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  low: 'text-gray-400 bg-gray-50 border-gray-200',
};

const PRESET_CATEGORIES = ['スキル系', '習慣系', '知識系', 'ビジネス系', '健康系', 'その他'];

// ── メインページ ──────────────────────────────────────────────────────

export default function GoalsPage() {
  const { user } = useAuthStore();
  const { goals, loading, add, update, remove } = useGoalStore();
  const [addOpen, setAddOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<GoalStatus | 'all'>('all');

  const uid = user?.uid ?? '';

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return goals;
    return goals.filter((g) => g.status === filterStatus);
  }, [goals, filterStatus]);

  const grouped = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      items: filtered.filter((g) => g.status === status),
    })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const counts: Record<GoalStatus, number> = useMemo(() => ({
    todo: goals.filter((g) => g.status === 'todo').length,
    learning: goals.filter((g) => g.status === 'learning').length,
    done: goals.filter((g) => g.status === 'done').length,
  }), [goals]);

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
              <h1 className="text-xl font-bold text-gray-900">身につけたいことリスト</h1>
              <p className="text-xs text-gray-400">
                {counts.learning}件学習中 / {counts.todo}件未着手 / {counts.done}件習得済み
              </p>
            </div>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <span>＋</span> 追加
          </button>
        </div>

        {/* フィルタータブ */}
        <div className="mt-4 flex items-center gap-1.5">
          {(['all', ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filterStatus === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? `全て (${goals.length})` : `${STATUS_LABEL[s]} (${counts[s]})`}
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="mx-auto max-w-3xl px-6 py-6 space-y-8">
        {goals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <span className="text-5xl">🎯</span>
            <p className="text-gray-500 font-medium">まだ目標がありません</p>
            <p className="text-sm text-gray-400">「＋ 追加」から身につけたいことを登録しましょう</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-gray-400">該当するアイテムはありません</p>
          </div>
        ) : (
          grouped.map(({ status, items }) => (
            <section key={status}>
              {/* セクションヘッダー */}
              <div className="mb-3 flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} />
                <span className="text-sm font-semibold text-gray-700">{STATUS_LABEL[status]}</span>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-500">{items.length}</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* カードリスト */}
              <div className="space-y-2">
                {items.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} uid={uid} onUpdate={update} onRemove={remove} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* 追加モーダル */}
      {addOpen && <AddModal uid={uid} onAdd={add} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

// ── ゴールカード ──────────────────────────────────────────────────────

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

  const cycleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onUpdate(uid, goal.id, { status: STATUS_NEXT[goal.status] });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`「${goal.title}」を削除しますか？`)) return;
    await onRemove(uid, goal.id);
  };

  const isDone = goal.status === 'done';

  return (
    <div
      className={`rounded-xl border bg-white transition-all cursor-pointer ${
        expanded ? 'border-brand-200 shadow-md' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
      } ${isDone ? 'opacity-60' : ''}`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* ステータスドット */}
        <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[goal.status]}`} />

        {/* 本体 */}
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-gray-900 leading-snug ${isDone ? 'line-through text-gray-400' : ''}`}>
            {goal.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* カテゴリ */}
            {goal.category && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                {goal.category}
              </span>
            )}
            {/* 優先度 */}
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[goal.priority]}`}>
              {PRIORITY_LABEL[goal.priority]}優先
            </span>
          </div>
          {/* メモプレビュー（折りたたみ時） */}
          {!expanded && goal.memo && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-400">{goal.memo}</p>
          )}
        </div>

        {/* 右側アクション */}
        <div className="flex shrink-0 items-center gap-1">
          {/* ステータス切替ボタン */}
          <button
            onClick={cycleStatus}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 ${STATUS_COLORS[goal.status]}`}
            title="ステータスを変更"
          >
            {STATUS_LABEL[goal.status]} →
          </button>
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
        <div
          className="border-t border-gray-100 px-4 pb-4 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{goal.memo}</p>
        </div>
      )}

      {/* 編集モーダル */}
      {editing && (
        <EditModal
          goal={goal}
          uid={uid}
          onSave={onUpdate}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ── 追加モーダル ──────────────────────────────────────────────────────

function AddModal({
  uid, onAdd, onClose,
}: {
  uid: string;
  onAdd: (uid: string, params: Pick<Goal, 'title' | 'category' | 'priority' | 'memo'>) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<GoalPriority>('medium');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onAdd(uid, { title: title.trim(), category: category.trim(), priority, memo: memo.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-lg font-bold text-gray-900">🎯 身につけたいことを追加</h2>

        <div className="space-y-4">
          {/* タイトル */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">タイトル *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              placeholder="例：TypeScriptの型システムをマスターする"
            />
          </div>

          {/* カテゴリ */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">カテゴリ</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? '' : cat)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    category === cat
                      ? 'border-brand-400 bg-brand-50 text-brand-600'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              placeholder="または自由入力"
            />
          </div>

          {/* 優先度 */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">優先度</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as GoalPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                    priority === p ? PRIORITY_COLORS[p] : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {PRIORITY_LABEL[p]}優先
                </button>
              ))}
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 resize-none"
              placeholder="目標の背景・理由・参考リソースなど"
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
  const [category, setCategory] = useState(goal.category);
  const [priority, setPriority] = useState<GoalPriority>(goal.priority);
  const [memo, setMemo] = useState(goal.memo);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(uid, goal.id, {
      title: title.trim(),
      category: category.trim(),
      priority,
      memo: memo.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-lg font-bold text-gray-900">✎ 目標を編集</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">タイトル *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">カテゴリ</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? '' : cat)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    category === cat
                      ? 'border-brand-400 bg-brand-50 text-brand-600'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">優先度</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as GoalPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                    priority === p ? PRIORITY_COLORS[p] : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {PRIORITY_LABEL[p]}優先
                </button>
              ))}
            </div>
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
