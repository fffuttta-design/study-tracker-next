'use client';

import { useEffect, useRef, useCallback, useState, createContext, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

// ── ページ遷移インターセプトコンテキスト ─────────────────────────────────
// モーダル内でページリンクをクリックした際、router.push の代わりに
// このコンテキストのコールバックを呼ぶことでモーダル内でページを切り替える
export const PageNavigationContext = createContext<((href: string) => void) | null>(null);

// ── エディタUID コンテキスト ──────────────────────────────────────────
export const EditorUidContext = createContext<string>('');

// ── 現在編集中のページID コンテキスト（ページテーブルの子ページ作成用）─────
export const EditorPageIdContext = createContext<string>('');

import { Node as TiptapNode } from '@tiptap/core';
import {
  useEditor, EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer, type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { TableRow } from '@tiptap/extension-table';

// ── 共通エディタ部品（ふたメモと共有）──────────────────────────────────
// 🔥 ここから来ている物を直すときは C:\dev\CompanyOps\Application\Utility\FutaEditor を直す。
//    直すとふたメモ側にも同時に効く（＝2つのアプリで同じエディタを使っている）。
import {
  pmToMarkdown, isYouTubeUrl, sanitizePastedHTML, type PmNode,
  TEXT_COLORS, BG_COLORS,
  CalloutNode, ToggleHeadingNode, TocNode, UrlMentionNode,
  ResizableImage, ResizableYoutube,
  CustomTable, CustomTableCell, CustomTableHeader,
  MarkdownBulletShortcut, MarkdownCodeBlockShortcut, HeadingUnderline, LineBoldShortcut,
  DragHandleExtension, setDragHandleVertOffset, AnnotationMark,
  PageLinkNode, PageTableNode, PageDescTableNode, ptDefaultSections,
  EditorHostContext, type EditorHost, PageLinkPicker,
  Toolbar,
  clipboardTextSerializer,
} from '@futa/editor';

import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { useDbRowStore } from '@/stores/notionDatabaseRowStore';
import { TextCell, NumberCell, SelectCell, MultiSelectCell, CheckboxCell, DateCell, UrlCell } from '@/components/database/cells';
import { parseDbSchema, createBookChapter, serializeBookChapters, parseBookChapters, localDateKey, type NotionPage, type DbProperty, type DbRow, type LearningItem } from '@study-tracker/core';
import { copyNotionPlusPageId } from '@/lib/copyPageId';
import '@futa/editor/editor.css';

// ツールバーは従来どおりこのファイル経由でも取り出せる（呼び出し側を変えないため）
export { Toolbar };



// ── インラインデータベース埋め込み ────────────────────────────────────

// ── インラインDB プレビュー用：色チップ・型アイコン・既定列幅 ─────────────
// （フルの DatabaseView.tsx と同じ配色・アイコンに揃えている）
const DB_SELECT_COLORS: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  red: 'bg-red-100 text-red-600 border-red-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  green: 'bg-green-100 text-green-600 border-green-200',
  blue: 'bg-blue-100 text-blue-600 border-blue-200',
  purple: 'bg-purple-100 text-purple-600 border-purple-200',
  pink: 'bg-pink-100 text-pink-600 border-pink-200',
};
const DB_TYPE_ICONS: Record<string, string> = {
  title: '🔤', text: '📝', number: '#', select: '◯',
  multiselect: '☰', checkbox: '☑', date: '📅', url: '🔗',
};
function dbDefaultWidth(type: string): number {
  if (type === 'checkbox') return 80;
  if (type === 'number') return 100;
  if (type === 'date') return 140;
  if (type === 'url') return 220;
  if (type === 'multiselect') return 200;
  return 180;
}

// セルの中身を型に応じてリッチ表示（テーブル・行ページポップアップで共用）
function renderDbCell(prop: DbProperty, val: unknown) {
  if (prop.type === 'checkbox') {
    const on = val === true || val === 'true';
    return <span className={`text-sm ${on ? 'text-brand-500' : 'text-gray-300'}`}>{on ? '☑' : '☐'}</span>;
  }
  if (prop.type === 'select') {
    const opt = prop.options?.find((o) => o.id === val);
    if (!opt) return null;
    return (
      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${DB_SELECT_COLORS[opt.color] ?? DB_SELECT_COLORS.gray}`}>
        {opt.name}
      </span>
    );
  }
  if (prop.type === 'multiselect') {
    let ids: string[] = [];
    try { ids = JSON.parse(String(val ?? '[]')); } catch { ids = []; }
    if (!ids.length) return null;
    return (
      <span className="flex flex-wrap items-center gap-0.5 overflow-hidden">
        {ids.map((id) => {
          const opt = prop.options?.find((o) => o.id === id);
          if (!opt) return null;
          return (
            <span key={id} className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${DB_SELECT_COLORS[opt.color] ?? DB_SELECT_COLORS.gray}`}>
              {opt.name}
            </span>
          );
        })}
      </span>
    );
  }
  if (prop.type === 'url' && val) {
    return <span className="truncate text-blue-500 underline decoration-blue-200">{String(val)}</span>;
  }
  if (prop.type === 'number') {
    return <span className="block truncate text-right tabular-nums text-gray-700">{val === null || val === undefined ? '' : String(val)}</span>;
  }
  return <span className="block truncate text-gray-700">{val === null || val === undefined ? '' : String(val)}</span>;
}

