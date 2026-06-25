'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  type NotionPage,
  type DbProperty,
  type DbPropertyType,
  type DbRow,
  type DbSelectOption,
  type AggregationType,
  parseDbSchema,
} from '@study-tracker/core';
import { useDbRowStore } from '@/stores/notionDatabaseRowStore';
import { NotionEditor } from '@/components/editor/NotionEditor';
import {
  SELECT_COLORS, TYPE_ICONS, COLOR_NAMES,
  TextCell, NumberCell, SelectCell, MultiSelectCell, CheckboxCell, DateCell, UrlCell,
} from './cells';

// ─── フィルター・ソート型 ─────────────────────────────────────────────────────

type FilterOperator =
  | 'contains' | 'not_contains' | 'equals' | 'is_empty' | 'is_not_empty'
  | 'gte' | 'lte' | 'gt' | 'lt'
  | 'date_gte' | 'date_lte' | 'date_eq'
  | 'checked' | 'unchecked';

interface FilterItem {
  id: string;
  propId: string;
  operator: FilterOperator;
  value: string;
}

interface SortItem {
  id: string;
  propId: string;
  dir: 'asc' | 'desc';
}

interface DatabaseViewProps {
  page: NotionPage;
  uid: string;
  onSaveSchema: (content: string) => Promise<void>;
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

