'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { NotionEditor } from '@/components/editor/NotionEditor';

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
  date: '📅',
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

function DateCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const formatDisplay = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={value}
        onBlur={(e) => { onSave(e.target.value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
          if (e.key === 'Enter') { onSave((e.target as HTMLInputElement).value); setEditing(false); }
        }}
        className="w-full bg-transparent outline-none text-sm px-1"
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="w-full min-h-[22px] cursor-text text-sm px-1 text-gray-800"
    >
      {value ? formatDisplay(value) : <span className="text-gray-300 select-none"></span>}
    </div>
  );
}

// ─── プロパティヘッダー ──────────────────────────────────────────────────────

function PropertyHeader({
  prop,
  sortState,
  onRename,
  onDelete,
  onUpdateOptions,
  onSort,
}: {
  prop: DbProperty;
  sortState: { propId: string; dir: 'asc' | 'desc' } | null;
  onRename: (name: string) => void;
  onDelete: () => void;
  onUpdateOptions: (opts: DbSelectOption[]) => void;
  onSort: (propId: string, dir: 'asc' | 'desc' | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(prop.name);
  const [newOptName, setNewOptName] = useState('');
  const [newOptColor, setNewOptColor] = useState('gray');
  const ref = useRef<HTMLDivElement>(null);
  const isActive = sortState?.propId === prop.id;

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

  const cycleSort = () => {
    if (!isActive) { onSort(prop.id, 'asc'); return; }
    if (sortState?.dir === 'asc') { onSort(prop.id, 'desc'); return; }
    onSort(prop.id, null);
  };

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => { setNameDraft(prop.name); setOpen((v) => !v); }}
        className="flex flex-1 items-center gap-1 px-2 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 whitespace-nowrap overflow-hidden"
      >
        <span className="text-[11px]">{TYPE_ICONS[prop.type]}</span>
        <span className="truncate">{prop.name}</span>
      </button>
      <button
        onClick={cycleSort}
        className={`shrink-0 px-1 py-2 text-[10px] transition ${isActive ? 'text-brand-500' : 'text-gray-300 hover:text-gray-500'}`}
        title="並び替え"
      >
        {isActive && sortState?.dir === 'asc' ? '▲' : isActive && sortState?.dir === 'desc' ? '▼' : '⇅'}
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

// ─── 行フルページモーダル ─────────────────────────────────────────────────────

function RowPageModal({
  row,
  schema,
  databaseTitle,
  onSaveCells,
  onSaveContent,
  onClose,
}: {
  row: DbRow;
  schema: { properties: DbProperty[] };
  databaseTitle: string;
  onSaveCells: (propId: string, val: string | number | boolean | null) => void;
  onSaveContent: (content: string) => Promise<void>;
  onClose: () => void;
}) {
  const dummyRef = useRef<(() => void) | null>(null);
  const titleProp = schema.properties.find((p) => p.type === 'title');
  const titleValue = titleProp
    ? (typeof row.cells[titleProp.id] === 'string' ? (row.cells[titleProp.id] as string) : '')
    : '';

  const handleEditorSave = useCallback(async (title: string, content: string) => {
    if (titleProp) onSaveCells(titleProp.id, title);
    await onSaveContent(content);
  }, [titleProp, onSaveCells, onSaveContent]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
        >
          ← 戻る
        </button>
        <span className="text-xs text-gray-400">{databaseTitle}</span>
      </div>

      {/* プロパティ一覧（title以外） */}
      {schema.properties.filter((p) => p.type !== 'title').length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-gray-100 px-8 py-3">
          {schema.properties.filter((p) => p.type !== 'title').map((prop) => {
            const raw = row.cells[prop.id] ?? null;
            return (
              <div key={prop.id} className="flex items-center gap-2">
                <span className="flex w-20 shrink-0 items-center gap-1 text-xs text-gray-400">
                  <span>{TYPE_ICONS[prop.type]}</span>
                  <span className="truncate">{prop.name}</span>
                </span>
                <div className="flex min-w-[100px] items-center rounded border border-gray-200 px-2 py-1">
                  {prop.type === 'text' && (
                    <TextCell value={typeof raw === 'string' ? raw : ''} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                  {prop.type === 'number' && (
                    <NumberCell value={typeof raw === 'number' ? raw : null} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                  {prop.type === 'select' && (
                    <SelectCell value={typeof raw === 'string' ? raw : ''} options={prop.options ?? []} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                  {prop.type === 'checkbox' && (
                    <CheckboxCell value={typeof raw === 'boolean' ? raw : false} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                  {prop.type === 'date' && (
                    <DateCell value={typeof raw === 'string' ? raw : ''} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ページ本文（NotionEditor） */}
      <div className="flex min-h-0 flex-1 flex-col">
        <NotionEditor
          key={row.id}
          initialTitle={titleValue}
          initialContent={row.pageContent ?? ''}
          onSave={handleEditorSave}
          notionPageId={row.id}
          recordTriggerRef={dummyRef}
          onCreateSubPage={async () => ({ id: '', title: '' })}
        />
      </div>
    </div>
  );
}

// ─── 行詳細サイドパネル ──────────────────────────────────────────────────────

function RowDetailPanel({
  row,
  schema,
  onSave,
  onClose,
}: {
  row: DbRow;
  schema: { properties: DbProperty[] };
  onSave: (propId: string, val: string | number | boolean | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-semibold text-gray-700">行の詳細</p>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-lg leading-none">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {schema.properties.map((prop) => {
          const raw = row.cells[prop.id] ?? null;
          return (
            <div key={prop.id}>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <span>{TYPE_ICONS[prop.type]}</span>
                <span>{prop.name}</span>
              </p>
              <div className="rounded-lg border border-gray-200 px-2 py-1.5 min-h-[36px] flex items-center">
                {(prop.type === 'title' || prop.type === 'text') && (
                  <TextCell
                    value={typeof raw === 'string' ? raw : ''}
                    onSave={(v) => onSave(prop.id, v)}
                    placeholder={prop.type === 'title' ? 'Untitled' : ''}
                  />
                )}
                {prop.type === 'number' && (
                  <NumberCell
                    value={typeof raw === 'number' ? raw : null}
                    onSave={(v) => onSave(prop.id, v)}
                  />
                )}
                {prop.type === 'select' && (
                  <SelectCell
                    value={typeof raw === 'string' ? raw : ''}
                    options={prop.options ?? []}
                    onSave={(v) => onSave(prop.id, v)}
                  />
                )}
                {prop.type === 'checkbox' && (
                  <CheckboxCell
                    value={typeof raw === 'boolean' ? raw : false}
                    onSave={(v) => onSave(prop.id, v)}
                  />
                )}
                {prop.type === 'date' && (
                  <DateCell
                    value={typeof raw === 'string' ? raw : ''}
                    onSave={(v) => onSave(prop.id, v)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── フィルターバー ──────────────────────────────────────────────────────────

function FilterBar({
  schema,
  filter,
  onChange,
  onClear,
}: {
  schema: { properties: DbProperty[] };
  filter: { propId: string; value: string } | null;
  onChange: (f: { propId: string; value: string }) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [propId, setPropId] = useState(schema.properties[0]?.id ?? '');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const apply = () => {
    if (value.trim()) { onChange({ propId, value: value.trim() }); }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition ${filter ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        <span>⊟</span>
        <span>フィルター</span>
        {filter && <span className="ml-0.5 text-[10px]">●</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">列</p>
          <select
            value={propId}
            onChange={(e) => setPropId(e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-brand-400 mb-2"
          >
            {schema.properties.map((p) => (
              <option key={p.id} value={p.id}>{TYPE_ICONS[p.type]} {p.name}</option>
            ))}
          </select>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">値を含む</p>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setOpen(false); }}
            placeholder="フィルター値"
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-brand-400 mb-2"
          />
          <div className="flex gap-2">
            <button onClick={apply} className="flex-1 rounded bg-brand-500 py-1.5 text-xs text-white hover:bg-brand-600">適用</button>
            {filter && (
              <button onClick={() => { onClear(); setValue(''); setOpen(false); }} className="flex-1 rounded border border-gray-200 py-1.5 text-xs text-gray-500 hover:bg-gray-50">クリア</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── デフォルト列幅 ──────────────────────────────────────────────────────────

function defaultWidth(type: DbPropertyType): number {
  if (type === 'checkbox') return 80;
  if (type === 'number') return 100;
  if (type === 'date') return 140;
  return 180;
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function DatabaseView({ page, uid, onSaveSchema }: DatabaseViewProps) {
  const [schema, setSchema] = useState(() => parseDbSchema(page.content));
  const schemaRef = useRef(schema);
  const { rows, subscribeRows, addRow, updateRow, updateRowContent, removeRow } = useDbRowStore();
  const [addingProp, setAddingProp] = useState(false);
  const [modalRowId, setModalRowId] = useState<string | null>(null);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<DbPropertyType>('text');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<{ propId: string; dir: 'asc' | 'desc' } | null>(null);
  const [filterState, setFilterState] = useState<{ propId: string; value: string } | null>(null);
  const addPropRef = useRef<HTMLTableHeaderCellElement>(null);

  useEffect(() => {
    setSchema(parseDbSchema(page.content));
  }, [page.id, page.content]);

  useEffect(() => { schemaRef.current = schema; }, [schema]);

  useEffect(() => {
    const unsub = subscribeRows(uid, page.id);
    return unsub;
  }, [uid, page.id, subscribeRows]);

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

  const resizingRef = useRef<{ propId: string; startX: number; startW: number } | null>(null);

  const handleColResizeStart = (e: React.MouseEvent, propId: string, startW: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { propId, startX: e.clientX, startW };

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newW = Math.max(60, resizingRef.current.startW + (ev.clientX - resizingRef.current.startX));
      setSchema((prev) => ({
        properties: prev.properties.map((p) =>
          p.id === resizingRef.current!.propId ? { ...p, width: Math.round(newW) } : p
        ),
      }));
    };

    const onUp = () => {
      overlay.remove();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (resizingRef.current) {
        onSaveSchema(JSON.stringify(schemaRef.current)).catch(() => {});
      }
      resizingRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
    await updateRow(uid, row.id, { ...row.cells, [propId]: val });
  };

  const handleAddRow = async () => {
    await addRow(uid, page.id);
  };

  const handleSort = (propId: string, dir: 'asc' | 'desc' | null) => {
    setSortState(dir === null ? null : { propId, dir });
  };

  const getCellValue = (row: DbRow, propId: string) => row.cells[propId] ?? null;

  const getCellText = (row: DbRow, propId: string): string => {
    const val = row.cells[propId];
    if (val == null) return '';
    if (typeof val === 'boolean') return val ? '1' : '0';
    return String(val);
  };

  // フィルタリング
  let displayRows = filterState
    ? rows.filter((row) => {
        const text = getCellText(row, filterState.propId).toLowerCase();
        const prop = schema.properties.find((p) => p.id === filterState.propId);
        if (prop?.type === 'select') {
          const opt = prop.options?.find((o) => o.id === row.cells[filterState.propId]);
          return (opt?.name ?? '').toLowerCase().includes(filterState.value.toLowerCase());
        }
        return text.includes(filterState.value.toLowerCase());
      })
    : rows;

  // ソート
  if (sortState) {
    const { propId, dir } = sortState;
    displayRows = [...displayRows].sort((a, b) => {
      const av = getCellText(a, propId);
      const bv = getCellText(b, propId);
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  const selectedRow = selectedRowId ? rows.find((r) => r.id === selectedRowId) ?? null : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* テーブルエリア */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ツールバー */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-2">
          <FilterBar
            schema={schema}
            filter={filterState}
            onChange={setFilterState}
            onClear={() => setFilterState(null)}
          />
          {sortState && (
            <button
              onClick={() => setSortState(null)}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-xs bg-brand-50 text-brand-600 border border-brand-200"
            >
              <span>{sortState.dir === 'asc' ? '▲' : '▼'}</span>
              <span>{schema.properties.find((p) => p.id === sortState.propId)?.name}</span>
              <span className="ml-0.5 text-[10px]">✕</span>
            </button>
          )}
          <span className="ml-auto text-[11px] text-gray-400">{displayRows.length} 件</span>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="border-collapse text-sm w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-200">
                {schema.properties.map((prop) => (
                  <th
                    key={prop.id}
                    className="relative group border-r border-gray-100 bg-gray-50 text-left font-normal min-w-[60px]"
                    style={{ width: prop.width ?? defaultWidth(prop.type) }}
                  >
                    <PropertyHeader
                      prop={prop}
                      sortState={sortState}
                      onRename={(name) => handleRenameProp(prop.id, name)}
                      onDelete={() => handleDeleteProp(prop.id)}
                      onUpdateOptions={(opts) => handleUpdateOptions(prop.id, opts)}
                      onSort={handleSort}
                    />
                    <div
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-brand-400 group-hover:opacity-30"
                      onMouseDown={(e) => handleColResizeStart(e, prop.id, prop.width ?? defaultWidth(prop.type))}
                    />
                  </th>
                ))}
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
                <th className="bg-gray-50 w-8" />
              </tr>
            </thead>

            <tbody>
              {displayRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 group ${selectedRowId === row.id ? 'bg-brand-50' : ''}`}
                  onMouseEnter={() => setHoveredRow(row.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {schema.properties.map((prop, propIdx) => {
                    const raw = getCellValue(row, prop.id);
                    return (
                      <td key={prop.id} className="border-r border-gray-100 px-1 py-1 align-middle">
                        {propIdx === 0 && (
                          <div className="flex items-center">
                            <div className="flex-1 min-w-0">
                              <TextCell
                                value={typeof raw === 'string' ? raw : ''}
                                onSave={(v) => handleCellSave(row, prop.id, v)}
                                placeholder="Untitled"
                              />
                            </div>
                            <button
                              onClick={() => setModalRowId(row.id)}
                              className={`shrink-0 ml-1 rounded px-1 py-0.5 text-[10px] text-gray-300 transition hover:text-brand-400 ${hoveredRow === row.id ? 'opacity-100' : 'opacity-0'}`}
                              title="ページを開く"
                            >
                              ↗
                            </button>
                          </div>
                        )}
                        {propIdx > 0 && (prop.type === 'title' || prop.type === 'text') && (
                          <TextCell
                            value={typeof raw === 'string' ? raw : ''}
                            onSave={(v) => handleCellSave(row, prop.id, v)}
                          />
                        )}
                        {prop.type === 'number' && propIdx > 0 && (
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
                        {prop.type === 'date' && (
                          <DateCell
                            value={typeof raw === 'string' ? raw : ''}
                            onSave={(v) => handleCellSave(row, prop.id, v)}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="border-r border-gray-100" />
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

          <button
            onClick={handleAddRow}
            className="mt-1 flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <span className="text-base leading-none font-semibold">+</span>
            <span>新規</span>
          </button>
        </div>
      </div>

      {/* 行詳細サイドパネル */}
      {selectedRow && (
        <RowDetailPanel
          row={selectedRow}
          schema={schema}
          onSave={(propId, val) => handleCellSave(selectedRow, propId, val)}
          onClose={() => setSelectedRowId(null)}
        />
      )}

      {/* 行フルページモーダル */}
      {modalRowId && (() => {
        const modalRow = rows.find((r) => r.id === modalRowId);
        if (!modalRow) return null;
        return (
          <RowPageModal
            row={modalRow}
            schema={schema}
            databaseTitle={page.title || 'Untitled'}
            onSaveCells={(propId, val) => handleCellSave(modalRow, propId, val)}
            onSaveContent={async (content) => { await updateRowContent(uid, modalRow.id, content); }}
            onClose={() => setModalRowId(null)}
          />
        );
      })()}
    </div>
  );
}
