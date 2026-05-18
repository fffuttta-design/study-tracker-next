'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  type NotionPage,
  type DbProperty,
  type DbPropertyType,
  type DbRow,
  type DbSelectOption,
  parseDbSchema,
} from '@study-tracker/core';
import { useDbRowStore } from '@/stores/notionDatabaseRowStore';

// ─── 定数 ────────────────────────────────────────────────────────────────────

const SELECT_COLORS: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  red: 'bg-red-100 text-red-600 border-red-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  green: 'bg-green-100 text-green-600 border-green-200',
  blue: 'bg-blue-100 text-blue-600 border-blue-200',
  purple: 'bg-purple-100 text-purple-600 border-purple-200',
  pink: 'bg-pink-100 text-pink-600 border-pink-200',
};

const TYPE_ICONS: Record<DbPropertyType, string> = {
  title: '🔤',
  text: '📝',
  number: '#',
  select: '◯',
  checkbox: '☑',
};

const COLOR_NAMES = Object.keys(SELECT_COLORS);

interface DatabaseViewProps {
  page: NotionPage;
  uid: string;
  onSaveSchema: (content: string) => Promise<void>;
}

// ─── セル編集コンポーネント ──────────────────────────────────────────────────

function TextCell({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="w-full bg-transparent outline-none text-sm px-1"
      />
    );
  }

  return (
    <div
      onClick={() => { setDraft(value); setEditing(true); }}
      className="w-full min-h-[22px] cursor-text text-sm px-1 truncate text-gray-800"
    >
      {value || <span className="text-gray-300 select-none">{placeholder ?? ''}</span>}
    </div>
  );
}

function NumberCell({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = draft === '' ? null : Number(draft);
    const newVal = draft === '' ? null : isNaN(n as number) ? null : (n as number);
    if (newVal !== value) onSave(newVal);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value != null ? String(value) : ''); setEditing(false); }
        }}
        className="w-full bg-transparent outline-none text-sm px-1"
      />
    );
  }

  return (
    <div
      onClick={() => { setDraft(value != null ? String(value) : ''); setEditing(true); }}
      className="w-full min-h-[22px] cursor-text text-sm px-1 text-gray-800"
    >
      {value != null ? value : ''}
    </div>
  );
}

