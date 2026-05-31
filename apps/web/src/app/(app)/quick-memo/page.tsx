'use client';

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useDailyMemoStore } from '@/stores/dailyMemoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { AddItemDialog } from '@/components/notion/AddItemDialog';
import { Toolbar } from '@/components/editor/NotionEditor';
import type { Editor } from '@tiptap/core';

const NotionEditor = dynamic(
  () => import('@/components/editor/NotionEditor').then((m) => ({ default: m.NotionEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-16 items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    ),
  }
);

// ── デフォルトテーブルJSON ────────────────────────────────────────────

function buildDefaultTableContent(rows: number): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: [36] },  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No' }] }] },
              { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null },  content: [{ type: 'paragraph', content: [{ type: 'text', text: '内容' }] }] },
              { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: [40] },  content: [{ type: 'paragraph', content: [{ type: 'text', text: '✓' }] }] },
            ],
          },
          ...Array.from({ length: rows }, (_, i) => ({
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [36] },  content: [{ type: 'paragraph', content: [{ type: 'text', text: String(i + 1) }] }] },
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null },  content: [{ type: 'paragraph' }] },
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [40] },  content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }] },
            ],
          })),
        ],
      },
    ],
  });
}

// ── ユーティリティ ────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${weekdays[d.getDay()]}）`;
}

/** TipTap JSON からデータ行数（ヘッダー行を除く）を数える */
function countTableDataRows(content: string): number {
  if (!content) return 0;
  try {
    const doc = JSON.parse(content);
    if (doc?.type !== 'doc') return 0;
    let count = 0;
    const walk = (node: { type: string; content?: typeof node[] }) => {
      if (node.type === 'table') {
        count += (node.content ?? []).filter((r) =>
          r.type === 'tableRow' &&
          (r.content ?? []).some((cell) => cell.type === 'tableCell'),
        ).length;
        return;
      }
      (node.content ?? []).forEach(walk);
    };
    (doc.content ?? []).forEach(walk);
    return count;
  } catch {
    return 0;
  }
}

// ── 設定モーダル ──────────────────────────────────────────────────────

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { quickMemoDefaultRows, setQuickMemoDefaultRows } = useSettingsStore();
  const [rows, setRows] = useState(quickMemoDefaultRows);

  const handleSave = () => {
    setQuickMemoDefaultRows(Math.max(1, Math.min(20, rows)));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-80 rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold text-gray-800">⚙️ 学習メモ設定</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              デフォルト行数（新規作成時のテーブル行数）
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={20}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className="flex-1 accent-brand-500"
              />
              <span className="w-8 text-center text-sm font-semibold text-gray-700">{rows}</span>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 日付セクション ────────────────────────────────────────────────────

interface DateSectionProps {
  date: string;
  isToday: boolean;
  rowCount: number;
  content: string;
  isOpen: boolean;
  defaultTableContent: string;
  onToggle: () => void;
  onSave: (_title: string, content: string) => Promise<void>;
  onDelete: () => void;
  onEditorFocus?: (editor: Editor) => void;
}

const DateSection = forwardRef<HTMLDivElement, DateSectionProps>(function DateSection(
  { date, isToday, rowCount, content, isOpen, defaultTableContent, onToggle, onSave, onDelete, onEditorFocus },
  ref,
) {
  const [editorKey, setEditorKey] = useState(0);
  const wasOpen = useRef(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isOpen && !wasOpen.current) setEditorKey((k) => k + 1);
    wasOpen.current = isOpen;
  }, [isOpen]);

  // 右クリックメニューを閉じる
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const displayContent = content || defaultTableContent;

  return (
    <div ref={ref} className="border-b border-gray-100 last:border-0">
      {/* セクションヘッダー */}
      <button
        onClick={onToggle}
        onContextMenu={handleContextMenu}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-gray-50"
      >
        <span
          className="shrink-0 text-[10px] text-gray-300 transition-transform duration-150"
          style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}
        >
          ▶
        </span>
        <span className={`shrink-0 text-xs font-semibold ${isToday ? 'text-brand-500' : 'text-gray-500'}`}>
          {formatDateHeading(date)}
        </span>
        {isToday && (
          <span className="shrink-0 rounded bg-brand-500 px-1 py-0.5 text-[10px] text-white">今日</span>
        )}
        {rowCount > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-brand-500">{rowCount}件あり!</span>
        )}
      </button>

      {/* 右クリックメニュー */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[120px] overflow-hidden rounded-lg border border-gray-100 bg-white py-1 shadow-xl"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onDelete(); setCtxMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
          >
            🗑 このメモを削除
          </button>
        </div>
      )}

      {/* エディタ（展開時のみ） */}
      {isOpen && (
        <div className="px-2 pb-4">
          <NotionEditor
            key={editorKey}
            initialTitle=""
            initialContent={displayContent}
            onSave={onSave}
            hideTitle
            compact
            hideToolbar
            onEditorFocus={onEditorFocus}
          />
        </div>
      )}
    </div>
  );
});

