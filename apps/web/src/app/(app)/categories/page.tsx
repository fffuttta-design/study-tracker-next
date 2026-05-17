'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { type LearningCategory, categoryLevel, colorValueToHex } from '@study-tracker/core';

const PRESET_COLORS = [
  0xFF6366F1, 0xFF8B5CF6, 0xFFEC4899, 0xFFEF4444,
  0xFFF97316, 0xFFEAB308, 0xFF22C55E, 0xFF14B8A6,
  0xFF3B82F6, 0xFF6B7280,
];

export default function CategoriesPage() {
  const { user } = useAuthStore();
  const { categories, loading, add, update, remove } = useCategoryStore();
  const [addingParent, setAddingParent] = useState<string | null | undefined>(undefined);

  const roots = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (loading) {
    return <div className="flex justify-center pt-20"><Spinner /></div>;
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">カテゴリ管理</h1>
        <button
          onClick={() => setAddingParent(null)}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          + 大カテゴリ追加
        </button>
      </div>

      {addingParent === null && (
        <AddForm
          parentId={undefined}
          categories={categories}
          uid={user?.uid ?? ''}
          onAdd={add}
          onClose={() => setAddingParent(undefined)}
        />
      )}

      <div className="space-y-2">
        {roots.map((root) => (
          <CategoryNode
            key={root.id}
            cat={root}
            categories={categories}
            uid={user?.uid ?? ''}
            depth={0}
            onUpdate={update}
            onRemove={remove}
            onAdd={add}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryNode({
  cat, categories, uid, depth, onUpdate, onRemove, onAdd,
}: {
  cat: LearningCategory;
  categories: LearningCategory[];
  uid: string;
  depth: number;
  onUpdate: (uid: string, id: string, data: Partial<LearningCategory>) => Promise<void>;
  onRemove: (uid: string, id: string) => Promise<void>;
  onAdd: (uid: string, data: Omit<LearningCategory, 'id'>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [name, setName] = useState(cat.name);
  const children = categories
    .filter((c) => c.parentId === cat.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const level = categoryLevel(cat, categories);

  const saveEdit = async () => {
    if (name.trim()) await onUpdate(uid, cat.id, { name: name.trim() });
    setEditing(false);
  };

  return (
    <div className={depth > 0 ? 'ml-5 border-l border-gray-100 pl-3' : ''}>
      <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 hover:border-gray-200">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: colorValueToHex(cat.colorValue) }}
        />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="flex-1 border-b border-brand-400 text-sm outline-none"
          />
        ) : (
          <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
        )}
        <div className="flex items-center gap-1">
          {level < 2 && (
            <button onClick={() => setAddingChild(true)} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="子カテゴリ追加">+</button>
          )}
          <button onClick={() => setEditing(true)} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600">編集</button>
          <button onClick={() => onRemove(uid, cat.id)} className="rounded px-1.5 py-0.5 text-xs text-red-300 hover:bg-red-50 hover:text-red-500">削除</button>
        </div>
      </div>

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

      {children.map((child) => (
        <CategoryNode
          key={child.id}
          cat={child}
          categories={categories}
          uid={uid}
          depth={depth + 1}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}

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
    await onAdd(uid, {
      name: name.trim(),
      colorValue,
      parentId,
      sortOrder: siblings.length,
    });
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
            className={`h-5 w-5 rounded-full transition ${colorValue === c ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`}
            style={{ backgroundColor: colorValueToHex(c) }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">キャンセル</button>
        <button onClick={submit} className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600">追加</button>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