          {(prop.type === 'select' || prop.type === 'multiselect') && (
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
                  {prop.type === 'multiselect' && (
                    <MultiSelectCell value={typeof raw === 'string' ? raw : ''} options={prop.options ?? []} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                  {prop.type === 'checkbox' && (
                    <CheckboxCell value={typeof raw === 'boolean' ? raw : false} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                  {prop.type === 'date' && (
                    <DateCell value={typeof raw === 'string' ? raw : ''} onSave={(v) => onSaveCells(prop.id, v)} />
                  )}
                  {prop.type === 'url' && (
                    <UrlCell value={typeof raw === 'string' ? raw : ''} onSave={(v) => onSaveCells(prop.id, v)} />
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
                {prop.type === 'multiselect' && (
                  <MultiSelectCell
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
                {prop.type === 'url' && (
                  <UrlCell
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

// ─── フィルター・ソートパネル ────────────────────────────────────────────────

function getOperatorsForType(type: DbPropertyType): { value: FilterOperator; label: string }[] {
  if (type === 'number') return [
    { value: 'equals', label: '等しい' },
    { value: 'gte', label: '以上' },
    { value: 'lte', label: '以下' },
    { value: 'gt', label: 'より大きい' },
    { value: 'lt', label: 'より小さい' },
    { value: 'is_empty', label: '空' },
    { value: 'is_not_empty', label: '空でない' },
  ];
  if (type === 'date') return [
    { value: 'date_eq', label: '等しい' },
    { value: 'date_gte', label: '以降' },
    { value: 'date_lte', label: '以前' },
    { value: 'is_empty', label: '空' },
    { value: 'is_not_empty', label: '空でない' },
  ];
  if (type === 'checkbox') return [
    { value: 'checked', label: 'チェック済み' },
    { value: 'unchecked', label: '未チェック' },
  ];
  return [
    { value: 'contains', label: '含む' },
    { value: 'not_contains', label: '含まない' },
    { value: 'equals', label: '等しい' },
    { value: 'is_empty', label: '空' },
    { value: 'is_not_empty', label: '空でない' },
  ];
}

function FilterPanel({
  schema,
  filters,
  filterLogic,
  onChangeFilters,
  onChangeLogic,
}: {
  schema: { properties: DbProperty[] };
  filters: FilterItem[];
  filterLogic: 'and' | 'or';
  onChangeFilters: (f: FilterItem[]) => void;
  onChangeLogic: (l: 'and' | 'or') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = filters.length > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addFilter = () => {
    const firstProp = schema.properties[0];
    if (!firstProp) return;
    const ops = getOperatorsForType(firstProp.type);
    onChangeFilters([
      ...filters,
      { id: uuidv4(), propId: firstProp.id, operator: ops[0].value, value: '' },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<FilterItem>) => {
    onChangeFilters(filters.map((f) => {
      if (f.id !== id) return f;
      const updated = { ...f, ...patch };
      // プロパティ変更時はオペレーターをリセット
      if (patch.propId) {
        const prop = schema.properties.find((p) => p.id === patch.propId);
        if (prop) updated.operator = getOperatorsForType(prop.type)[0].value;
        updated.value = '';
      }
      return updated;
    }));
  };

  const removeFilter = (id: string) => {
    onChangeFilters(filters.filter((f) => f.id !== id));
  };

  const needsValueInput = (op: FilterOperator) =>
    !['is_empty', 'is_not_empty', 'checked', 'unchecked'].includes(op);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition ${active ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        <span>⊟</span>
        <span>フィルター</span>
        {active && <span className="ml-0.5 rounded-full bg-brand-500 text-white text-[9px] px-1">{filters.length}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[480px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">フィルター条件</p>
            {filters.length > 1 && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-gray-400">論理:</span>
                <button
                  onClick={() => onChangeLogic('and')}
                  className={`rounded px-2 py-0.5 ${filterLogic === 'and' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >AND</button>
                <button
                  onClick={() => onChangeLogic('or')}
                  className={`rounded px-2 py-0.5 ${filterLogic === 'or' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >OR</button>
              </div>
            )}
          </div>

          {filters.length === 0 && (
            <p className="mb-2 text-xs text-gray-400">フィルターがありません</p>
          )}

          <div className="space-y-2 mb-2">
            {filters.map((f, idx) => {
              const prop = schema.properties.find((p) => p.id === f.propId);
              const ops = prop ? getOperatorsForType(prop.type) : [];
              return (
                <div key={f.id} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5">
                  {idx > 0 && (
                    <span className="shrink-0 text-[10px] font-medium text-gray-400 w-6 text-center">
                      {filterLogic === 'and' ? 'AND' : 'OR'}
                    </span>
                  )}
                  {/* 列選択 */}
                  <select
                    value={f.propId}
                    onChange={(e) => updateFilter(f.id, { propId: e.target.value })}
                    className="rounded border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-brand-400 min-w-[100px]"
                  >
                    {schema.properties.map((p) => (
                      <option key={p.id} value={p.id}>{TYPE_ICONS[p.type]} {p.name}</option>
                    ))}
                  </select>
                  {/* 条件選択 */}
                  <select
                    value={f.operator}
                    onChange={(e) => updateFilter(f.id, { operator: e.target.value as FilterOperator })}
                    className="rounded border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-brand-400 min-w-[90px]"
                  >
                    {ops.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  {/* 値入力 */}
                  {needsValueInput(f.operator) && (
                    <input
                      value={f.value}
                      onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                      placeholder="値"
                      className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-brand-400"
                    />
                  )}
                  <button
                    onClick={() => removeFilter(f.id)}
                    className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400 text-xs"
                  >✕</button>
                </div>
              );
            })}
          </div>

          <button
            onClick={addFilter}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            <span className="font-semibold">+</span>
            <span>フィルターを追加</span>
          </button>

          {filters.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <button
                onClick={() => { onChangeFilters([]); setOpen(false); }}
                className="text-xs text-gray-400 hover:text-red-400"
              >
                すべてクリア
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ソートパネル ────────────────────────────────────────────────────────────

function SortPanel({
  schema,
  sorts,
  onChangeSorts,
}: {
  schema: { properties: DbProperty[] };
  sorts: SortItem[];
  onChangeSorts: (s: SortItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = sorts.length > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addSort = () => {
    const firstProp = schema.properties[0];
    if (!firstProp) return;
    onChangeSorts([...sorts, { id: uuidv4(), propId: firstProp.id, dir: 'asc' }]);
  };

  const updateSort = (id: string, patch: Partial<SortItem>) => {
    onChangeSorts(sorts.map((s) => s.id === id ? { ...s, ...patch } : s));
  };

  const removeSort = (id: string) => {
    onChangeSorts(sorts.filter((s) => s.id !== id));
  };

  const moveSort = (id: string, direction: -1 | 1) => {
    const idx = sorts.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = [...sorts];
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChangeSorts(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition ${active ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-gray-500 hover:bg-gray-100'}`}
      >
        <span>↕</span>
        <span>ソート</span>
        {active && <span className="ml-0.5 rounded-full bg-brand-500 text-white text-[9px] px-1">{sorts.length}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">並び替え</p>

          {sorts.length === 0 && (
            <p className="mb-2 text-xs text-gray-400">ソートが設定されていません</p>
          )}

          <div className="space-y-2 mb-2">
            {sorts.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1.5">
                <span className="shrink-0 text-[10px] text-gray-400 w-4 text-center">{idx + 1}</span>
                <select
                  value={s.propId}
                  onChange={(e) => updateSort(s.id, { propId: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-brand-400"
                >
                  {schema.properties.map((p) => (
                    <option key={p.id} value={p.id}>{TYPE_ICONS[p.type]} {p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => updateSort(s.id, { dir: s.dir === 'asc' ? 'desc' : 'asc' })}
                  className="shrink-0 rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-100"
                  title="昇順/降順切替"
                >
                  {s.dir === 'asc' ? '▲ 昇順' : '▼ 降順'}
                </button>
                <div className="flex flex-col">
                  <button onClick={() => moveSort(s.id, -1)} disabled={idx === 0} className="text-[9px] text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none">▲</button>
                  <button onClick={() => moveSort(s.id, 1)} disabled={idx === sorts.length - 1} className="text-[9px] text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none">▼</button>
                </div>
                <button
                  onClick={() => removeSort(s.id)}
                  className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400 text-xs"
                >✕</button>
              </div>
            ))}
          </div>

          <button
            onClick={addSort}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            <span className="font-semibold">+</span>
            <span>ソートを追加</span>
          </button>

          {sorts.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <button
                onClick={() => { onChangeSorts([]); setOpen(false); }}
                className="text-xs text-gray-400 hover:text-red-400"
              >
                すべてクリア
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 集計セル ────────────────────────────────────────────────────────────────

function AggregationCell({
  aggType,
  aggValue,
  options,
  onSelect,
  onClear,
}: {
  aggType: AggregationType | null;
  aggValue: string;
  options: { value: AggregationType; label: string }[];
  onSelect: (t: AggregationType) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const aggLabel = options.find((o) => o.value === aggType)?.label ?? '';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition hover:bg-gray-100 ${aggType ? 'text-gray-600 font-medium' : 'text-gray-300'}`}
      >
        {aggType ? (
          <>
            <span className="text-gray-400">{aggLabel}</span>
            <span className="font-semibold text-gray-700">{aggValue}</span>
          </>
        ) : (
          <span>計算</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-0.5 min-w-[100px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {aggType && (
            <button
              onClick={() => { onClear(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            >
              ✕ なし
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onSelect(opt.value); setOpen(false); }}
              className={`flex w-full items-center px-3 py-1.5 text-xs hover:bg-gray-50 ${aggType === opt.value ? 'bg-brand-50 text-brand-600 font-medium' : 'text-gray-600'}`}
            >
              {opt.label}
            </button>
          ))}
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
  if (type === 'url') return 220;
  if (type === 'multiselect') return 200;
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
  const [sorts, setSorts] = useState<SortItem[]>([]);
  const [filters, setFilters] = useState<FilterItem[]>([]);
  const [filterLogic, setFilterLogic] = useState<'and' | 'or'>('and');
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
      options: (newPropType === 'select' || newPropType === 'multiselect') ? [] : undefined,
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

  const getCellValue = (row: DbRow, propId: string) => row.cells[propId] ?? null;

  const getCellText = (row: DbRow, propId: string): string => {
    const val = row.cells[propId];
    if (val == null) return '';
    if (typeof val === 'boolean') return val ? '1' : '0';
    return String(val);
  };

  // フィルタリング（複数・AND/OR）
  const matchFilter = (row: DbRow, f: FilterItem): boolean => {
    const prop = schema.properties.find((p) => p.id === f.propId);
    if (!prop) return true;
    const raw = row.cells[f.propId];
    const strVal = getCellText(row, f.propId);

    if (f.operator === 'is_empty') return !raw && raw !== 0 && raw !== false;
    if (f.operator === 'is_not_empty') return raw != null && raw !== '';
    if (f.operator === 'checked') return raw === true;
    if (f.operator === 'unchecked') return raw !== true;

    // select: IDからname解決
    const resolvedText = (prop.type === 'select')
      ? (prop.options?.find((o) => o.id === raw)?.name ?? '')
      : strVal;

    if (f.operator === 'contains') return resolvedText.toLowerCase().includes(f.value.toLowerCase());
    if (f.operator === 'not_contains') return !resolvedText.toLowerCase().includes(f.value.toLowerCase());
    if (f.operator === 'equals') return resolvedText.toLowerCase() === f.value.toLowerCase();

    // 数値
    const numRaw = typeof raw === 'number' ? raw : parseFloat(strVal);
    const numVal = parseFloat(f.value);
    if (!isNaN(numRaw) && !isNaN(numVal)) {
      if (f.operator === 'gte') return numRaw >= numVal;
      if (f.operator === 'lte') return numRaw <= numVal;
      if (f.operator === 'gt') return numRaw > numVal;
      if (f.operator === 'lt') return numRaw < numVal;
    }

    // 日付
    if (f.operator === 'date_eq') return strVal === f.value;
    if (f.operator === 'date_gte') return strVal >= f.value;
    if (f.operator === 'date_lte') return strVal <= f.value;

    return true;
  };

  let displayRows = filters.length > 0
    ? rows.filter((row) => {
        if (filterLogic === 'and') return filters.every((f) => matchFilter(row, f));
        return filters.some((f) => matchFilter(row, f));
      })
    : rows;

  // ソート（複数・優先順位順）
  if (sorts.length > 0) {
    displayRows = [...displayRows].sort((a, b) => {
      for (const s of sorts) {
        const av = getCellText(a, s.propId);
        const bv = getCellText(b, s.propId);
        const cmp = av.localeCompare(bv, 'ja');
        if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  // 集計行の計算
  const computeAggregation = (propId: string, type: AggregationType): string => {
    const prop = schema.properties.find((p) => p.id === propId);
    if (!prop) return '';
    const values = displayRows.map((r) => r.cells[propId]);
    if (type === 'count') {
      return String(values.filter((v) => v != null && v !== '').length);
    }
    const nums = values.map((v) => typeof v === 'number' ? v : parseFloat(String(v ?? ''))).filter((n) => !isNaN(n));
    if (nums.length === 0) return '';
    if (type === 'sum') return String(nums.reduce((a, b) => a + b, 0));
    if (type === 'avg') return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
    if (type === 'min') return String(Math.min(...nums));
    if (type === 'max') return String(Math.max(...nums));
    return '';
  };

  const handleSetAggregation = (propId: string, type: AggregationType | null) => {
    const aggs = { ...(schema.aggregations ?? {}) };
    if (type === null) { delete aggs[propId]; } else { aggs[propId] = type; }
    saveSchema({ ...schema, aggregations: aggs });
  };

  const selectedRow = selectedRowId ? rows.find((r) => r.id === selectedRowId) ?? null : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* テーブルエリア */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ツールバー */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-2">
          <FilterPanel
            schema={schema}
            filters={filters}
            filterLogic={filterLogic}
            onChangeFilters={setFilters}
            onChangeLogic={setFilterLogic}
          />
          <SortPanel
            schema={schema}
            sorts={sorts}
            onChangeSorts={setSorts}
          />
          <span className="ml-auto text-[11px] text-gray-400">{displayRows.length} 件</span>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="border-collapse text-sm w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-200">
                {schema.properties.map((prop) => {
                  const activeSortIdx = sorts.findIndex((s) => s.propId === prop.id);
                  // PropertyHeader は単一ソート互換のダミーを渡す（ヘッダークリックは無効化）
                  const dummySortState = activeSortIdx >= 0
                    ? { propId: prop.id, dir: sorts[activeSortIdx].dir }
                    : null;
                  return (
                    <th
                      key={prop.id}
                      className="relative group border-r border-gray-100 bg-gray-50 text-left font-normal min-w-[60px]"
                      style={{ width: prop.width ?? defaultWidth(prop.type) }}
                    >
                      <PropertyHeader
                        prop={prop}
                        sortState={dummySortState}
                        onRename={(name) => handleRenameProp(prop.id, name)}
                        onDelete={() => handleDeleteProp(prop.id)}
                        onUpdateOptions={(opts) => handleUpdateOptions(prop.id, opts)}
                        onSort={(pid, dir) => {
                          if (dir === null) {
                            setSorts((prev) => prev.filter((s) => s.propId !== pid));
                          } else {
                            setSorts((prev) => {
                              const exists = prev.find((s) => s.propId === pid);
                              if (exists) return prev.map((s) => s.propId === pid ? { ...s, dir } : s);
                              return [...prev, { id: uuidv4(), propId: pid, dir }];
                            });
                          }
                        }}
                      />
                      <div
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-brand-400 group-hover:opacity-30"
                        onMouseDown={(e) => handleColResizeStart(e, prop.id, prop.width ?? defaultWidth(prop.type))}
                      />
                    </th>
                  );
                })}
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
                      <td key={prop.id} className="border-r border-gray-100 px-1 py-1.5 align-middle">
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
                        {prop.type === 'multiselect' && (
                          <MultiSelectCell
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
                        {prop.type === 'url' && (
                          <UrlCell
                            value={typeof raw === 'string' ? raw : ''}
                            onSave={(v) => handleCellSave(row, prop.id, v)}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="border-r border-gray-100" />
                  <td className="px-1 py-1.5 text-center align-middle w-8">
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

            {/* 集計行 */}
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                {schema.properties.map((prop) => {
                  const aggType = schema.aggregations?.[prop.id] ?? null;
                  const aggValue = aggType ? computeAggregation(prop.id, aggType) : '';
                  const isNumber = prop.type === 'number';
                  const aggOptions: { value: AggregationType; label: string }[] = isNumber
                    ? [
                        { value: 'count', label: '件数' },
                        { value: 'sum', label: '合計' },
                        { value: 'avg', label: '平均' },
                        { value: 'min', label: '最小' },
                        { value: 'max', label: '最大' },
                      ]
                    : [{ value: 'count', label: '件数' }];

                  return (
                    <td key={prop.id} className="border-r border-gray-100 px-2 py-1 align-middle">
                      <AggregationCell
                        aggType={aggType}
                        aggValue={aggValue}
                        options={aggOptions}
                        onSelect={(t) => handleSetAggregation(prop.id, t)}
                        onClear={() => handleSetAggregation(prop.id, null)}
                      />
                    </td>
                  );
                })}
                <td className="border-r border-gray-100" />
                <td className="w-8" />
              </tr>
            </tfoot>
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
