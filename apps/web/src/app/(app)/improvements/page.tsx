'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useImprovementTaskStore, type ImprovementTask } from '@/stores/improvementTaskStore';

export default function ImprovementsPage() {
  const { user } = useAuthStore();
  const { tasks, add, update, remove, reorder } = useImprovementTaskStore();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropZone, setDropZone] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  if (!user) return null;
  const uid = user.uid;

  // ── 追加 ─────────────────────────
  const handleAdd = async () => {
    if (!newName.trim()) return;
    await add(uid, newName.trim(), newDetail.trim());
    setNewName('');
    setNewDetail('');
    setAddOpen(false);
  };

  // ── 編集開始 ──────────────────────
  const startEdit = (task: ImprovementTask) => {
    setEditingId(task.id);
    setEditName(task.name);
    setEditDetail(task.detail);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    await update(uid, id, { name: editName.trim(), detail: editDetail.trim() });
    setEditingId(null);
  };

  // ── ドラッグ並び替え ───────────────
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, zone: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropZone(zone);
  };

  const handleDrop = async (e: React.DragEvent, zone: number) => {
    e.preventDefault();
    if (dragIndex === null) return;
    const toIndex = dragIndex < zone ? zone - 1 : zone;
    if (toIndex !== dragIndex) await reorder(uid, dragIndex, toIndex);
    setDragIndex(null);
    setDropZone(null);
  };

  const handleDragEnd = () => { setDragIndex(null); setDropZone(null); };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔧 要改修リスト</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            未完了 {activeTasks.length} 件 {completedTasks.length > 0 && `/ 完了済み ${completedTasks.length} 件`}
          </p>
        </div>
        <button
          onClick={() => { setAddOpen(true); setTimeout(() => nameInputRef.current?.focus(), 50); }}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 active:scale-95 transition-transform"
        >
          + 追加
        </button>
      </div>

      {/* 追加フォーム */}
      {addOpen && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold text-brand-600">新しい改修項目</p>
          <input
            ref={nameInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAdd(); if (e.key === 'Escape') setAddOpen(false); }}
            placeholder="改修名"
            className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <textarea
            value={newDetail}
            onChange={(e) => setNewDetail(e.target.value)}
            placeholder="詳細（任意）"
            rows={3}
            className="mb-3 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setAddOpen(false); setNewName(''); setNewDetail(''); }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-brand-600"
            >
              追加
            </button>
          </div>
        </div>
      )}

      {/* アクティブリスト */}
      {activeTasks.length === 0 && !addOpen ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-gray-400">
          <span className="text-4xl">🎉</span>
          <p className="mt-3 text-sm">改修項目はありません</p>
          <button
            onClick={() => { setAddOpen(true); setTimeout(() => nameInputRef.current?.focus(), 50); }}
            className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            + 追加する
          </button>
        </div>
      ) : (
        <div className="space-y-0">
          {/* ドロップゾーン: 先頭 */}
          <DropBar active={dropZone === 0 && dragIndex !== null}
            onDragOver={(e) => handleDragOver(e, 0)}
            onDrop={(e) => handleDrop(e, 0)}
            onDragLeave={() => setDropZone(null)} />

          {activeTasks.map((task, i) => (
            <div key={task.id}>
              {editingId === task.id ? (
                /* 編集モード */
                <div className="mb-1 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) saveEdit(task.id); if (e.key === 'Escape') setEditingId(null); }}
                    className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  <textarea
                    value={editDetail}
                    onChange={(e) => setEditDetail(e.target.value)}
                    rows={3}
                    className="mb-3 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">キャンセル</button>
                    <button onClick={() => saveEdit(task.id)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">保存</button>
                  </div>
                </div>
              ) : (
                /* 通常表示 */
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`group flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm transition-opacity hover:border-gray-200 hover:shadow-md ${dragIndex === i ? 'opacity-40' : ''}`}
                >
                  {/* ドラッグハンドル */}
                  <span className="mt-1 cursor-grab select-none text-gray-300 opacity-0 transition-opacity group-hover:opacity-100">⠿⠿</span>

                  {/* No. */}
                  <span className="mt-1 shrink-0 w-7 text-right text-xs font-mono font-semibold text-gray-400">
                    {String(i + 1).padStart(2, '0')}.
                  </span>

                  {/* 内容 */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800">{task.name}</p>
                    {task.detail && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-500">{task.detail}</p>
                    )}
                  </div>

                  {/* アクション */}
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => startEdit(task)}
                      title="編集"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => remove(uid, task.id)}
                      title="削除"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* 完了ボタン */}
                  <button
                    onClick={() => update(uid, task.id, { completed: true })}
                    title="完了にする"
                    className="shrink-0 rounded-full border-2 border-gray-200 p-1 text-gray-300 transition-colors hover:border-green-400 hover:bg-green-50 hover:text-green-500"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2.5,8 6.5,12 13.5,4" />
                    </svg>
                  </button>
                </div>
              )}

              {/* ドロップゾーン */}
              <DropBar active={dropZone === i + 1 && dragIndex !== null}
                onDragOver={(e) => handleDragOver(e, i + 1)}
                onDrop={(e) => handleDrop(e, i + 1)}
                onDragLeave={() => setDropZone(null)} />
            </div>
          ))}
        </div>
      )}

      {/* 完了済みセクション */}
      {completedTasks.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-600"
          >
            <span>{showCompleted ? '▼' : '▶'}</span>
            <span>完了済み（{completedTasks.length}件）</span>
          </button>

          {showCompleted && (
            <div className="mt-3 space-y-2">
              {completedTasks.map((task, i) => (
                <div key={task.id} className="group flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <span className="mt-1 shrink-0 w-7 text-right text-xs font-mono text-gray-300">
                    {String(i + 1).padStart(2, '0')}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-400 line-through">{task.name}</p>
                    {task.detail && (
                      <p className="mt-0.5 text-sm text-gray-400 line-through">{task.detail}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => update(uid, task.id, { completed: false })}
                      title="未完了に戻す"
                      className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white hover:text-gray-600"
                    >
                      ↩ 戻す
                    </button>
                    <button
                      onClick={() => remove(uid, task.id)}
                      title="削除"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      🗑️
                    </button>
                  </div>
                  {/* 完了チェック（緑） */}
                  <div className="shrink-0 rounded-full border-2 border-green-400 bg-green-50 p-1 text-green-500">
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2.5,8 6.5,12 13.5,4" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DropBar({
  active, onDragOver, onDrop, onDragLeave,
}: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragLeave: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      className={`mx-2 my-0.5 rounded transition-all duration-100 ${active ? 'h-1 bg-brand-400' : 'h-1 bg-transparent'}`}
    />
  );
}
