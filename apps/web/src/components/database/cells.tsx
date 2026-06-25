'use client';

// データベースのセル編集コンポーネント群（共有モジュール）。
// フルの DatabaseView と、本文埋め込み（インラインDB）の行ページポップアップの
// 両方から使う。NotionEditor を import しない＝循環参照しない。

import { useEffect, useRef, useState } from 'react';
import { type DbSelectOption, type DbPropertyType } from '@study-tracker/core';

export const SELECT_COLORS: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  red: 'bg-red-100 text-red-600 border-red-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  green: 'bg-green-100 text-green-600 border-green-200',
  blue: 'bg-blue-100 text-blue-600 border-blue-200',
  purple: 'bg-purple-100 text-purple-600 border-purple-200',
  pink: 'bg-pink-100 text-pink-600 border-pink-200',
};

export const TYPE_ICONS: Record<DbPropertyType, string> = {
  title: '🔤',
  text: '📝',
  number: '#',
  select: '◯',
  multiselect: '☰',
  checkbox: '☑',
  date: '📅',
  url: '🔗',
};

export const COLOR_NAMES = Object.keys(SELECT_COLORS);

export function TextCell({
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

export function NumberCell({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
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

export function SelectCell({
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

export function CheckboxCell({ value, onSave }: { value: boolean; onSave: (v: boolean) => void }) {
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

export function DateCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
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

export function UrlCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
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
        placeholder="https://"
      />
    );
  }

  return (
    <div className="w-full min-h-[22px] flex items-center px-1">
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-blue-500 hover:text-blue-700 underline truncate max-w-full"
        >
          {value}
        </a>
      ) : (
        <span
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-gray-300 text-sm select-none cursor-text w-full min-h-[22px] flex items-center"
        >
        </span>
      )}
      {value && (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="shrink-0 ml-1 text-[10px] text-gray-300 hover:text-gray-500"
          title="URLを編集"
        >
          ✎
        </button>
      )}
    </div>
  );
}

export function MultiSelectCell({
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

  const parseIds = (v: string): string[] => {
    if (!v) return [];
    try { return JSON.parse(v) as string[]; } catch { return []; }
  };

  const selectedIds = parseIds(value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onSave(next.length > 0 ? JSON.stringify(next) : '');
  };

  return (
    <div ref={ref} className="relative w-full">
      <div
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[22px] cursor-pointer flex flex-wrap items-center gap-0.5 px-1"
      >
        {selectedIds.length > 0 ? (
          selectedIds.map((id) => {
            const opt = options.find((o) => o.id === id);
            if (!opt) return null;
            return (
              <span key={id} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${SELECT_COLORS[opt.color] ?? SELECT_COLORS.gray}`}>
                {opt.name}
              </span>
            );
          })
        ) : (
          <span className="text-gray-300 text-sm select-none"></span>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-0.5 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {selectedIds.length > 0 && (
            <button
              onClick={() => { onSave(''); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            >
              ✕ すべてクリア
            </button>
          )}
          {options.map((opt) => {
            const checked = selectedIds.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => toggle(opt.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 ${checked ? 'bg-brand-50' : ''}`}
              >
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border text-[10px] ${checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300'}`}>
                  {checked && '✓'}
                </span>
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${SELECT_COLORS[opt.color] ?? SELECT_COLORS.gray}`}>
                  {opt.name}
                </span>
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-400">オプションなし（列ヘッダーで追加）</p>
          )}
        </div>
      )}
    </div>
  );
}