function InlineDatabaseEmbed({ node, updateAttributes }: NodeViewProps) {
  const router = useRouter();
  const onPageNavigate = useContext(PageNavigationContext);
  const uid = useContext(EditorUidContext);
  const { databaseId, title: nodeTitle } = node.attrs as { databaseId: string; title: string };
  const colWidths = (node.attrs.colWidths ?? {}) as Record<string, number>;
  const pages = useNotionPageStore((s) => s.pages);
  const { rows, subscribeRows } = useDbRowStore();
  const page = pages.find((p) => p.id === databaseId);
  const schema = useMemo(() => parseDbSchema(page?.content ?? ''), [page?.content]);

  useEffect(() => {
    if (!uid || !databaseId) return;
    const unsub = subscribeRows(uid, databaseId);
    return unsub;
  }, [uid, databaseId, subscribeRows]);

  // 各列の有効幅：埋め込みごとの保存値 → DB側の幅 → 型ごとの既定
  const baseWidths = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of schema.properties) {
      map[p.id] = colWidths[p.id] ?? p.width ?? dbDefaultWidth(p.type);
    }
    return map;
  // colWidths は attrs 由来。schema 変化時に再計算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema.properties, JSON.stringify(colWidths)]);

  // ドラッグ中だけローカルで即時反映（確定時に attrs へコミット）
  const [dragWidths, setDragWidths] = useState<Record<string, number> | null>(null);
  const effWidths = dragWidths ?? baseWidths;
  const totalWidth = schema.properties.reduce((s, p) => s + (effWidths[p.id] ?? dbDefaultWidth(p.type)), 0);

  const resizingRef = useRef<{ propId: string; startX: number; startW: number } | null>(null);
  const startResize = (e: React.MouseEvent, propId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startW = effWidths[propId] ?? 180;
    resizingRef.current = { propId, startX: e.clientX, startW };
    let latest = { ...baseWidths };
    setDragWidths(latest);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);

    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const w = Math.max(60, r.startW + (ev.clientX - r.startX));
      latest = { ...latest, [r.propId]: Math.round(w) };
      setDragWidths({ ...latest });
    };
    const onUp = () => {
      overlay.remove();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      resizingRef.current = null;
      // この埋め込み専用の列幅としてノード属性へ保存（DB本体の幅は変更しない）
      const next = { ...(node.attrs.colWidths ?? {}) } as Record<string, number>;
      for (const p of schema.properties) next[p.id] = latest[p.id];
      updateAttributes({ colWidths: next });
      setDragWidths(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const displayTitle = page?.title || nodeTitle || 'データベース';
  const href = `/notion-plus/${databaseId}`;
  const PREVIEW_LIMIT = 5;
  const previewRows = rows.slice(0, PREVIEW_LIMIT);
  const extraRows = rows.length - PREVIEW_LIMIT;

  // 行クリックでその行のページをその場でポップアップ表示
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const openRow = openRowId ? rows.find((r) => r.id === openRowId) ?? null : null;

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="group/db my-2 w-fit max-w-full overflow-hidden rounded-xl border border-gray-200 text-xs shadow-sm" contentEditable={false}>
        {/* ヘッダーバー */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-3 py-2">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700">
            <span>📊</span>
            <span>{displayTitle}</span>
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-400">{rows.length}</span>
          </span>
          <button
            onClick={() => href && (onPageNavigate ? onPageNavigate(href) : router.push(href))}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 group-hover/db:opacity-100"
          >
            ↗ 開く
          </button>
        </div>
        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ tableLayout: 'fixed', width: totalWidth }}>
            <colgroup>
              {schema.properties.map((prop) => (
                <col key={prop.id} style={{ width: effWidths[prop.id] }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {schema.properties.map((prop) => (
                  <th key={prop.id} className="group/th relative select-none px-2.5 py-1.5 text-left text-[11px] font-semibold text-gray-400 border-r border-gray-100 last:border-r-0">
                    <span className="flex items-center gap-1 overflow-hidden">
                      <span className="shrink-0 text-gray-300">{DB_TYPE_ICONS[prop.type] ?? '·'}</span>
                      <span className="truncate">{prop.name}</span>
                    </span>
                    {/* 列幅リサイズハンドル */}
                    <span
                      onMouseDown={(e) => startResize(e, prop.id)}
                      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-brand-400 opacity-0 transition hover:opacity-100 group-hover/th:opacity-30"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={schema.properties.length} className="px-2.5 py-3 text-center text-gray-300">
                    データなし
                  </td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setOpenRowId(row.id)}
                    className="group/row cursor-pointer border-b border-gray-50 transition-colors last:border-b-0 hover:bg-gray-50/60"
                  >
                    {schema.properties.map((prop, i) => (
                      <td key={prop.id} className="relative overflow-hidden px-2.5 py-1.5 border-r border-gray-50 last:border-r-0 align-middle">
                        <span className="flex items-center justify-between gap-1 overflow-hidden">
                          <span className="min-w-0 flex-1 overflow-hidden">{renderDbCell(prop, row.cells[prop.id] ?? null)}</span>
                          {i === 0 && (
                            <span className="shrink-0 rounded px-1 text-[10px] text-gray-300 opacity-0 transition group-hover/row:opacity-100">↗ 開く</span>
                          )}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
              {extraRows > 0 && (
                <tr>
                  <td colSpan={schema.properties.length} className="px-2.5 py-1.5 text-center text-[11px] text-gray-400 hover:bg-gray-50/60">
                    <button onClick={() => href && (onPageNavigate ? onPageNavigate(href) : router.push(href))} className="hover:text-gray-600">
                      ＋ 他 {extraRows} 行を表示
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {openRow && uid && (
        <InlineRowPagePopup
          row={openRow}
          schema={schema}
          uid={uid}
          databaseTitle={displayTitle}
          onOpenFull={() => { setOpenRowId(null); if (href) (onPageNavigate ? onPageNavigate(href) : router.push(href)); }}
          onClose={() => setOpenRowId(null)}
        />
      )}
    </NodeViewWrapper>
  );
}

// ── インラインDB：行をその場で開くポップアップ（Notionのピーク風）────────────
function InlineRowPagePopup({
  row, schema, uid, databaseTitle, onOpenFull, onClose,
}: {
  row: DbRow;
  schema: { properties: DbProperty[] };
  uid: string;
  databaseTitle: string;
  onOpenFull: () => void;
  onClose: () => void;
}) {
  const { updateRow, updateRowContent } = useDbRowStore();
  const dummyRef = useRef<(() => void) | null>(null);
  const titleProp = schema.properties.find((p) => p.type === 'title');
  const titleVal = titleProp && typeof row.cells[titleProp.id] === 'string' ? (row.cells[titleProp.id] as string) : '';
  const [titleDraft, setTitleDraft] = useState(titleVal);
  const otherProps = schema.properties.filter((p) => p.type !== 'title');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // セル保存：直近の行データへマージして書き込む（連続編集の取りこぼし防止）
  const saveCell = (propId: string, val: string | number | boolean | null) => {
    const latest = useDbRowStore.getState().rows.find((r) => r.id === row.id);
    const cells = { ...(latest?.cells ?? row.cells), [propId]: val };
    updateRow(uid, row.id, cells).catch(() => {});
  };

  const saveTitle = () => {
    if (!titleProp) return;
    if (titleDraft === titleVal) return;
    saveCell(titleProp.id, titleDraft);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <span className="truncate text-xs text-gray-400">📊 {databaseTitle}</span>
          <div className="flex items-center gap-1">
            <button onClick={onOpenFull} className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="データベース本体で開く">↗ 本体で開く</button>
            <button onClick={onClose} className="rounded px-2 py-1 text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="閉じる">✕</button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* タイトル */}
          <div className="px-6 pt-5">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              placeholder="Untitled"
              className="w-full bg-transparent text-2xl font-bold text-gray-800 outline-none placeholder:text-gray-300"
            />
          </div>

          {/* プロパティ一覧（タイトル以外・編集可） */}
          {otherProps.length > 0 && (
            <div className="flex flex-col gap-1.5 border-b border-gray-100 px-6 py-4">
              {otherProps.map((prop) => {
                const raw = row.cells[prop.id] ?? null;
                return (
                  <div key={prop.id} className="flex items-center gap-3 text-xs">
                    <span className="flex w-28 shrink-0 items-center gap-1.5 text-gray-400">
                      <span>{DB_TYPE_ICONS[prop.type] ?? '·'}</span>
                      <span className="truncate">{prop.name}</span>
                    </span>
                    <div className="flex min-w-0 flex-1 items-center rounded-md border border-transparent px-1 py-0.5 hover:border-gray-200 hover:bg-gray-50/60">
                      {prop.type === 'text' && (
                        <TextCell value={typeof raw === 'string' ? raw : ''} onSave={(v) => saveCell(prop.id, v)} />
                      )}
                      {prop.type === 'number' && (
                        <NumberCell value={typeof raw === 'number' ? raw : null} onSave={(v) => saveCell(prop.id, v)} />
                      )}
                      {prop.type === 'select' && (
                        <SelectCell value={typeof raw === 'string' ? raw : ''} options={prop.options ?? []} onSave={(v) => saveCell(prop.id, v)} />
                      )}
                      {prop.type === 'multiselect' && (
                        <MultiSelectCell value={typeof raw === 'string' ? raw : ''} options={prop.options ?? []} onSave={(v) => saveCell(prop.id, v)} />
                      )}
                      {prop.type === 'checkbox' && (
                        <CheckboxCell value={typeof raw === 'boolean' ? raw : false} onSave={(v) => saveCell(prop.id, v)} />
                      )}
                      {prop.type === 'date' && (
                        <DateCell value={typeof raw === 'string' ? raw : ''} onSave={(v) => saveCell(prop.id, v)} />
                      )}
                      {prop.type === 'url' && (
                        <UrlCell value={typeof raw === 'string' ? raw : ''} onSave={(v) => saveCell(prop.id, v)} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ページ本文 */}
          <div className="flex min-h-[300px] flex-1 flex-col px-2 py-2">
            <NotionEditor
              key={row.id}
              initialTitle=""
              hideTitle
              initialContent={row.pageContent ?? ''}
              onSave={async (_t, content) => { await updateRowContent(uid, row.id, content); }}
              notionPageId={row.id}
              recordTriggerRef={dummyRef}
              onCreateSubPage={async () => ({ id: '', title: '' })}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

const InlineDatabaseNode = TiptapNode.create({
  name: 'inlineDatabase',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      databaseId: { default: '' },
      title: { default: '' },
      colWidths: { default: {} },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="inline-database"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'inline-database' }]; },
  addNodeView() { return ReactNodeViewRenderer(InlineDatabaseEmbed); },
});

// ── スラッシュコマンド ──────────────────────────────────────────────

interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action?: (editor: ReturnType<typeof useEditor>) => void;
  asyncAction?: (editor: ReturnType<typeof useEditor>) => Promise<void>;
  openPageLinkPicker?: boolean; // 既存ページへのショートカット挿入：検索ピッカーを開く
  openMemoPicker?: boolean;     // 未消化の特急メモをカーソル位置に挿入（消化）：検索ピッカーを開く
}

const SLASH_COMMANDS: SlashCommand[] = [
  { label: 'テキスト',           description: '通常のテキスト',       icon: '¶',   action: (e) => e?.chain().focus().setParagraph().run() },
  { label: '見出し 1',           description: '大見出し',             icon: 'H1',  action: (e) => e?.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: '見出し 2',           description: '中見出し',             icon: 'H2',  action: (e) => e?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: '見出し 3',           description: '小見出し',             icon: 'H3',  action: (e) => e?.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: '見出し 4',           description: '小小見出し',           icon: 'H4',  action: (e) => e?.chain().focus().toggleHeading({ level: 4 }).run() },
  { label: 'トグル見出し',       description: '折りたたみ可能な見出し', icon: '▶',  action: (e) => {
    if (!e) return;
    const { state, view } = e;
    const { $from } = state.selection;
    const { schema } = state;
    const from = $from.before($from.depth > 0 ? 1 : 0);
    const to = $from.after($from.depth > 0 ? 1 : 0);
    const toggleNode = schema.nodes.toggleHeading.create(
      { level: 1, isOpen: true },
      [schema.nodes.heading.create({ level: 1 }), schema.nodes.paragraph.create()]
    );
    view.dispatch(state.tr.replaceWith(from, to, toggleNode));
  } },
  { label: '箇条書き',           description: '・リスト',             icon: '•',   action: (e) => e?.chain().focus().toggleBulletList().run() },
  { label: '番号付きリスト',     description: '1. 2. 3. ...',        icon: '1.',  action: (e) => e?.chain().focus().toggleOrderedList().run() },
  { label: 'チェックリスト',     description: 'Todoリスト',           icon: '☑',  action: (e) => e?.chain().focus().toggleTaskList().run() },
  { label: 'テーブル',           description: '表を挿入',             icon: '⊞',   action: (e) => e?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: '目次',               description: '見出しから目次を生成', icon: '≡',   action: (e) => {
    if (!e) return;
    const { state, view } = e;
    let tr = state.tr;
    // 既存の目次ノードを逆順で削除
    const tocPos: { pos: number; size: number }[] = [];
    state.doc.descendants((node, pos) => { if (node.type.name === 'toc') tocPos.unshift({ pos, size: node.nodeSize }); });
    for (const { pos, size } of tocPos) tr = tr.delete(pos, pos + size);
    // ページ最上部（position 0）に挿入
    tr = tr.insert(0, state.schema.nodes.toc.create());
    view.dispatch(tr);
  } },
  { label: 'コールアウト',       description: '目立つ注釈ブロック',   icon: '💡',  action: (e) => e?.chain().focus().insertContent({ type: 'callout', attrs: { background: '#FDE047' }, content: [{ type: 'paragraph' }] }).run() },
  { label: '引用',               description: 'ブロック引用',         icon: '❝',  action: (e) => e?.chain().focus().toggleBlockquote().run() },
  { label: 'コード',             description: 'コードブロック',       icon: '</>', action: (e) => e?.chain().focus().toggleCodeBlock().run() },
  { label: '区切り線',           description: '水平線',               icon: '—',  action: (e) => e?.chain().focus().setHorizontalRule().run() },
  { label: 'ページテーブル',     description: 'ページリンクを整理する表', icon: '▦',  action: (e) => e?.chain().focus().insertContent({ type: 'pageTable', attrs: { sections: ptDefaultSections() } }).run() },
  { label: 'テーブルビュー',     description: '左にページ・右に説明を並べる表', icon: '▤',  action: (e) => e?.chain().focus().insertContent({ type: 'pageDescTable', attrs: { rows: [] } }).run() },
  { label: 'ページリンク',       description: '既存ページへのショートカット（押すと移動）', icon: '🔗', openPageLinkPicker: true },
  { label: '特急メモ',           description: '未消化の特急メモをここに挿入（消化）', icon: '⚡', openMemoPicker: true },
];


// ── 学習記録ダイアログ ────────────────────────────────────────────────

function RecordDialog({ initialContent, notionPageId, notionPagePath, onClose }: {
  initialContent: string;
  notionPageId?: string;
  notionPagePath?: string;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const add = useLearningStore((s) => s.add);
  const router = useRouter();
  const firstLine = initialContent.split('\n').find((l) => l.trim())?.trim() ?? '';
  const cleanTitle = firstLine.replace(/^#{1,6}\s+/, '').replace(/\*{1,3}([^*]*)\*{1,3}/g, '$1').replace(/_{1,3}([^_]*)_{1,3}/g, '$1').replace(/~~([^~]*)~~/g, '$1').replace(/`[^`]+`/g, '').replace(/^[>\-*+]\s+/gm, '').replace(/[◆▶▲▼●○■□★☆◇]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  const [title, setTitle] = useState(cleanTitle.slice(0, 80));
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const dateKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500';

  const submit = async () => {
    if (!content.trim() && !title.trim()) return;
    if (!user) return;
    setSaving(true);
    try {
      await add(user.uid, { dateKey, title: title.trim(), content: content.trim(), sortOrder: 0, notionPageId, notionPagePath });
      onClose();
      router.push('/learning');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-gray-800">📚 学習リストに記録</h3>
        {notionPagePath && <p className="mb-3 flex items-center gap-1 text-xs text-gray-400"><span>📁</span><span>{notionPagePath}</span></p>}
        <div className="space-y-3">
          <input placeholder="タイトル" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          <textarea placeholder="内容" value={content} onChange={(e) => setContent(e.target.value)} rows={5} className={inputCls} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {saving ? '記録中...' : '記録する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── インライン期間（v1.1.28〜v1.1.31）に保存されたデータをブロック形式へ戻す ──
// 当時: pageLink が paragraph に包まれて保存 → { type:'paragraph', content:[{type:'pageLink'}] }
// 現在: pageLink はブロック直置き → { type:'pageLink', attrs:{...} }
function migratePageLinks(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json;
  const obj = json as Record<string, unknown>;
  if (obj.type === 'doc' && Array.isArray(obj.content)) {
    return {
      ...obj,
      content: (obj.content as unknown[]).flatMap((node) => {
        const n = node as Record<string, unknown>;
        // paragraph が pageLink 1つだけを含む場合 → アンラップしてブロック直置きに戻す
        if (
          n.type === 'paragraph' &&
          Array.isArray(n.content) &&
          (n.content as unknown[]).length === 1 &&
          ((n.content as unknown[])[0] as Record<string, unknown>).type === 'pageLink'
        ) {
          return [(n.content as unknown[])[0]];
        }
        return [n];
      }),
    };
  }
  return json;
}

// ── メインエディタ ─────────────────────────────────────────────────

interface NotionEditorProps {
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
  onCreateSubPage?: () => Promise<{ id: string; title: string }>;
  recordTriggerRef?: React.MutableRefObject<(() => void) | null>;
  contentGetterRef?: React.MutableRefObject<(() => string) | null>; // 現在の本文(TipTap JSON文字列)を即時取得する（消化モーダル等）
  insertAtCursorRef?: React.MutableRefObject<((nodes: object[]) => void) | null>; // 現在のカーソル位置へブロックを挿入する（消化モーダル等）
  onRecordText?: (text: string) => void;
  notionPageId?: string;
  notionPagePath?: string;
  highlightText?: string;
  onPageNavigate?: (href: string) => void;
  hideTitle?: boolean; // ブック用: タイトル入力を非表示
  compact?: boolean;   // 最小高さを抑えて内容に合わせて伸縮
  onEditorFocus?: (editor: NonNullable<ReturnType<typeof useEditor>>) => void;
  hideToolbar?: boolean;
  stickyToolbar?: boolean;     // ブック用: 書式バーをスクロールしても上部に固定表示
  numberHeadings?: boolean;    // ブック用: 本文の見出しに番号(1/1.1/1.1.1)をCSSカウンタで表示
  headingNumberColor?: string; // ブック用: 見出し番号の文字色
  chapterHeading?: string;     // ブック用: ページ先頭に大きく表示するチャプター名（未指定=非表示）
}

interface PastePopup {
  url: string;
  pos: { top: number; left: number };
  isYoutube: boolean;
  range: { from: number; to: number }; // 先に貼ったURLテキストの範囲（変換時はここを置換）
}

export function NotionEditor({
  initialTitle, initialContent, onSave, onCreateSubPage,
  recordTriggerRef, contentGetterRef, insertAtCursorRef, onRecordText, notionPageId, notionPagePath, highlightText, onPageNavigate,
  hideTitle, compact, onEditorFocus, hideToolbar, stickyToolbar, numberHeadings, headingNumberColor, chapterHeading,
}: NotionEditorProps) {
  const notionPlusLayout = useSettingsStore((s) => s.notionPlusLayout);
  const notionPlusParaLineHeight = useSettingsStore((s) => s.notionPlusParaLineHeight);
  const notionPlusSoftLineHeight = useSettingsStore((s) => s.notionPlusSoftLineHeight);
  const notionPlusBlockOffsets = useSettingsStore((s) => s.notionPlusBlockOffsets);
  const dragHandleOffset = useSettingsStore((s) => s.dragHandleOffset);
  useEffect(() => { setDragHandleVertOffset(dragHandleOffset ?? 0); }, [dragHandleOffset]);
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const titleValue = useRef(initialTitle);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightingRef = useRef(false);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const slashStartPos = useRef<number | null>(null);
  // 既存ページへのショートカット挿入ピッカー（/ページリンク）
  const allPages = useNotionPageStore((s) => s.pages);
  const [pageLinkPicker, setPageLinkPicker] = useState<{ top: number; left: number } | null>(null);
  // 特急メモ挿入ピッカー（/特急メモ）：未消化メモをカーソル位置に挿入＝消化
  const learningItems = useLearningStore((s) => s.items);
  const addLearningItem = useLearningStore((s) => s.add);
  const removeLearningItem = useLearningStore((s) => s.remove);
  const [memoPicker, setMemoPicker] = useState<{ top: number; left: number } | null>(null);
  const [memoQuery, setMemoQuery] = useState('');
  const activeSlashItemRef = useRef<HTMLButtonElement>(null);
  // 矢印キーで選択が移動したら、その項目をメニュー内に必ず見えるようスクロール追従させる
  useEffect(() => {
    if (slashOpen) activeSlashItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [slashIndex, slashOpen]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [pastePopup, setPastePopup] = useState<PastePopup | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [recordText, setRecordText] = useState<string | null>(null);

  // ページ内 検索＆置換（Ctrl+R）
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const replaceIndexRef = useRef(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Annotation (Tip) 関連
  const [annotationDialogPos, setAnnotationDialogPos] = useState<{ x: number; y: number } | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState('');
  const [annotationTooltip, setAnnotationTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const savedAnnotationSelRef = useRef<{ from: number; to: number } | null>(null);

  const contentDivRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const [tableButtonInfo, setTableButtonInfo] = useState<{ rowY: number; colX: number; centerX: number; centerY: number } | null>(null);
  const tableButtonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pasteUrlCallbackRef = useRef<((url: string, coords: { bottom: number; left: number }, range: { from: number; to: number }) => void) | null>(null);
  pasteUrlCallbackRef.current = (url, coords, range) => {
    setPastePopup({ url, pos: { top: coords.bottom + 8, left: coords.left }, isYoutube: isYouTubeUrl(url), range });
  };

  const { user } = useAuthStore();
  const { add: addPage } = useNotionPageStore();
  const updatePage = useNotionPageStore((s) => s.update);

  // ── 共有エディタへ渡す「差し込み口」──────────────────────────────
  // ページリンク／ページテーブル／テーブルビューは @futa/editor 側にあり、
  // ページ一覧の持ち方を知らない。ここで NotionPLUS のストアと繋ぐ。
  const editorHost: EditorHost = useMemo(() => ({
    uid: user?.uid ?? '',
    currentPageId: notionPageId ?? '',
    pages: allPages,
    addPage: async (opts) => {
      const np = await addPage(user!.uid, opts.parentId ? { parentId: opts.parentId } : {});
      return np;
    },
    updatePage: async (id, patch) => { await updatePage(user!.uid, id, patch as Partial<NotionPage>); },
    pageHref: (id) => `/notion-plus/${id}`,
    pageIdFromHref: (href) => href?.match(/\/notion-plus\/([^/?#]+)/)?.[1],
    navigate: (href) => { if (onPageNavigate) onPageNavigate(href); else router.push(href); },
    copyPageId: (id, title) => copyNotionPlusPageId(id, title),
    book: {
      convertToBook: async (pageId) => {
        const lp = allPages.find((p) => p.id === pageId);
        if (!user || !lp || lp.type === 'book' || lp.type === 'database') return;
        if (!window.confirm(`「${lp.title || 'Untitled'}」をブックに変換しますか？
現在の内容は第1章になります。`)) return;
        const firstChapter = { ...createBookChapter(0), content: lp.content };
        await updatePage(user.uid, pageId, {
          type: 'book',
          icon: lp.icon === '📄' ? '📖' : lp.icon,
          content: serializeBookChapters([firstChapter]),
        });
      },
      convertToNote: async (pageId) => {
        const lp = allPages.find((p) => p.id === pageId);
        if (!user || !lp || lp.type !== 'book') return;
        if (!window.confirm(`「${lp.title || 'Untitled'}」をノートに戻しますか？
全チャプターの内容を1ページに結合します。`)) return;
        const merged: { type: 'doc'; content: unknown[] } = { type: 'doc', content: [] };
        for (const ch of parseBookChapters(lp.content)) {
          try { const doc = JSON.parse(ch.content) as { content?: unknown[] }; if (Array.isArray(doc?.content)) merged.content.push(...doc.content); } catch { /* ignore */ }
        }
        await updatePage(user.uid, pageId, { type: 'page', content: JSON.stringify(merged) });
      },
    },
  }), [user, notionPageId, allPages, addPage, updatePage, onPageNavigate, router]);

  const inlineDbCommand: SlashCommand = useMemo(() => ({
    label: 'データベース',
    description: 'インラインデータベース（テーブル）',
    icon: '📊',
    asyncAction: async (e) => {
      if (!e || !user) return;
      const newPage = await addPage(user.uid, { type: 'database' });
      e.chain().focus().insertContent({
        type: 'inlineDatabase',
        attrs: { databaseId: newPage.id, title: newPage.title || 'データベース' },
      }).run();
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, addPage]);

  const ALL_COMMANDS = useMemo(() => [...SLASH_COMMANDS, inlineDbCommand], [inlineDbCommand]);

  const filteredCommands = ALL_COMMANDS.filter((c) =>
    !slashQuery || c.label.toLowerCase().includes(slashQuery.toLowerCase())
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: false,      // StarterKit v3 同梱済み。下でカスタム設定を使うため除外
        underline: false, // StarterKit v3 同梱済み。下で個別追加するため除外
        codeBlock: false, // 同梱版は marks:'' で装飾不可。下で marks 許可版に差し替える
      }),
      // コードブロック内でも太字などのインラインマークを使えるようにする（marks:'_'＝全マーク許可）
      CodeBlock.extend({ marks: '_' }),
      // 本文の説明文（「書き始めるか…」）は出さない。毎回同じ案内が本文の1行目に居座って
      // 邪魔なため（本人指示 2026-09-10・KotoEditor と揃えた）。
      Placeholder.configure({ placeholder: '' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      HeadingUnderline,
      Link.configure({ openOnClick: true, autolink: true }),
      ResizableImage.configure({ allowBase64: true, inline: false }),
      TextStyle,
      Color,
      Underline,
      ResizableYoutube.configure({ width: 640, height: 360, nocookie: true }),
      CustomTable.configure({ resizable: true }),
      TableRow,
      CustomTableCell,
      CustomTableHeader,
      PageLinkNode,
      UrlMentionNode,
      CalloutNode,
      ToggleHeadingNode,
      TocNode,
      InlineDatabaseNode,
      PageTableNode,
      PageDescTableNode,
      DragHandleExtension,
      MarkdownBulletShortcut,
      MarkdownCodeBlockShortcut,
      LineBoldShortcut,
      AnnotationMark,
    ],
    content: (() => {
      if (!initialContent) return '';
      try {
        const parsed = JSON.parse(initialContent);
        return migratePageLinks(parsed) as object;
      } catch { return initialContent; }
    })(),
    editorProps: {
      attributes: { class: compact ? 'notion-editor notion-editor-compact' : 'notion-editor' },
      // 壊れたテーブル（セルの無い行・行の無い空テーブル）を貼り付け前に除去して事故を防ぐ
      transformPastedHTML: (html) => sanitizePastedHTML(html),
      // コピーした物を他のアプリ（Discord等）へ貼ったとき、1行おきに空行が入らないようにする
      clipboardTextSerializer,
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) continue;
              const reader = new FileReader();
              reader.onload = (e) => {
                const src = e.target?.result as string;
                if (src) view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src })));
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
        }
        const text = event.clipboardData?.getData('text/plain').trim() ?? '';
        if (/^https?:\/\//.test(text) && !text.includes('\n')) {
          event.preventDefault();
          // まず URL をリンク付きテキストとして実際に貼り付ける（「URLのまま」が既定状態）。
          const from = view.state.selection.from;
          const to = from + text.length;
          const linkType = view.state.schema.marks.link;
          let tr = view.state.tr.insertText(text);
          if (linkType) tr = tr.addMark(from, to, linkType.create({ href: text, target: '_blank', rel: 'noopener noreferrer' }));
          view.dispatch(tr);
          // 貼った直後にポップアップを出し、メンション／YouTube等への変換を選べるようにする。
          const coords = view.coordsAtPos(to);
          pasteUrlCallbackRef.current?.(text, coords, { from, to });
          return true;
        }
        return false;
      },
      // テーブルや本文リンクを本文へドラッグ＆ドロップしたとき、ProseMirror既定だと
      // text/plain（＝ページID）がそのまま「生の文字列」として挿入されてしまう（バグ）。
      // ページIDのドロップを横取りして、本物の pageLink ブロックとして最上位に挿入する。
      handleDrop(view, event) {
        const dt = event.dataTransfer;
        if (!dt) return false;
        let pageId = dt.getData('application/x-page-id');
        if (!pageId) {
          const t = (dt.getData('text/plain') || '').trim();
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) pageId = t;
        }
        if (!pageId) return false; // ページID以外のドロップは既定処理に任せる
        event.preventDefault();
        const p = useNotionPageStore.getState().pages.find((x) => x.id === pageId);
        const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        let insertAt = dropPos ? dropPos.pos : view.state.selection.from;
        try {
          const $pos = view.state.doc.resolve(insertAt);
          if ($pos.depth > 0) insertAt = $pos.after(1); // 最上位ブロックの直後に置く（段落内への割り込みを防ぐ）
        } catch { /* fallback: insertAt のまま */ }
        const node = view.state.schema.nodes.pageLink.create({
          href: `/notion-plus/${pageId}`,
          title: p?.title || 'Untitled',
          icon: p?.icon || '📄',
        });
        try {
          view.dispatch(view.state.tr.insert(insertAt, node));
        } catch {
          view.dispatch(view.state.tr.replaceSelectionWith(node));
        }
        return true;
      },
    },
    onCreate: ({ editor }) => {
      if (typeof window === 'undefined') return;
      // Electron: 新規ノートへ遷移した直後にクリックやキー入力を受け付けず、
      // ウィンドウを最小化→復帰すると直る問題への対策。
      // マウント直後にウィンドウ/webContentsへフォーカスを戻し、エディタにカーソルを置く。
      setTimeout(() => {
        try {
          window.electronAPI?.focusWindow?.();
          editor.commands.focus(null, { scrollIntoView: false });
        } catch { /* noop */ }
      }, 80);
    },
    onUpdate: ({ editor }) => {
      scheduleSave();
      const { from } = editor.state.selection;
      const text = editor.state.doc.textBetween(Math.max(0, from - 20), from, '\n');
      const slashIdx = text.lastIndexOf('/');
      if (slashIdx !== -1) {
        const query = text.slice(slashIdx + 1);
        if (!query.includes(' ') && !query.includes('\n')) {
          setSlashQuery(query);
          setSlashIndex(0);
          slashStartPos.current = from - query.length - 1;
          const coords = editor.view.coordsAtPos(from);
          const MENU_H = Math.min(filteredCommands.length * 54 + 40, 400);
          const spaceBelow = window.innerHeight - coords.bottom - 12;
          const top = spaceBelow >= MENU_H
            ? coords.bottom + 8
            : Math.max(8, coords.top - MENU_H - 8);
          setMenuPos({ top, left: coords.left });
          setSlashOpen(true);
          return;
        }
      }
      setSlashOpen(false);
      slashStartPos.current = null;
    },
  });

  const applyCommand = useCallback(async (cmd: SlashCommand) => {
    if (!editor || slashStartPos.current === null) return;
    const { from } = editor.state.selection;
    editor.chain().focus().deleteRange({ from: slashStartPos.current, to: from }).run();
    setSlashOpen(false);
    slashStartPos.current = null;
    // 既存ページへのショートカット：検索ピッカーを開く（選択後に pageLink を挿入）
    if (cmd.openPageLinkPicker) {
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      setPageLinkPicker({ top: coords.bottom + 8, left: coords.left });
      return;
    }
    // 特急メモを挿入（消化）：ピッカーを開く
    if (cmd.openMemoPicker) {
      const coords = editor.view.coordsAtPos(editor.state.selection.from);
      setMemoQuery('');
      setMemoPicker({ top: coords.bottom + 8, left: coords.left });
      return;
    }
    if (cmd.asyncAction) {
      await cmd.asyncAction(editor);
    } else if (cmd.action) {
      cmd.action(editor);
    }
  }, [editor]);

  // 選んだ既存ページへのショートカット（pageLink ブロック）を本文に挿入する
  const insertPageShortcut = useCallback((p: { id: string; title?: string; icon?: string }) => {
    setPageLinkPicker(null);
    editor?.chain().focus().insertContent({
      type: 'pageLink',
      attrs: { href: editorHost.pageHref(p.id), title: p.title || 'Untitled', icon: p.icon || '📄' },
    }).run();
  }, [editor, editorHost]);

  // 特急メモを「消化」：カーソル位置に 見出し3（タイトル）＋本文段落 を挿入し、
  // その内容を学習アイテムとして復習登録（このページ紐づけ）、元の特急メモは削除する。
  const insertMemoAtCursor = useCallback(async (memo: LearningItem) => {
    setMemoPicker(null);
    if (!editor) return;
    const t = (memo.title || '').trim();
    const body = memo.content || '';
    const nodes: object[] = [];
    if (t) nodes.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: t }] });
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const hasBody = !(lines.length === 1 && lines[0].trim() === '');
    if (hasBody) {
      for (const line of lines) {
        nodes.push(line.trim()
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' });
      }
    }
    if (nodes.length === 0) return;
    // カーソル位置へ挿入
    editor.chain().focus().insertContent(nodes).run();
    // 復習登録＋元メモ削除（このページに紐づく学習アイテムとして）
    // notionPageId が無い文脈では未消化の重複が生まれるので、挿入のみで止める
    if (user && notionPageId) {
      try {
        await addLearningItem(user.uid, {
          dateKey: localDateKey(),
          title: memo.title,
          content: memo.content,
          sortOrder: Date.now(),
          notionPageId: notionPageId,
          notionPagePath: notionPagePath,
        });
        await removeLearningItem(user.uid, memo.id);
      } catch { /* 挿入は成功しているので致命ではない */ }
    }
  }, [editor, user, addLearningItem, removeLearningItem, notionPageId, notionPagePath]);

  // ── ページ内 検索＆置換（Ctrl+R）─────────────────────────────────────
  // 本文テキストから findText の一致箇所（{from,to}）を全部集める（大文字小文字を無視）
  const getMatches = useCallback((needle: string) => {
    const res: { from: number; to: number }[] = [];
    if (!editor || !needle) return res;
    const lower = needle.toLowerCase();
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = node.text.toLowerCase();
      let idx = text.indexOf(lower);
      while (idx !== -1) {
        res.push({ from: pos + idx, to: pos + idx + needle.length });
        idx = text.indexOf(lower, idx + Math.max(1, needle.length));
      }
    });
    return res;
  }, [editor]);

  // index 番目の一致を選択してスクロール（負/超過は巡回）
  const selectMatch = useCallback((index: number) => {
    if (!editor) return;
    const matches = getMatches(findText);
    if (matches.length === 0) { setMatchInfo({ current: 0, total: 0 }); return; }
    const i = ((index % matches.length) + matches.length) % matches.length;
    replaceIndexRef.current = i;
    const m = matches[i];
    editor.chain().setTextSelection({ from: m.from, to: m.to }).scrollIntoView().run();
    setMatchInfo({ current: i + 1, total: matches.length });
  }, [editor, findText, getMatches]);

  const replaceCurrent = useCallback(() => {
    if (!editor || !findText) return;
    const matches = getMatches(findText);
    if (matches.length === 0) return;
    const i = replaceIndexRef.current % matches.length;
    const m = matches[i];
    editor.chain().focus().insertContentAt({ from: m.from, to: m.to }, replaceWith).run();
    // 置換後に同じ位置（＝次の一致）を選び直す
    setTimeout(() => selectMatch(replaceIndexRef.current), 0);
  }, [editor, findText, replaceWith, getMatches, selectMatch]);

  const replaceAll = useCallback(() => {
    if (!editor || !findText) return;
    const matches = getMatches(findText);
    if (matches.length === 0) return;
    let tr = editor.state.tr;
    // 末尾→先頭の順に置換すると、前方の位置がズレず安全
    for (let k = matches.length - 1; k >= 0; k--) {
      tr = tr.insertText(replaceWith, matches[k].from, matches[k].to);
    }
    editor.view.dispatch(tr);
    setMatchInfo({ current: 0, total: 0 });
    replaceIndexRef.current = 0;
  }, [editor, findText, replaceWith, getMatches]);

  // findText が変わるたび先頭の一致へ
  useEffect(() => {
    if (!replaceOpen) return;
    if (findText) selectMatch(0); else setMatchInfo({ current: 0, total: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findText, replaceOpen]);

  // Ctrl+R（Cmd+R）で検索置換バーを開く。Electron/ブラウザのリロードは preventDefault で抑止。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        setReplaceOpen(true);
        setTimeout(() => findInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!slashOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => Math.min(i + 1, filteredCommands.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); if (filteredCommands[slashIndex]) applyCommand(filteredCommands[slashIndex]); }
      if (e.key === 'Escape')    { setSlashOpen(false); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [slashOpen, filteredCommands, slashIndex, applyCommand]);

  useEffect(() => {
    if (!ctxMenu && !pastePopup) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCtxMenu(null); setPastePopup(null); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ctxMenu, pastePopup]);

  const scheduleSave = useCallback(() => {
    if (highlightingRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!editor) return;
      onSave(titleValue.current, JSON.stringify(editor.getJSON()));
    }, 1200);
  }, [editor, onSave]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // highlightText が指定された場合、ブロック単位で検索して一時ハイライト（保存対象外、フォーカスなし）
  useEffect(() => {
    if (!editor || !highlightText) return;
    // Markdown 記号を除去（見出し ## や リスト - など）
    const search = highlightText.trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\*{1,3}/, '').replace(/\*{1,3}$/, '')
      .replace(/^_{1,3}/, '').replace(/_{1,3}$/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^>\s+/, '')
      .replace(/^`{1,3}/, '').replace(/`{1,3}$/, '')
      .trim()
      .slice(0, 80);
    if (!search) return;

    const timer = setTimeout(() => {
      let from = -1, to = -1;
      editor.state.doc.descendants((node, pos) => {
        if (from !== -1) return false;
        if (!node.isBlock) return true;
        const idx = node.textContent.indexOf(search);
        if (idx === -1) return true;
        from = pos + 1 + idx;
        to = from + search.length;
        return false;
      });
      if (from === -1) return;

      const capturedFrom = from;
      const capturedTo = to;

      // フォーカス・選択なしでハイライトマークを適用
      const highlightMark = editor.state.schema.marks.highlight?.create({ color: '#FDE047' });
      if (!highlightMark) return;
      highlightingRef.current = true;
      editor.view.dispatch(editor.state.tr.addMark(capturedFrom, capturedTo, highlightMark));

      // フォーカスなしでDOMスクロール
      try {
        const { node } = editor.view.domAtPos(capturedFrom + 1);
        const el = (node instanceof HTMLElement ? node : (node as ChildNode).parentElement) as HTMLElement | null;
        el?.closest('p,h1,h2,h3,h4,li,blockquote,div')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch { /* ignore */ }

      // クリック or 2秒後に解除
      const removeHighlight = () => {
        highlightingRef.current = false;
        const mark = editor.state.schema.marks.highlight;
        if (!mark) return;
        editor.view.dispatch(editor.state.tr.removeMark(capturedFrom, capturedTo, mark));
      };
      const autoTimer = setTimeout(removeHighlight, 2000);
      setTimeout(() => {
        document.addEventListener('click', () => { clearTimeout(autoTimer); removeHighlight(); }, { once: true });
      }, 100);
    }, 600);

    return () => clearTimeout(timer);
  }, [editor, highlightText]);

  // コンパクトモード: チェック済み行にクラスを付与してグレーアウト
  useEffect(() => {
    if (!compact || !editor) return;
    const updateRowClasses = () => {
      editor.view.dom.querySelectorAll('tr').forEach((tr) => {
        const checked = tr.querySelector('[data-type="taskItem"][data-checked="true"]');
        tr.classList.toggle('memo-row-checked', !!checked);
      });
    };
    editor.on('transaction', updateRowClasses);
    updateRowClasses();
    return () => { editor.off('transaction', updateRowClasses); };
  }, [compact, editor]);

  // テーブルホバーで + ボタン表示
  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom;

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as Element;
      const tableEl = target.closest('table');
      if (!tableEl) {
        if (tableButtonTimeoutRef.current) clearTimeout(tableButtonTimeoutRef.current);
        tableButtonTimeoutRef.current = setTimeout(() => setTableButtonInfo(null), 1500);
        return;
      }
      if (tableButtonTimeoutRef.current) clearTimeout(tableButtonTimeoutRef.current);
      const rect = tableEl.getBoundingClientRect();
      setTableButtonInfo({
        rowY: rect.bottom,
        colX: rect.right,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      });
    };

    const handleMouseLeave = () => {
      if (tableButtonTimeoutRef.current) clearTimeout(tableButtonTimeoutRef.current);
      tableButtonTimeoutRef.current = setTimeout(() => setTableButtonInfo(null), 1500);
    };

    editorEl.addEventListener('mousemove', handleMouseMove);
    editorEl.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      editorEl.removeEventListener('mousemove', handleMouseMove);
      editorEl.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor]);

  // annotation ホバー → tooltip 表示
  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom as HTMLElement;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const onMouseOver = (e: MouseEvent) => {
      const target = (e.target as Element).closest('.annotation-mark') as HTMLElement | null;
      if (!target) return;
      const note = target.dataset.note ?? '';
      if (!note) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const rect = target.getBoundingClientRect();
      setAnnotationTooltip({ text: note, x: rect.left + rect.width / 2, y: rect.top - 4 });
    };

    const onMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as Element | null;
      if (related?.closest('.annotation-mark') || related?.closest('.annotation-tooltip')) return;
      hideTimer = setTimeout(() => setAnnotationTooltip(null), 200);
    };

    editorEl.addEventListener('mouseover', onMouseOver);
    editorEl.addEventListener('mouseout', onMouseOut);
    return () => {
      editorEl.removeEventListener('mouseover', onMouseOver);
      editorEl.removeEventListener('mouseout', onMouseOut);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [editor]);

  // 左余白ドラッグでマーキー選択（クリックは無視、4px以上動いた時だけ発動）
  const handleOuterMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!contentDivRef.current || !editor) return;
    const contentRect = contentDivRef.current.getBoundingClientRect();
    if (e.clientX >= contentRect.left - 8) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let hasMoved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (!hasMoved) {
        if (dx < 4 && dy < 4) return;
        hasMoved = true;
      }
      const next = { x1: startX, y1: startY, x2: ev.clientX, y2: ev.clientY };
      marqueeRef.current = next;
      setMarquee({ ...next });
    };

    const onUp = (ev: MouseEvent) => {
      if (hasMoved) {
        const m = marqueeRef.current;
        if (m && editor) {
          const minY = Math.min(m.y1, ev.clientY);
          const maxY = Math.max(m.y1, ev.clientY);
          const midX = contentRect.left + 20;
          const startResult = editor.view.posAtCoords({ left: midX, top: minY + 2 });
          const endResult = editor.view.posAtCoords({ left: midX, top: maxY - 2 });
          if (startResult && endResult) {
            const $from = editor.state.doc.resolve(startResult.pos);
            const $to = editor.state.doc.resolve(endResult.pos);
            const fromD = $from.depth > 0 ? $from.depth : 1;
            const toD = $to.depth > 0 ? $to.depth : 1;
            const lineStart = $from.start(fromD);
            const lineEnd = $to.end(toD);
            editor.chain().focus().setTextSelection({ from: Math.min(lineStart, lineEnd), to: Math.max(lineStart, lineEnd) }).run();
          }
        }
      }
      marqueeRef.current = null;
      setMarquee(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [editor]);

  const handleRecord = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    let text = '';
    if (from !== to) {
      const slice = editor.state.doc.slice(from, to);
      const parts: string[] = [];
      slice.content.forEach((node) => parts.push(pmToMarkdown(node as unknown as PmNode)));
      text = parts.join('').trim();
    }
    if (onRecordText) { onRecordText(text); } else { setRecordText(text); }
    setCtxMenu(null);
  }, [editor, onRecordText]);

  useEffect(() => {
    if (recordTriggerRef) { recordTriggerRef.current = handleRecord; }
  }, [recordTriggerRef, handleRecord]);

  // 消化モーダル等から、現在の本文(TipTap JSON)を即時取得できるようにする
  useEffect(() => {
    if (contentGetterRef) { contentGetterRef.current = () => (editor ? JSON.stringify(editor.getJSON()) : ''); }
  }, [contentGetterRef, editor]);

  // 消化モーダル等から、現在のカーソル位置へブロックを挿入できるようにする
  useEffect(() => {
    if (insertAtCursorRef) { insertAtCursorRef.current = (nodes: object[]) => { editor?.chain().focus().insertContent(nodes).run(); }; }
  }, [insertAtCursorRef, editor]);

  const handleCtxCreatePage = useCallback(async () => {
    setCtxMenu(null);
    if (!editor || !onCreateSubPage) return;
    const newPage = await onCreateSubPage();
    editor.chain().focus().insertContent({
      type: 'pageLink',
      attrs: { href: `/notion-plus/${newPage.id}`, title: newPage.title || 'Untitled', icon: '📄' },
    }).run();
    await onSave(titleValue.current, JSON.stringify(editor.getJSON()));
    if (onPageNavigate) {
      onPageNavigate(`/notion-plus/${newPage.id}`);
    } else {
      router.push(`/notion-plus/${newPage.id}`);
    }
  }, [editor, onCreateSubPage, onSave, router, onPageNavigate]);

  const handleCtxCreateBook = useCallback(async () => {
    setCtxMenu(null);
    if (!editor || !user) return;
    // ブックページを作成してリンクブロックを挿入
    const newBook = await addPage(user.uid, { type: 'book' });
    editor.chain().focus().insertContent({
      type: 'pageLink',
      attrs: { href: `/notion-plus/${newBook.id}`, title: newBook.title || 'ブック', icon: '📖' },
    }).run();
    await onSave(titleValue.current, JSON.stringify(editor.getJSON()));
    if (onPageNavigate) {
      onPageNavigate(`/notion-plus/${newBook.id}`);
    } else {
      router.push(`/notion-plus/${newBook.id}`);
    }
  }, [editor, user, addPage, onSave, router, onPageNavigate]);

  const handleCtxCreateDatabase = useCallback(async () => {
    setCtxMenu(null);
    if (!editor || !user) return;
    const newDb = await addPage(user.uid, { type: 'database' });
    // インラインデータベースノードを挿入
    editor.chain().focus().insertContent({
      type: 'inlineDatabase',
      attrs: { databaseId: newDb.id, title: newDb.title || 'データベース' },
    }).run();
    await onSave(titleValue.current, JSON.stringify(editor.getJSON()));
  }, [editor, user, addPage, onSave]);

  const handleCtxCallout = useCallback(() => {
    setCtxMenu(null);
    editor?.chain().focus().insertContent({ type: 'callout', attrs: { background: '#FDE047' }, content: [{ type: 'paragraph' }] }).run();
  }, [editor]);

  // 右クリック→目次を挿入（スラッシュ /目次 と同じ挙動：既存の目次を消してページ最上部に1つ置く）
  const handleCtxToc = useCallback(() => {
    setCtxMenu(null);
    if (!editor) return;
    const { state, view } = editor;
    let tr = state.tr;
    const tocPos: { pos: number; size: number }[] = [];
    state.doc.descendants((node, pos) => { if (node.type.name === 'toc') tocPos.unshift({ pos, size: node.nodeSize }); });
    for (const { pos, size } of tocPos) tr = tr.delete(pos, pos + size);
    tr = tr.insert(0, state.schema.nodes.toc.create());
    view.dispatch(tr);
    editor.commands.focus();
  }, [editor]);

  const handleOpenAnnotationDialog = useCallback((pos: { x: number; y: number }) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return; // 選択なし
    // 既存の annotation があれば note を初期値に
    const existing = editor.state.doc.rangeHasMark(from, to, editor.state.schema.marks.annotation)
      ? (editor.state.doc.nodeAt(from)?.marks.find((m) => m.type.name === 'annotation')?.attrs.note as string ?? '')
      : '';
    savedAnnotationSelRef.current = { from, to };
    setAnnotationDraft(existing);
    setCtxMenu(null);
    setAnnotationDialogPos(pos);
  }, [editor]);

  const confirmAnnotation = useCallback(() => {
    if (!editor || !savedAnnotationSelRef.current) return;
    const { from, to } = savedAnnotationSelRef.current;
    if (annotationDraft.trim()) {
      editor.chain()
        .setTextSelection({ from, to })
        .setMark('annotation', { note: annotationDraft.trim() })
        .run();
    } else {
      editor.chain()
        .setTextSelection({ from, to })
        .unsetMark('annotation')
        .run();
    }
    setAnnotationDialogPos(null);
    setAnnotationDraft('');
    savedAnnotationSelRef.current = null;
    scheduleSave();
  }, [editor, annotationDraft, scheduleSave]);

  const handlePasteMention = useCallback(async () => {
    if (!pastePopup || !editor) return;
    const { url, range } = pastePopup;
    setPastePopup(null);
    setPasteLoading(true);
    try {
      const res = await fetch(`/api/url-preview?url=${encodeURIComponent(url)}`);
      const data = await res.json() as { title?: string; favicon?: string };
      // 先に貼ったURLテキストをメンションに置き換える
      editor.chain().focus().deleteRange(range).insertContentAt(range.from, { type: 'urlMention', attrs: { href: url, title: data.title ?? url, favicon: data.favicon ?? '' } }).run();
    } catch {
      // 失敗時はURLのまま（既に貼られている）なので何もしない
    } finally { setPasteLoading(false); }
  }, [pastePopup, editor]);

  // 「URLのまま」：既にリンク付きで貼られているのでポップアップを閉じるだけ
  const handlePasteUrl = useCallback(() => {
    setPastePopup(null);
  }, []);

  const handlePasteYoutube = useCallback(() => {
    if (!pastePopup || !editor) return;
    const { url, range } = pastePopup;
    setPastePopup(null);
    // 先に貼ったURLテキストをYouTube埋め込みに置き換える
    editor.chain().focus().deleteRange(range).setTextSelection(range.from).setYoutubeVideo({ src: url }).run();
  }, [pastePopup, editor]);

  useEffect(() => {
    if (!editor || !onEditorFocus) return;
    const handleFocus = () => onEditorFocus(editor);
    editor.on('focus', handleFocus);
    return () => { editor.off('focus', handleFocus); };
  }, [editor, onEditorFocus]);

  // ブック: 本文の見出し番号(CSSカウンタ)クラスをトグル。設定変更に即追従させる
  useEffect(() => {
    if (!editor) return;
    (editor.view.dom as HTMLElement).classList.toggle('notion-editor-booknum', !!numberHeadings);
  }, [editor, numberHeadings]);

  // ブック（固定書式バー）は上の余白を詰める＝タブ直下の無駄な空白帯を作らない。通常ページは従来どおり py-8
  // min-h-0: flexアイテムの既定 min-height:auto を無効化し、この枠自身を正しくスクロール容器にする
  //   （これが無いと中身ぶん伸びて外側<main>がスクロールし、書式バーの sticky 固定が効かない）
  const outerClass = `relative flex flex-1 overflow-y-auto ${stickyToolbar ? 'min-h-0 pb-8 pt-2' : 'py-8'} ${notionPlusLayout === 'center' ? 'justify-center px-6' : 'pl-16 pr-8'}`;

  return (
    <EditorHostContext.Provider value={editorHost}>
    <EditorUidContext.Provider value={user?.uid ?? ''}>
    <EditorPageIdContext.Provider value={notionPageId ?? ''}>
    <PageNavigationContext.Provider value={onPageNavigate ?? null}>
    <div
      className={outerClass}
      data-scroll-container=""
      style={{
        '--para-lh': notionPlusParaLineHeight,
        '--soft-lh': notionPlusSoftLineHeight,
        '--offset-bullet': `${notionPlusBlockOffsets?.bullet ?? 0}px`,
        '--offset-ol':     `${notionPlusBlockOffsets?.ol ?? 0}px`,
        '--offset-check':  `${notionPlusBlockOffsets?.check ?? 0}px`,
        '--offset-h1':     `${notionPlusBlockOffsets?.h1 ?? 0}px`,
        '--offset-h2':     `${notionPlusBlockOffsets?.h2 ?? 0}px`,
        '--offset-h3':     `${notionPlusBlockOffsets?.h3 ?? 0}px`,
        '--offset-h4':     `${notionPlusBlockOffsets?.h4 ?? 0}px`,
        '--offset-p':      `${notionPlusBlockOffsets?.p ?? 0}px`,
        '--offset-blockquote': `${notionPlusBlockOffsets?.blockquote ?? 0}px`,
        '--booknum-color': headingNumberColor ?? '#9ca3af',
      } as React.CSSProperties}
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      onMouseDown={handleOuterMouseDown}
    >
      <div className="w-full" ref={contentDivRef}>
        {!hideTitle && (
          <input
            ref={titleRef}
            defaultValue={initialTitle}
            placeholder="Untitled"
            onChange={(e) => { titleValue.current = e.target.value; scheduleSave(); }}
            className="mb-6 w-full border-none text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-200"
          />
        )}
        {!hideToolbar && editor && (
          stickyToolbar ? (
            // ブック: スクロールしても書式バーを上部に固定（コンパクト・無駄な余白なし）
            <div className="sticky top-0 z-20 mb-3 border-b border-gray-100 bg-white py-1">
              <Toolbar editor={editor} className="mb-0" />
            </div>
          ) : (
            <Toolbar editor={editor} />
          )
        )}
        {/* ブック: チャプター名を書式バーの下にタイトルとして表示。本文H1(1.875rem)より大きく＋背景色で目立たせる */}
        {chapterHeading && (
          <div className="mb-6 mt-1 flex items-center gap-3 rounded-xl bg-brand-50 px-5 py-4">
            <span className="h-9 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <h1 className="text-4xl font-bold leading-tight text-brand-700">{chapterHeading}</h1>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* スラッシュコマンドメニュー */}
      {slashOpen && filteredCommands.length > 0 && (
        <div className="fixed z-50 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left, maxHeight: 'min(400px, 80vh)' }}>
          <p className="px-3 py-1 text-xs font-medium text-gray-400">コマンド</p>
          {filteredCommands.map((cmd, i) => (
            <button key={cmd.label} ref={i === slashIndex ? activeSlashItemRef : undefined} onMouseDown={(e) => { e.preventDefault(); applyCommand(cmd); }}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${i === slashIndex ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-bold text-gray-500">{cmd.icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-700">{cmd.label}</p>
                <p className="text-xs text-gray-400">{cmd.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* コンテキストメニュー */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[65]" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-[70] w-56 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl" style={{ top: ctxMenu.y, left: ctxMenu.x, transform: 'translateY(-50%)' }}>

            {/* ── 書式セクション ─────────────────────────────── */}
            <div className="border-b border-gray-100 px-2 pt-2 pb-1.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">書式</p>
              <div className="flex flex-wrap items-center gap-0.5">
                {/* インライン書式 */}
                {[
                  { label: <strong>B</strong>,   title: '太字 (Ctrl+B)',   active: editor?.isActive('bold'),      act: () => editor?.chain().focus().toggleBold().run() },
                  { label: <em>I</em>,            title: '斜体 (Ctrl+I)',   active: editor?.isActive('italic'),    act: () => editor?.chain().focus().toggleItalic().run() },
                  { label: <u>U</u>,              title: '下線 (Ctrl+U)',   active: editor?.isActive('underline'), act: () => editor?.chain().focus().toggleUnderline().run() },
                  { label: <s>S</s>,              title: '打消し',           active: editor?.isActive('strike'),    act: () => editor?.chain().focus().toggleStrike().run() },
                  { label: <code>`</code>,        title: 'インラインコード', active: editor?.isActive('code'),      act: () => editor?.chain().focus().toggleCode().run() },
                ].map((b, i) => (
                  <button key={i} title={b.title}
                    onMouseDown={(e) => { e.preventDefault(); b.act(); setCtxMenu(null); }}
                    className={`rounded px-2 py-1 text-xs transition ${b.active ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {b.label}
                  </button>
                ))}
                <span className="mx-0.5 self-stretch border-r border-gray-100" />
                {/* 見出し */}
                {([1, 2, 3] as const).map((level) => (
                  <button key={level} title={`見出し${level}`}
                    onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level }).run(); setCtxMenu(null); }}
                    className={`rounded px-2 py-1 text-xs font-bold transition ${editor?.isActive('heading', { level }) ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    H{level}
                  </button>
                ))}
                {editor?.isActive('heading') && (
                  <button title="見出しの下に区切り線を引く"
                    onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().updateAttributes('heading', { underline: !editor.getAttributes('heading').underline }).run(); setCtxMenu(null); }}
                    className={`rounded px-2 py-1 text-xs font-bold transition ${editor?.getAttributes('heading').underline ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <span className="border-b-2 border-current pb-px leading-none">H</span>
                  </button>
                )}
                <span className="mx-0.5 self-stretch border-r border-gray-100" />
                {/* リスト */}
                {[
                  { label: '•',  title: '箇条書き',       active: editor?.isActive('bulletList'),  act: () => editor?.chain().focus().toggleBulletList().run() },
                  { label: '1.', title: '番号付きリスト', active: editor?.isActive('orderedList'), act: () => editor?.chain().focus().toggleOrderedList().run() },
                  { label: '☑',  title: 'チェックリスト', active: editor?.isActive('taskList'),    act: () => editor?.chain().focus().toggleTaskList().run() },
                ].map((b, i) => (
                  <button key={i} title={b.title}
                    onMouseDown={(e) => { e.preventDefault(); b.act(); setCtxMenu(null); }}
                    className={`rounded px-2 py-1 text-xs transition ${b.active ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {b.label}
                  </button>
                ))}
                <span className="mx-0.5 self-stretch border-r border-gray-100" />
                {/* ブロック */}
                {[
                  { label: '❝',   title: '引用',         active: editor?.isActive('blockquote'), act: () => editor?.chain().focus().toggleBlockquote().run() },
                  { label: '</>', title: 'コードブロック', active: editor?.isActive('codeBlock'),  act: () => editor?.chain().focus().toggleCodeBlock().run() },
                ].map((b, i) => (
                  <button key={i} title={b.title}
                    onMouseDown={(e) => { e.preventDefault(); b.act(); setCtxMenu(null); }}
                    className={`rounded px-2 py-1 text-xs transition ${b.active ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 文字色・背景色セクション ───────────────────── */}
            <div className="border-b border-gray-100 px-2 pt-1.5 pb-1.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">文字色</p>
              <div className="flex flex-wrap gap-1">
                {/* ツールバーと同じ正規パレット(TEXT_COLORS)。見本は実際の適用色で表示し色ズレをなくす */}
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.label}
                    title={c.label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (c.value) editor?.chain().focus().setColor(c.value).run();
                      else editor?.chain().focus().unsetColor().run();
                      setCtxMenu(null);
                    }}
                    className="h-5 w-5 rounded-full ring-offset-1 hover:ring-2 hover:ring-gray-400"
                    style={{ background: c.value || '#1f2937', border: c.value ? undefined : '1px solid #d1d5db' }}
                  />
                ))}
              </div>
              <p className="mb-1 mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">背景色</p>
              <div className="flex flex-wrap gap-1">
                {/* ツールバー・コールアウト・セクションと同じ正規パレット(BG_COLORS)。黄=#FDE047 で統一 */}
                {BG_COLORS.map((c) => (
                  <button
                    key={c.label}
                    title={c.label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (c.value) editor?.chain().focus().setHighlight({ color: c.value }).run();
                      else editor?.chain().focus().unsetHighlight().run();
                      setCtxMenu(null);
                    }}
                    className="h-5 w-5 rounded-full ring-offset-1 hover:ring-2 hover:ring-gray-400"
                    style={{ background: c.value || '#ffffff', border: c.value ? '1px solid #e5e7eb' : '1px solid #d1d5db' }}
                  />
                ))}
              </div>
            </div>

            {/* ── アクションセクション ───────────────────────── */}
            <div className="py-1">
              {onCreateSubPage && (
                <button onClick={handleCtxCreatePage} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  <span className="text-base">📄</span>新規ページを作成
                </button>
              )}
              {onCreateSubPage && (
                <button onClick={handleCtxCreateBook} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  <span className="text-base">📖</span>ブックを作成
                </button>
              )}
              <button onClick={handleCtxCreateDatabase} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">📊</span>データベースを作成
              </button>
              <button onClick={handleCtxCallout} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">💡</span>コールアウトを挿入
              </button>
              <button onClick={handleCtxToc} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">≡</span>目次を挿入
              </button>
              {notionPageId && (
                <button
                  onClick={() => { setCtxMenu(null); copyNotionPlusPageId(notionPageId, titleValue.current || initialTitle); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="text-base">🆔</span>このページのIDをコピー（NP:…）
                </button>
              )}
              <button
                onClick={() => { setCtxMenu(null); editor?.commands.focus(); setTimeout(() => document.execCommand('paste'), 10); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <span className="text-base">📋</span>貼り付け
              </button>
              <button onClick={handleRecord} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">📚</span>学習リストに記録
              </button>
              {editor && !editor.state.selection.empty && (
                <button
                  onMouseDown={(e) => { e.preventDefault(); handleOpenAnnotationDialog({ x: ctxMenu?.x ?? 0, y: ctxMenu?.y ?? 0 }); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-yellow-700 hover:bg-yellow-50"
                >
                  <span className="text-base">💡</span>Tip を追加
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* 学習記録ダイアログ */}
      {recordText !== null && (
        <RecordDialog initialContent={recordText} notionPageId={notionPageId} notionPagePath={notionPagePath} onClose={() => setRecordText(null)} />
      )}

      {/* Annotation 追加ダイアログ */}
      {annotationDialogPos && (
        <>
          <div className="fixed inset-0 z-[75]" onClick={() => setAnnotationDialogPos(null)} />
          <div
            className="fixed z-[80] w-64 rounded-xl border border-yellow-200 bg-white p-3 shadow-xl"
            style={{ top: annotationDialogPos.y, left: annotationDialogPos.x, transform: 'translateY(-110%)' }}
          >
            <p className="mb-2 text-xs font-semibold text-yellow-700">💡 Tip を追加</p>
            <textarea
              autoFocus
              value={annotationDraft}
              onChange={(e) => setAnnotationDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmAnnotation(); } if (e.key === 'Escape') setAnnotationDialogPos(null); }}
              placeholder="メモを入力... (Enter で確定)"
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-yellow-400"
            />
            <div className="mt-2 flex justify-end gap-2">
              {annotationDraft === '' && savedAnnotationSelRef.current && (
                <button
                  onClick={() => { confirmAnnotation(); }}
                  className="text-xs text-red-400 hover:text-red-600"
                >削除</button>
              )}
              <button onClick={() => setAnnotationDialogPos(null)} className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100">キャンセル</button>
              <button onClick={confirmAnnotation} className="rounded bg-yellow-400 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-500">確定</button>
            </div>
          </div>
        </>
      )}

      {/* Annotation ホバー tooltip */}
      {annotationTooltip && (
        <div
          className="annotation-tooltip pointer-events-none fixed z-[90] max-w-xs rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 shadow-lg"
          style={{ left: annotationTooltip.x, top: annotationTooltip.y, transform: 'translate(-50%, -100%)' }}
          onMouseEnter={() => setAnnotationTooltip(annotationTooltip)}
          onMouseLeave={() => setAnnotationTooltip(null)}
        >
          💡 {annotationTooltip.text}
        </div>
      )}

      {/* マーキー選択矩形 */}
      {marquee && (
        <div
          className="pointer-events-none fixed z-30 border border-blue-400 bg-blue-400/10"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
          }}
        />
      )}

      {/* テーブルホバー + ボタン */}
      {tableButtonInfo && (
        <>
          {/* 行追加ボタン（テーブル下） - 大きめのpadding で hit area を確保 */}
          <div
            className="fixed z-40"
            style={{ top: tableButtonInfo.rowY, left: tableButtonInfo.centerX - 20, padding: '8px 32px 20px' }}
            onMouseEnter={() => { if (tableButtonTimeoutRef.current) clearTimeout(tableButtonTimeoutRef.current); }}
            onMouseLeave={() => { tableButtonTimeoutRef.current = setTimeout(() => setTableButtonInfo(null), 1500); }}
          >
            <button
              className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-500 shadow-sm hover:border-brand-400 hover:text-brand-500"
              onClick={() => editor?.chain().focus().addRowAfter().run()}
              title="行を追加"
            >+</button>
          </div>
          {/* 列追加ボタン（テーブル右） */}
          <div
            className="fixed z-40"
            style={{ top: tableButtonInfo.centerY - 20, left: tableButtonInfo.colX, padding: '20px 20px 20px 8px' }}
            onMouseEnter={() => { if (tableButtonTimeoutRef.current) clearTimeout(tableButtonTimeoutRef.current); }}
            onMouseLeave={() => { tableButtonTimeoutRef.current = setTimeout(() => setTableButtonInfo(null), 1500); }}
          >
            <button
              className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-500 shadow-sm hover:border-brand-400 hover:text-brand-500"
              onClick={() => editor?.chain().focus().addColumnAfter().run()}
              title="列を追加"
            >+</button>
          </div>
        </>
      )}

      {/* ページ内 検索＆置換バー（Ctrl+R） */}
      {replaceOpen && (
        <div className="fixed right-6 top-20 z-[1100] w-[320px] rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xl">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">検索＆置換</p>
            <button onClick={() => setReplaceOpen(false)} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="閉じる (Esc)">✕</button>
          </div>
          <div className="flex items-center gap-1">
            <input
              ref={findInputRef}
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); selectMatch(replaceIndexRef.current + (e.shiftKey ? -1 : 1)); }
                if (e.key === 'Escape') { e.preventDefault(); setReplaceOpen(false); }
              }}
              placeholder="検索する文字"
              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
            />
            <span className="w-14 shrink-0 text-center text-[11px] text-gray-400">{matchInfo.total > 0 ? `${matchInfo.current}/${matchInfo.total}` : '0件'}</span>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <input
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setReplaceOpen(false); } }}
              placeholder="置換する文字（空＝削除）"
              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
            />
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <button onClick={() => selectMatch(replaceIndexRef.current - 1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50" title="前へ">↑</button>
            <button onClick={() => selectMatch(replaceIndexRef.current + 1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50" title="次へ">↓</button>
            <div className="flex-1" />
            <button onClick={replaceCurrent} disabled={matchInfo.total === 0} className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40">置換</button>
            <button onClick={replaceAll} disabled={matchInfo.total === 0} className="rounded bg-brand-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-40">すべて置換</button>
          </div>
        </div>
      )}

      {/* URL ペーストポップアップ */}
      {pastePopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPastePopup(null)} />
          <div className="fixed z-50 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-2xl" style={{ top: pastePopup.pos.top, left: pastePopup.pos.left }}>
            <p className="px-3 py-1.5 text-xs font-medium text-gray-400">変換する？（このままでもOK）</p>
            <button onClick={handlePasteMention} disabled={pasteLoading}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <span className="text-base">🔗</span>
              <div><p className="font-medium">メンション</p><p className="text-xs text-gray-400">ページタイトル＋アイコン</p></div>
            </button>
            {pastePopup.isYoutube && (
              <button onClick={handlePasteYoutube} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">▶</span>
                <div><p className="font-medium">YouTube 埋め込み</p><p className="text-xs text-gray-400">プレイヤーを挿入</p></div>
              </button>
            )}
            <button onClick={handlePasteUrl} className="flex w-full items-center gap-2.5 border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
              <span className="text-base">🌐</span>
              <div><p className="font-medium">URLのまま</p><p className="text-xs text-gray-400">変換しない（リンク付きテキスト）</p></div>
            </button>
          </div>
        </>
      )}

      {/* 既存ページへのショートカット挿入ピッカー（/ページリンク）＝ふたメモと共通部品 */}
      {pageLinkPicker && (
        <PageLinkPicker
          top={pageLinkPicker.top}
          left={pageLinkPicker.left}
          onClose={() => setPageLinkPicker(null)}
          onPick={(p) => insertPageShortcut(p)}
        />
      )}

      {/* 特急メモ挿入ピッカー（/特急メモ）＝カーソル位置に消化 */}
      {memoPicker && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onMouseDown={() => setMemoPicker(null)} />
          <div style={{ position: 'fixed', top: memoPicker.top, left: memoPicker.left, width: 300 }}
            className="z-[1001] rounded-xl border border-gray-200 bg-white p-2 shadow-2xl">
            <p className="px-1 pb-1 text-xs font-medium text-gray-400">ここに挿入する特急メモを選ぶ（消化）</p>
            <input autoFocus value={memoQuery} onChange={(e) => setMemoQuery(e.target.value)} placeholder="メモを検索..."
              className="mb-1 w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
            <div className="max-h-60 overflow-y-auto">
              {(() => {
                const list = learningItems
                  .filter((m) => !m.notionPageId) // 未消化（特急メモ）のみ
                  .filter((m) => `${m.title} ${m.content}`.toLowerCase().includes(memoQuery.toLowerCase()))
                  .slice()
                  .sort((a, b) => new Date(b.createdAt ?? b.dateKey).getTime() - new Date(a.createdAt ?? a.dateKey).getTime())
                  .slice(0, 40);
                if (list.length === 0) return <p className="px-2 py-2 text-xs text-gray-400">未消化の特急メモはありません</p>;
                return list.map((m) => (
                  <button key={m.id} onMouseDown={(e) => { e.preventDefault(); insertMemoAtCursor(m); }}
                    className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left hover:bg-amber-50">
                    <span className="w-full truncate text-xs font-medium text-gray-700">⚡ {m.title || '（タイトルなし）'}</span>
                    {m.content && <span className="w-full truncate text-[10px] text-gray-400">{m.content}</span>}
                  </button>
                ));
              })()}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
    </PageNavigationContext.Provider>
    </EditorPageIdContext.Provider>
    </EditorUidContext.Provider>
    </EditorHostContext.Provider>
  );
}