function SelectCell({
  value,
  options,
  onSave,
}: {
  value: string;
  options: DbSelectOption[];
  onSave: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <div
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[22px] cursor-pointer flex items-center px-1"
      >
        {selected ? (
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${SELECT_COLORS[selected.color] ?? SELECT_COLORS.gray}`}>
            {selected.name}
          </span>
        ) : (
          <span className="text-gray-300 text-sm select-none"></span>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-0.5 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {value && (
            <button
              onClick={() => { onSave(''); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            >
              ✕ クリア
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { onSave(opt.id); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 ${opt.id === value ? 'bg-brand-50' : ''}`}
            >
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${SELECT_COLORS[opt.color] ?? SELECT_COLORS.gray}`}>
                {opt.name}
              </span>
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-400">オプションなし（列ヘッダーで追加）</p>
          )}
        </div>
      )}
    </div>
  );
}

function CheckboxCell({ value, onSave }: { value: boolean; onSave: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-center w-full min-h-[22px]">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onSave(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-brand-500 cursor-pointer"
      />
    </div>
  );
}

// ─── プロパティヘッダー ──────────────────────────────────────────────────────

function PropertyHeader({
  prop,
  onRename,
  onDelete,
  onUpdateOptions,
}: {
  prop: DbProperty;
  onRename: (name: string) => void;
  onDelete: () => void;
  onUpdateOptions: (opts: DbSelectOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(prop.name);
  const [newOptName, setNewOptName] = useState('');
  const [newOptColor, setNewOptColor] = useState('gray');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (nameDraft !== prop.name) onRename(nameDraft);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, nameDraft, prop.name, onRename]);

  const addOption = () => {
    if (!newOptName.trim()) return;
    const opts = [...(prop.options ?? []), { id: uuidv4(), name: newOptName.trim(), color: newOptColor }];
    onUpdateOptions(opts);
    setNewOptName('');
    setNewOptColor('gray');
  };

  const removeOption = (id: string) => {
    onUpdateOptions((prop.options ?? []).filter((o) => o.id !== id));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setNameDraft(prop.name); setOpen((v) => !v); }}
        className="flex items-center gap-1 w-full px-2 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 whitespace-nowrap"
      >
        <span className="text-[11px]">{TYPE_ICONS[prop.type]}</span>
        <span className="truncate">{prop.name}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 w-60 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">列名</p>
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { onRename(nameDraft); setOpen(false); }
              if (e.key === 'Escape') setOpen(false);
            }}
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-brand-400"
          />
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            タイプ: {TYPE_ICONS[prop.type]} {prop.type}
          </p>

          {prop.type === 'select' && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">オプション</p>
              <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
                {(prop.options ?? []).map((opt) => (
                  <div key={opt.id} className="flex items-center gap-1">
                    <span className={`flex-1 inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium truncate ${SELECT_COLORS[opt.color] ?? SELECT_COLORS.gray}`}>
                      {opt.name}
                    </span>
                    <button onClick={() => removeOption(opt.id)} className="shrink-0 text-gray-300 hover:text-red-400 text-xs">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1">
                <input
                  value={newOptName}
                  onChange={(e) => setNewOptName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addOption(); }}
                  placeholder="新しいオプション"
                  className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
                />
                <button
                  onClick={addOption}
                  className="shrink-0 rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600"
                >
                  追加
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {COLOR_NAMES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewOptColor(c)}
                    title={c}
                    className={`h-4 w-4 rounded-full border-2 transition ${newOptColor === c ? 'border-gray-800 scale-110' : 'border-transparent'} ${SELECT_COLORS[c]?.split(' ')[0]}`}
                  />
                ))}
              </div>
            </div>
          )}

          {prop.type !== 'title' && (
            <div className="mt-3 border-t border-gray-100 pt-2">
              <button
                onClick={() => { onDelete(); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
              >
                <span>🗑️</span>
                <span>この列を削除</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function DatabaseView({ page, uid, onSaveSchema }: DatabaseViewProps) {
  const [schema, setSchema] = useState(() => parseDbSchema(page.content));
  const { rows, subscribeRows, addRow, updateRow, removeRow } = useDbRowStore();
  const [addingProp, setAddingProp] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<DbPropertyType>('text');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const addPropRef = useRef<HTMLTableHeaderCellElement>(null);

  // ページが変わったらスキーマを再パース
  useEffect(() => {
    setSchema(parseDbSchema(page.content));
  }, [page.id, page.content]);

  // 行サブスクリプション
  useEffect(() => {
    const unsub = subscribeRows(uid, page.id);
    return unsub;
  }, [uid, page.id, subscribeRows]);

  // プロパティ追加フォームの外クリック閉じ
  useEffect(() => {
    if (!addingProp) return;
    const handler = (e: MouseEvent) => {
      if (addPropRef.current && !addPropRef.current.contains(e.target as Node)) {
        setAddingProp(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addingProp]);

  // スキーマ保存
  const saveSchema = async (newSchema: typeof schema) => {
    setSchema(newSchema);
    await onSaveSchema(JSON.stringify(newSchema));
  };

  const handleRenameProp = (propId: string, name: string) => {
    saveSchema({ properties: schema.properties.map((p) => p.id === propId ? { ...p, name } : p) });
  };

  const handleDeleteProp = (propId: string) => {
    saveSchema({ properties: schema.properties.filter((p) => p.id !== propId) });
  };

  const handleUpdateOptions = (propId: string, opts: DbSelectOption[]) => {
    saveSchema({ properties: schema.properties.map((p) => p.id === propId ? { ...p, options: opts } : p) });
  };

  const handleAddProp = () => {
    if (!newPropName.trim()) return;
    const newProp: DbProperty = {
      id: uuidv4(),
      name: newPropName.trim(),
      type: newPropType,
      options: newPropType === 'select' ? [] : undefined,
    };
    saveSchema({ properties: [...schema.properties, newProp] });
    setNewPropName('');
    setNewPropType('text');
    setAddingProp(false);
  };

  const handleCellSave = async (row: DbRow, propId: string, val: string | number | boolean | null) => {
    const newCells = { ...row.cells, [propId]: val };
    await updateRow(uid, row.id, newCells);
  };

  const handleAddRow = async () => {
    await addRow(uid, page.id);
  };

  const getCellValue = (row: DbRow, propId: string) => row.cells[propId] ?? null;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* テーブルエリア */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <table className="border-collapse text-sm w-full min-w-max">
          {/* ヘッダー */}
          <thead>
            <tr className="border-b border-gray-200">
              {schema.properties.map((prop) => (
                <th
                  key={prop.id}
                  className="relative border-r border-gray-100 bg-gray-50 text-left font-normal min-w-[140px] max-w-[280px]"
                  style={{ width: prop.type === 'checkbox' ? 80 : prop.type === 'number' ? 100 : 180 }}
                >
                  <PropertyHeader
                    prop={prop}
                    onRename={(name) => handleRenameProp(prop.id, name)}
                    onDelete={() => handleDeleteProp(prop.id)}
                    onUpdateOptions={(opts) => handleUpdateOptions(prop.id, opts)}
                  />
                </th>
              ))}
              {/* + 列追加ボタン */}
              <th className="relative bg-gray-50 px-2 py-1 w-10" ref={addPropRef}>
                <button
                  onClick={() => setAddingProp((v) => !v)}
                  className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:bg-gray-200 hover:text-brand-500 text-base font-semibold"
                  title="列を追加"
                >
                  +
                </button>
                {addingProp && (
                  <div className="absolute right-0 top-full z-40 w-52 rounded-xl border border-gray-200 bg-white p-3 shadow-xl mt-0.5">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">列名</p>
                    <input
                      autoFocus
                      value={newPropName}
                      onChange={(e) => setNewPropName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddProp(); if (e.key === 'Escape') setAddingProp(false); }}
                      placeholder="列名"
                      className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-brand-400 mb-2"
                    />
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">タイプ</p>
                    <div className="space-y-0.5 mb-2">
                      {(Object.keys(TYPE_ICONS) as DbPropertyType[]).filter((t) => t !== 'title').map((t) => (
                        <button
                          key={t}
                          onClick={() => setNewPropType(t)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-xs transition ${newPropType === t ? 'bg-brand-50 text-brand-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                          <span>{TYPE_ICONS[t]}</span>
                          <span>{t}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleAddProp}
                      disabled={!newPropName.trim()}
                      className="w-full rounded bg-brand-500 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-40"
                    >
                      追加
                    </button>
                  </div>
                )}
              </th>
              {/* 削除列ヘッダー（空） */}
              <th className="bg-gray-50 w-8" />
            </tr>
          </thead>

          {/* ボディ */}
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-gray-100 hover:bg-gray-50 group"
                onMouseEnter={() => setHoveredRow(row.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {schema.properties.map((prop) => {
                  const raw = getCellValue(row, prop.id);
                  return (
                    <td key={prop.id} className="border-r border-gray-100 px-1 py-1 align-middle">
                      {(prop.type === 'title' || prop.type === 'text') && (
                        <TextCell
                          value={typeof raw === 'string' ? raw : ''}
                          onSave={(v) => handleCellSave(row, prop.id, v)}
                          placeholder={prop.type === 'title' ? 'Untitled' : ''}
                        />
                      )}
                      {prop.type === 'number' && (
                        <NumberCell
                          value={typeof raw === 'number' ? raw : null}
                          onSave={(v) => handleCellSave(row, prop.id, v)}
                        />
                      )}
                      {prop.type === 'select' && (
                        <SelectCell
                          value={typeof raw === 'string' ? raw : ''}
                          options={prop.options ?? []}
                          onSave={(v) => handleCellSave(row, prop.id, v)}
                        />
                      )}
                      {prop.type === 'checkbox' && (
                        <CheckboxCell
                          value={typeof raw === 'boolean' ? raw : false}
                          onSave={(v) => handleCellSave(row, prop.id, v)}
                        />
                      )}
                    </td>
                  );
                })}
                {/* + 列分の空セル */}
                <td className="border-r border-gray-100" />
                {/* 削除ボタン */}
                <td className="px-1 py-1 text-center align-middle w-8">
                  <button
                    onClick={() => removeRow(uid, row.id)}
                    className={`text-gray-300 hover:text-red-400 text-sm transition ${hoveredRow === row.id ? 'opacity-100' : 'opacity-0'}`}
                    title="行を削除"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* フッター: 行追加 */}
        <button
          onClick={handleAddRow}
          className="mt-1 flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
        >
          <span className="text-base leading-none font-semibold">+</span>
          <span>新規</span>
        </button>
      </div>
    </div>
  );
}
