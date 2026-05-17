'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useLearningStore } from '@/stores/learningStore';
import { type LearningCategory, categoryLevel, categoryAndDescendants, colorValueToHex } from '@study-tracker/core';

const PRESET_COLORS: number[] = [
  0xFF6366F1, 0xFF8B5CF6, 0xFFEC4899, 0xFFEF4444,
  0xFFF97316, 0xFFEAB308, 0xFF22C55E, 0xFF14B8A6,
  0xFF3B82F6, 0xFF6B7280, 0xFF059669, 0xFFF43F5E,
];

const LEVEL_LABEL = ['大', '中', '小'];
const LEVEL_INDENT = [0, 20, 40];

export default function CategoriesPage() {
  const { user } = useAuthStore();
  const { categories, loading, add, update, remove } = useCategoryStore();
  const { items } = useLearningStore();
  const [addingParentId, setAddingParentId] = useState<string | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<LearningCategory | null>(null);

  const uid = user?.uid ?? '';

  const roots = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // カテゴリIDを使っているアイテム数
  const usageCount = (catId: string) => {
    const ids = categoryAndDescendants(catId, categories);
    return items.filter((i) => i.categoryId != null && ids.has(i.categoryId)).length;
  };

  // 削除実行（子孫も含む）
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const ids = categoryAndDescendants(deleteTarget.id, categories);
    await Promise.all([...ids].map((id) => remove(uid, id)));
    setDeleteTarget(null);
  };

  if (loading) {
    return <div className="flex justify-center pt-20"><Spinner /></div>;
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">カテゴリ管理</h1>
          <p className="mt-0.5 text-xs text-gray-400">大カテゴリ → 中カテゴリ → 小カテゴリの3階層</p>
        </div>
        <button
          onClick={() => setAddingParentId(null)}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          + 大カテゴリ追加
        </button>
      </div>

      {/* 大カテゴリ追加フォーム */}
      {addingParentId === null && (
        <AddForm
          parentId={undefined}
          categories={categories}
          uid={uid}
          onAdd={add}
          onClose={() => setAddingParentId(undefined)}
        />
      )}

      {/* カテゴリツリー */}
      <div className="space-y-1">
        {roots.map((root) => (
          <CategoryTree
            key={root.id}
            cat={root}
            categories={categories}
            uid={uid}
            depth={0}
            onUpdate={update}
            onDeleteRequest={setDeleteTarget}
            onAdd={add}
            usageCount={usageCount}
          />
        ))}
      </div>

      {roots.length === 0 && addingParentId === undefined && (
        <div className="py-16 text-center text-sm text-gray-300">
          カテゴリがまだありません
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {deleteTarget && (
        <DeleteDialog
          cat={deleteTarget}
          categories={categories}
          usageCount={usageCount(deleteTarget.id)}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── カテゴリツリーノード ──────────────────────────────────────────────

function CategoryTree({ cat, categories, uid, depth, onUpdate, onDeleteRequest, onAdd, usageCount }: {
  cat: LearningCategory;
  categories: LearningCategory[];
  uid: string;
  depth: number;
  onUpdate: (uid: string, id: string, data: Partial<LearningCategory>) => Promise<void>;
  onDeleteRequest: (cat: LearningCategory) => void;
  onAdd: (uid: string, data: Omit<LearningCategory, 'id'>) => Promise<void>;
  usageCount: (id: string) => number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [addingChild, setAddingChild] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const level = categoryLevel(cat, categories);
  const children = categories
    .filter((c) => c.parentId === cat.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const count = usageCount(cat.id);

  const saveEdit = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== cat.name) {
      await onUpdate(uid, cat.id, { name: trimmed });
    } else {
      setName(cat.name);
    }
    setEditing(false);
  };

  return (
    <div style={{ marginLeft: LEVEL_INDENT[depth] }}>
      {/* カテゴリ行 */}
      <div className="group flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 hover:border-gray-200">
        {/* 展開/折りたたみ（子ありのみ） */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={`shrink-0 text-gray-300 transition ${children.length === 0 ? 'invisible' : ''}`}
        >
          {collapsed ? '▶' : '▼'}
        </button>

        {/* カラードット */}
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: colorValueToHex(cat.colorValue) }}
        />

        {/* レベルバッジ */}
        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">
          {LEVEL_LABEL[level]}
        </span>

        {/* 名前（インライン編集） */}
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') { setName(cat.name); setEditing(false); }
            }}
            className="flex-1 border-b border-brand-400 text-sm outline-none"
          />
        ) : (
          <span
            className="flex-1 cursor-pointer text-sm text-gray-800 hover:text-brand-600"
            onDoubleClick={() => setEditing(true)}
            title="ダブルクリックで編集"
          >
            {cat.name}
          </span>
        )}

        {/* アイテム数バッジ */}
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">
            {count}件
          </span>
        )}

        {/* アクション（hover時表示） */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {level < 2 && (
            <button
              onClick={() => setAddingChild(true)}
              className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-brand-50 hover:text-brand-600"
              title="子カテゴリ追加"
            >
              + 追加
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            編集
          </button>
          <button
            onClick={() => onDeleteRequest(cat)}
            className="rounded px-1.5 py-0.5 text-xs text-red-300 hover:bg-red-50 hover:text-red-500"
          >
            削除
          </button>
        </div>
      </div>

      {/* 子カテゴリ追加フォーム */}
      {addingChild && (
        <div className="ml-5 mt-1">
          <AddForm
            parentId={cat.id}
            categories={categories}
            uid={uid}
            onAdd={onAdd}
            onClose={() => setAddingChild(false)}
          />
        </div>
      )}

      {/* 子カテゴリ再帰表示 */}
      {!collapsed && children.map((child) => (
        <CategoryTree
          key={child.id}
          cat={child}
          categories={categories}
          uid={uid}
          depth={depth + 1}
          onUpdate={onUpdate}
          onDeleteRequest={onDeleteRequest}
          onAdd={onAdd}
          usageCount={usageCount}
        />
      ))}
    </div>
  );
}

// ── 追加フォーム ─────────────────────────────────────────────────────

function AddForm({ parentId, categories, uid, onAdd, onClose }: {
  parentId: string | undefined;
  categories: LearningCategory[];
  uid: string;
  onAdd: (uid: string, data: Omit<LearningCategory, 'id'>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [colorValue, setColorValue] = useState(PRESET_COLORS[0]);

  const submit = async () => {
    if (!name.trim()) return;
    const siblings = categories.filter((c) => c.parentId === parentId);
    await onAdd(uid, { name: name.trim(), colorValue, parentId, sortOrder: siblings.length });
    onClose();
  };

  return (
    <div className="mb-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
        placeholder="カテゴリ名"
        className="mb-2 w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColorValue(c)}
            className={`h-5 w-5 rounded-full transition ${colorValue === c ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:scale-110'}`}
            style={{ backgroundColor: colorValueToHex(c) }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">キャンセル</button>
        <button
          onClick={submit}
          className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
        >
          追加
        </button>
      </div>
    </div>
  );
}

// ── 削除確認ダイアログ ───────────────────────────────────────────────

function DeleteDialog({ cat, categories, usageCount, onConfirm, onCancel }: {
  cat: LearningCategory;
  categories: LearningCategory[];
  usageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const descendants = [...categoryAndDescendants(cat.id, categories)].length - 1; // 自身を除く

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-base font-semibold text-gray-800">「{cat.name}」を削除しますか？</p>

        {descendants > 0 && (
          <p className="mb-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-600">
            ⚠️ 子カテゴリが {descendants} 件あります。すべて一緒に削除されます。
          </p>
        )}
        {usageCount > 0 && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            ⚠️ {usageCount} 件の学習アイテムがこのカテゴリを使用しています。カテゴリが外れますが、アイテムは削除されません。
          </p>
        )}
        {descendants === 0 && usageCount === 0 && (
          <p className="mb-2 text-sm text-gray-500">この操作は取り消せません。</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">
            キャンセル
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