// ── メインページ ──────────────────────────────────────────────────────

export default function QuickMemoPage() {
  const { user } = useAuthStore();
  const { memos, loading, update, remove } = useDailyMemoStore();
  const { quickMemoDefaultRows } = useSettingsStore();
  const router = useRouter();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const today = toLocalDateString(new Date());

  // デフォルトテーブル（設定値に基づく）
  const defaultTableContent = useMemo(
    () => buildDefaultTableContent(quickMemoDefaultRows),
    [quickMemoDefaultRows],
  );

  // 表示する日付一覧（今日 + 内容のある日のみ、新しい順）
  const allDates = useMemo(() => {
    const datesWithContent = memos
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => m.id);
    const set = new Set([today, ...datesWithContent]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [memos, today]);

  // 展開中の日付セット（デフォルトは今日のみ）
  const [openDates, setOpenDates] = useState<Set<string>>(() => new Set([today]));

  const toggleDate = useCallback((date: string) => {
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const makeSaveHandler = useCallback(
    (date: string) =>
      async (_title: string, content: string) => {
        if (!user) return;
        await update(user.uid, date, content);
      },
    [user, update],
  );

  const handleDelete = useCallback(
    (date: string) => {
      if (!user) return;
      if (!window.confirm(`${formatDateHeading(date)} のメモを削除しますか？`)) return;
      remove(user.uid, date);
      setOpenDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    },
    [user, remove],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* 書式バー（常に最上部） */}
        <div className="shrink-0 border-b border-gray-100 bg-white px-2 py-1">
          {activeEditor
            ? <Toolbar key={activeDate ?? 'toolbar'} editor={activeEditor} className="" />
            : <div className="flex h-7 items-center px-1 text-xs text-gray-300">テーブルをクリックして書式を変更</div>
          }
        </div>

        {/* ページヘッダー */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="text-base">📓</span>
            <h1 className="text-sm font-semibold text-gray-800">学習メモ</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
              title="設定"
            >
              ⚙️
            </button>
            <button
              onClick={() => router.push('/notion-plus')}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              📝 NotionPlus
            </button>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
              title="学習アイテムを記録"
            >
              📚 記録
            </button>
          </div>
        </div>

        {/* 日付リスト */}
        <div className="flex-1 overflow-y-auto">
          {allDates.map((date) => {
            const memo = memos.find((m) => m.id === date);
            const rowCount = countTableDataRows(memo?.content ?? '');
            return (
              <DateSection
                key={date}
                date={date}
                isToday={date === today}
                rowCount={rowCount}
                content={memo?.content ?? ''}
                defaultTableContent={defaultTableContent}
                isOpen={openDates.has(date)}
                onToggle={() => toggleDate(date)}
                onSave={makeSaveHandler(date)}
                onDelete={() => handleDelete(date)}
                onEditorFocus={(editor) => { setActiveEditor(editor); setActiveDate(date); }}
              />
            );
          })}
        </div>
      </div>

      {addDialogOpen && user && (
        <AddItemDialog uid={user.uid} onClose={() => setAddDialogOpen(false)} />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
