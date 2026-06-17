'use client';

import { Fragment, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';
import { NotionEditor } from '@/components/editor/NotionEditor';
import { RegisterCelebration } from '@/components/RegisterCelebration';
import { IconImagePreview } from '@/components/IconImagePreview';
import { chapterLabel } from '@/lib/bookNumbering';
import { type NotionPage, parseBookChapters, serializeBookChapters, createBookChapter, type BookChapter } from '@study-tracker/core';

function isImageSrc(s: string) {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:');
}

const ICON_PRESETS = [
  '📄','📝','📚','📖','📓','📔','📒','📕','📗','📘','📙','📋','📊','📈','💡',
  '🔖','📌','📍','🗂️','📁','📂','💼','🖥️','💻','📱','🎓','🏫','✏️','📏','📐',
  '🗒️','🗓️','📆','📅','⏰','🔐','🔑','🛠️','⚙️','🔧','🔬','🔭','🧪','🧬',
  '⭐','🌟','✨','🔥','💯','🎉','🏆','🥇','👑','💎','🎯','✅','⚡','💪',
  '❤️','🧡','💛','💚','💙','💜','🤍','💔','🌈','😀','😊','🥳','😎','🤓',
  '🌱','🌿','🍀','🌸','🌺','🌻','🦋','🐉','🦁','🐯','🦊','🐺','🦅','🦉',
  '💰','💴','💸','🤝','🏢','📊','📈','💹','🌍','🗺️','🏔️','🌊','🎨','🎵',
  '🎮','⚽','🏀','🎾','⚾','🏈','🎸','🎹','🎺','🎻','🎤','🎬','📷','🎠',
];


// ── ユーティリティ ────────────────────────────────────────────────────

export function extractTextFromTipTap(content: string): string {
  try {
    const doc = JSON.parse(content) as { content?: unknown[] };
    const parts: string[] = [];
    function walk(node: { type?: string; text?: string; content?: unknown[] }) {
      if (node.text) parts.push(node.text);
      if (node.content) (node.content as typeof node[]).forEach(walk);
    }
    if (doc.content) (doc.content as typeof doc[]).forEach(walk);
    return parts.join(' ');
  } catch { return ''; }
}

export function getSnippet(text: string, query: string, pad = 50): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, pad * 2);
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + query.length + pad);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*{1,3}([^*]*)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]*)_{1,3}/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/^[>\-*+]\s+/gm, '')
    .replace(/[◆▶▲▼●○■□★☆◇]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx: number;
  while ((idx = lower.indexOf(q, cursor)) !== -1) {
    if (idx > cursor) parts.push(<span key={`t${cursor}`}>{text.slice(cursor, idx)}</span>);
    parts.push(<mark key={`m${idx}`} className="rounded bg-yellow-200 px-0.5 text-gray-900">{text.slice(idx, idx + q.length)}</mark>);
    cursor = idx + q.length;
  }
  if (cursor < text.length) parts.push(<span key={`t${cursor}`}>{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

function isImgSrc(s: string) {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:');
}

function PagePickerIcon({ icon }: { icon: string }) {
  if (isImgSrc(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-5 w-5 shrink-0 rounded-sm object-cover" />;
  }
  return <span className="shrink-0 text-base leading-none">{icon}</span>;
}

function buildBreadcrumbs(pages: NotionPage[], currentId: string): NotionPage[] {
  const map = new Map(pages.map((p) => [p.id, p]));
  const path: NotionPage[] = [];
  let cur = map.get(currentId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return path;
}

const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500';

// ── 確認ダイアログ ────────────────────────────────────────────────────

function ConfirmDialog({ text, pageId, onConfirm, onCancel }: {
  text: string;
  pageId: string;
  onConfirm: (title: string, content: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { pages } = useNotionPageStore();
  const page = pages.find((p) => p.id === pageId);
  const firstLine = text.split('\n').find((l) => l.trim())?.trim() ?? '';
  const [title, setTitle] = useState(stripMarkdown(firstLine).slice(0, 80));
  const [content, setContent] = useState(text);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    try { await onConfirm(title.trim(), content.trim()); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-gray-800">📚 学習アイテムとして登録</h3>
        {page && (
          <p className="mb-4 flex items-center gap-1 text-xs text-gray-400">
            <span>📁</span><span>{page.title || 'Untitled'}</span>
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">タイトル</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className={cls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">内容（選択テキスト）</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} className={cls} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button
            onClick={handleSubmit}
            disabled={saving || (!title.trim() && !content.trim())}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? '登録中...' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 新規ページダイアログ ──────────────────────────────────────────────

function NewPageDialog({ onConfirm, onCancel }: {
  onConfirm: (title: string, icon: string, type: 'note' | 'book') => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('📄');
  const [pageType, setPageType] = useState<'note' | 'book'>('note');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconUrl, setIconUrl] = useState('');
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!iconPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (iconRef.current && !iconRef.current.contains(e.target as Node)) setIconPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [iconPickerOpen]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-semibold text-gray-800">📝 新規ページを作成</h3>

        {/* アイコン + タイトル */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative shrink-0" ref={iconRef}>
            <button
              onClick={() => setIconPickerOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-2xl transition hover:bg-gray-50"
              title="アイコンを変更"
            >
              {isImgSrc(icon)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={icon} alt="" className="h-8 w-8 rounded object-cover" />
                : icon}
            </button>
            {iconPickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                <div className="mb-2 flex gap-1">
                  <input
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    placeholder="画像URL..."
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none"
                  />
                  <button
                    onClick={() => { if (iconUrl) { setIcon(iconUrl); setIconPickerOpen(false); } }}
                    disabled={!iconUrl}
                    className="rounded bg-brand-500 px-2 py-1 text-xs text-white disabled:opacity-40"
                  >設定</button>
                </div>
                <div className="grid max-h-40 grid-cols-8 gap-0.5 overflow-y-auto">
                  {ICON_PRESETS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => { setIcon(ic); setIconPickerOpen(false); }}
                      className={`rounded p-1 text-base hover:bg-gray-100 ${icon === ic ? 'bg-brand-50 ring-1 ring-brand-400' : ''}`}
                    >{ic}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConfirm(title.trim(), icon, pageType)}
            placeholder="タイトル（任意）"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
        </div>

        {/* タイプ選択 */}
        <div className="mb-5 flex gap-2">
          <button
            onClick={() => { setPageType('note'); if (icon === '📚') setIcon('📄'); }}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl border p-3 text-xs transition ${
              pageType === 'note' ? 'border-brand-400 bg-brand-50 text-brand-600 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <span className="text-2xl">📄</span>
            <span>ノート</span>
          </button>
          <button
            onClick={() => { setPageType('book'); if (icon === '📄') setIcon('📚'); }}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl border p-3 text-xs transition ${
              pageType === 'book' ? 'border-brand-400 bg-brand-50 text-brand-600 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <span className="text-2xl">📚</span>
            <span>ブック</span>
            <span className="text-[9px] opacity-60">チャプター管理</span>
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button
            onClick={() => onConfirm(title.trim(), icon, pageType)}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >作成する</button>
        </div>
      </div>
    </div>
  );
}

// ── AddItemDialog（左右分割ビュー）────────────────────────────────────

export function AddItemDialog({ uid, onClose, onAfterRecord }: {
  uid: string;
  onClose: () => void;
  onAfterRecord?: () => void;
}) {
  const { add: addItem } = useLearningStore();
  const { pages, add: addPage, update } = useNotionPageStore();
  const { user } = useAuthStore();
  const [recordedText, setRecordedText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [bigToast, setBigToast] = useState(false);
  const bigToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const recordTriggerRef = useRef<(() => void) | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconUrlDraft, setIconUrlDraft] = useState('');
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const [newPageDialog, setNewPageDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ pageId: string; x: number; y: number } | null>(null);
  const [bookChapters, setBookChapters] = useState<BookChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string>('');
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => () => {
    if (bigToastTimerRef.current) clearTimeout(bigToastTimerRef.current);
  }, []);

  // アイコンピッカーの外クリックで閉じる
  useEffect(() => {
    if (!iconPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) setIconPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [iconPickerOpen]);

  // コンテキストメニューの外クリックで閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    const titleMatches: typeof pages = [];
    const contentMatches: Array<{ page: (typeof pages)[0]; snippet: string }> = [];
    for (const page of pages) {
      const titleMatch = (page.title || 'Untitled').toLowerCase().includes(lower);
      if (titleMatch) { titleMatches.push(page); continue; }
      const text = extractTextFromTipTap(page.content);
      if (text.toLowerCase().includes(lower)) {
        contentMatches.push({ page, snippet: getSnippet(text, q) });
      }
    }
    return { titleMatches, contentMatches };
  }, [searchQuery, pages]);

  const favorites = useMemo(() =>
    pages
      .filter((p) => p.isFavorite && p.id !== WORKSPACE_ID)
      .sort((a, b) => a.order - b.order),
    [pages]
  );

  const roots = useMemo(() =>
    pages
      .filter((p) => !p.parentId && p.id !== WORKSPACE_ID)
      .sort((a, b) => a.order - b.order),
    [pages]
  );

  const [selectedPageId, setSelectedPageId] = useState<string | null>(() => roots[0]?.id ?? null);

  const navigateTo = useCallback((id: string) => {
    setSelectedPageId((cur) => { if (cur) setPageHistory((h) => [...h, cur]); return id; });
  }, []);

  const handleBack = useCallback(() => {
    setPageHistory((h) => {
      const prev = h[h.length - 1];
      if (prev !== undefined) setSelectedPageId(prev);
      return h.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); handleBack(); } };
    document.addEventListener('mouseup', handler);
    return () => document.removeEventListener('mouseup', handler);
  }, [handleBack]);

  const handleCreateSubPageInModal = useCallback(async () => {
    const newPage = await addPage(uid);
    navigateTo(newPage.id);
    return { id: newPage.id, title: newPage.title };
  }, [uid, addPage, navigateTo]);

  const selectedPage = selectedPageId ? pages.find((p) => p.id === selectedPageId) ?? null : null;

  // ブックの chapters を selectedPage に合わせて初期化
  useEffect(() => {
    if (!selectedPage || selectedPage.type !== 'book') {
      setBookChapters([]);
      setActiveChapterId('');
      return;
    }
    const chapters = parseBookChapters(selectedPage.content);
    setBookChapters(chapters);
    setActiveChapterId((prev) => {
      const still = chapters.find((c) => c.id === prev);
      return still ? prev : (chapters[0]?.id ?? '');
    });
    setEditorKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPage?.id, selectedPage?.type]);

  const handleSave = useCallback(async (title: string, content: string) => {
    if (!user || !selectedPageId) return;
    await update(user.uid, selectedPageId, { title, content });
  }, [user, selectedPageId, update]);

  const handleBookChapterSave = useCallback(async (_title: string, content: string) => {
    if (!user || !selectedPageId || !activeChapterId) return;
    const updated = bookChapters.map((c) => c.id === activeChapterId ? { ...c, content } : c);
    setBookChapters(updated);
    await update(user.uid, selectedPageId, { content: serializeBookChapters(updated) });
  }, [user, selectedPageId, activeChapterId, bookChapters, update]);

  const handleAddBookChapter = useCallback(async () => {
    if (!user || !selectedPageId) return;
    const newChapter = createBookChapter(bookChapters.length);
    const updated = [...bookChapters, newChapter];
    setBookChapters(updated);
    setActiveChapterId(newChapter.id);
    setEditorKey((k) => k + 1);
    await update(user.uid, selectedPageId, { content: serializeBookChapters(updated) });
  }, [user, selectedPageId, bookChapters, update]);

  const handleIconChange = useCallback(async (icon: string) => {
    if (!user || !selectedPageId) return;
    await update(user.uid, selectedPageId, { icon });
    setIconPickerOpen(false);
    setIconUrlDraft('');
  }, [user, selectedPageId, update]);

  const handleRecord = (text: string) => {
    setRecordedText(text);
    setConfirming(true);
  };

  const handleConfirm = async (title: string, content: string) => {
    if (!selectedPageId) return;
    const page = pages.find((p) => p.id === selectedPageId);
    await addItem(uid, {
      dateKey: toDateKey(new Date()),
      title,
      content,
      sortOrder: 0,
      notionPageId: selectedPageId,
      notionPagePath: page?.title || 'Untitled',
    });
    setConfirming(false);
    if (bigToastTimerRef.current) clearTimeout(bigToastTimerRef.current);
    setBigToast(true);
    bigToastTimerRef.current = setTimeout(() => setBigToast(false), 1800);
    onAfterRecord?.();
  };

  const handleCreateWithOptions = async (title: string, icon: string, type: 'note' | 'book') => {
    setNewPageDialog(false);
    setCreating(true);
    try {
      const page = await addPage(uid, { type: type === 'book' ? 'book' : undefined });
      if (title || icon !== '📄') {
        await update(uid, page.id, { title: title || 'Untitled', icon });
      }
      setSelectedPageId(page.id);
    } finally {
      setCreating(false);
    }
  };

  const convertToBook = useCallback(async (pageId: string) => {
    if (!user) { setContextMenu(null); return; }
    const p = pages.find((x) => x.id === pageId);
    if (!p) { setContextMenu(null); return; }
    // 現在の本文を第1章へ退避してブック化（内容を保持）
    const firstChapter = { ...createBookChapter(0), content: p.content };
    await update(user.uid, pageId, {
      type: 'book',
      icon: p.icon === '📄' ? '📖' : p.icon,
      content: serializeBookChapters([firstChapter]),
    });
    setContextMenu(null);
  }, [user, update, pages]);

  const convertToNote = useCallback(async (pageId: string) => {
    if (!user) { setContextMenu(null); return; }
    const p = pages.find((x) => x.id === pageId);
    if (!p) { setContextMenu(null); return; }
    // 全チャプターの本文を1ページへ結合（内容を保持）。type:'page' で確実にノート化
    const chapters = parseBookChapters(p.content);
    const merged: { type: 'doc'; content: unknown[] } = { type: 'doc', content: [] };
    for (const ch of chapters) {
      try {
        const doc = JSON.parse(ch.content) as { content?: unknown[] };
        if (Array.isArray(doc?.content)) merged.content.push(...doc.content);
      } catch { /* ignore */ }
    }
    await update(user.uid, pageId, { type: 'page', content: JSON.stringify(merged) });
    setContextMenu(null);
  }, [user, update, pages]);

  const breadcrumbs = selectedPageId ? buildBreadcrumbs(pages, selectedPageId) : [];

  // ブックのアクティブチャプターコンテンツ
  const activeChapter = bookChapters.find((c) => c.id === activeChapterId);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
        <div className="flex w-full overflow-hidden rounded-2xl shadow-2xl bg-white" style={{ height: 'calc(100% - 1rem)' }}>
          {/* 左パネル: ページリスト */}
          <div className="flex w-60 flex-col border-r border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
              <span className="text-sm font-semibold text-gray-700">📝 ページを選択</span>
              <button
                onClick={() => setNewPageDialog(true)}
                disabled={creating}
                title="新規ページ"
                className="rounded p-1 text-lg leading-none text-gray-400 hover:bg-gray-200 hover:text-brand-500 disabled:opacity-50"
              >+</button>
            </div>

            {/* 検索 */}
            <div className="border-b border-gray-100 px-2 py-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 focus-within:border-brand-400">
                <span className="text-xs text-gray-400">🔍</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ノートを検索..."
                  className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-300"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                )}
              </div>
            </div>

            <nav className="flex flex-1 flex-col overflow-hidden">
              {searchResults ? (
                <div className="flex-1 overflow-y-auto px-1 py-1">
                  <div className="space-y-1 px-1 py-1">
                    {searchResults.titleMatches.length === 0 && searchResults.contentMatches.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-gray-400">一致するノートがありません</p>
                    )}
                    {searchResults.titleMatches.length > 0 && (
                      <>
                        <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">ノート名</p>
                        {searchResults.titleMatches.map((page) => (
                          <button
                            key={page.id}
                            onClick={() => { setSelectedPageId(page.id); setSearchQuery(''); }}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ pageId: page.id, x: e.clientX, y: e.clientY }); }}
                            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${selectedPageId === page.id ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
                          >
                            <PagePickerIcon icon={page.icon} />
                            <span className="min-w-0 flex-1 truncate text-left">
                              <HighlightText text={page.title || 'Untitled'} query={searchQuery} />
                            </span>
                            {page.type === 'book' && <span className="shrink-0 text-[9px] text-gray-300">本</span>}
                          </button>
                        ))}
                      </>
                    )}
                    {searchResults.contentMatches.length > 0 && (
                      <>
                        <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">テキスト</p>
                        {searchResults.contentMatches.map(({ page, snippet }) => (
                          <button
                            key={page.id}
                            onClick={() => { setSelectedPageId(page.id); setSearchQuery(''); }}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ pageId: page.id, x: e.clientX, y: e.clientY }); }}
                            className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-xs transition-colors ${selectedPageId === page.id ? 'bg-white shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <PagePickerIcon icon={page.icon} />
                              <span className="font-medium text-gray-800">{page.title || 'Untitled'}</span>
                            </div>
                            <p className="line-clamp-2 pl-5 text-left text-[10px] leading-relaxed text-gray-400">
                              <HighlightText text={snippet} query={searchQuery} />
                            </p>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {favorites.length > 0 && (
                    <div className="shrink-0 border-b border-gray-100">
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-yellow-500">★ お気に入り</p>
                      <div className="px-1 pb-2">
                        {favorites.map((page) => (
                          <button
                            key={`fav-${page.id}`}
                            onClick={() => setSelectedPageId(page.id)}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ pageId: page.id, x: e.clientX, y: e.clientY }); }}
                            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${selectedPageId === page.id ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
                          >
                            <PagePickerIcon icon={page.icon} />
                            <span className="min-w-0 flex-1 truncate text-left">{page.title || 'Untitled'}</span>
                            {page.type === 'book' && <span className="shrink-0 text-[9px] text-gray-300">本</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex min-h-0 flex-1 flex-col">
                    <p className="shrink-0 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">ページ</p>
                    <div className="flex-1 overflow-y-auto px-1 pb-2">
                      <div className="space-y-0.5">
                        {roots.filter((p) => !p.isFavorite).map((page) => {
                          const children = pages.filter((p) => p.parentId === page.id).sort((a, b) => a.order - b.order);
                          const isExpanded = expandedIds.has(page.id);
                          const toggle = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(page.id)) next.delete(page.id); else next.add(page.id);
                              return next;
                            });
                          };
                          return (
                            <div key={page.id}>
                              <div className="flex items-center gap-0.5">
                                <button
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] text-gray-400 hover:bg-gray-200 ${children.length === 0 ? 'invisible' : ''}`}
                                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                                  onClick={toggle}
                                >▶</button>
                                <button
                                  onClick={() => setSelectedPageId(page.id)}
                                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ pageId: page.id, x: e.clientX, y: e.clientY }); }}
                                  className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${selectedPageId === page.id ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
                                >
                                  <PagePickerIcon icon={page.icon} />
                                  <span className="min-w-0 flex-1 truncate text-left">{page.title || 'Untitled'}</span>
                                  {page.type === 'book' && <span className="shrink-0 text-[9px] text-gray-300">本</span>}
                                </button>
                              </div>
                              {isExpanded && children.length > 0 && (
                                <div className="ml-5 border-l border-gray-200 pl-2 pt-0.5">
                                  {children.map((child) => (
                                    <button
                                      key={child.id}
                                      onClick={() => setSelectedPageId(child.id)}
                                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ pageId: child.id, x: e.clientX, y: e.clientY }); }}
                                      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${selectedPageId === child.id ? 'bg-white font-semibold text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
                                    >
                                      <PagePickerIcon icon={child.icon} />
                                      <span className="min-w-0 flex-1 truncate text-left">{child.title || 'Untitled'}</span>
                                      {child.type === 'book' && <span className="shrink-0 text-[9px] text-gray-300">本</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </nav>

            <div className="border-t border-gray-100 px-3 py-2.5">
              <button
                onClick={onClose}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <span>✕</span><span>閉じる</span>
              </button>
            </div>
          </div>

          {/* 右パネル: エディタ */}
          <div className="flex flex-1 flex-col">
            {/* ヘッダー */}
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* パンくず */}
                {breadcrumbs.length > 0 && (
                  <div className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap text-[10px] text-amber-500">
                    {breadcrumbs.map((p, i) => (
                      <Fragment key={p.id}>
                        {i > 0 && <span className="shrink-0 text-amber-300 mx-0.5">/</span>}
                        <button
                          onClick={() => setSelectedPageId(p.id)}
                          className="flex items-center gap-0.5 rounded px-0.5 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                        >
                          {isImgSrc(p.icon)
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.icon} alt="" className="h-3 w-3 rounded object-cover" />
                            : <span className="text-[11px]">{p.icon}</span>
                          }
                          <span className="max-w-[80px] truncate">{p.title || 'Untitled'}</span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                )}
                {/* 操作バー */}
                <div className="flex items-center gap-2">
                  {/* アイコン */}
                  {selectedPage && (
                    <div className="relative shrink-0" ref={iconPickerRef}>
                      <button
                        onClick={() => setIconPickerOpen((v) => !v)}
                        className="flex items-center justify-center rounded p-1 hover:bg-amber-100"
                        title="アイコンを変更"
                      >
                        {isImageSrc(selectedPage.icon) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={selectedPage.icon} alt="" className="h-6 w-6 rounded object-cover" />
                        ) : (
                          <span className="text-lg leading-none">{selectedPage.icon}</span>
                        )}
                      </button>
                      {iconPickerOpen && (
                        <div className="absolute left-0 top-full z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                          {/* 現在のアイコンが画像（外部URL/貼付）なら、何の画像か分かるよう大きめにプレビュー（クリックで拡大） */}
                          {isImageSrc(selectedPage.icon) && <IconImagePreview src={selectedPage.icon} />}
                          <p className="mb-1 text-xs font-medium text-gray-400">画像URL</p>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={iconUrlDraft}
                              onChange={(e) => setIconUrlDraft(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && iconUrlDraft && handleIconChange(iconUrlDraft)}
                              placeholder="https://..."
                              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
                            />
                            <button
                              onClick={() => iconUrlDraft && handleIconChange(iconUrlDraft)}
                              disabled={!iconUrlDraft}
                              className="rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600 disabled:opacity-40"
                            >設定</button>
                          </div>
                          <p className="mb-1 mt-3 text-xs font-medium text-gray-400">絵文字</p>
                          <div className="grid max-h-40 grid-cols-8 gap-0.5 overflow-y-auto">
                            {ICON_PRESETS.map((icon) => (
                              <button
                                key={icon}
                                onClick={() => handleIconChange(icon)}
                                className={`rounded p-1 text-base hover:bg-gray-100 ${selectedPage.icon === icon ? 'bg-brand-50 ring-1 ring-brand-400' : ''}`}
                              >{icon}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {pageHistory.length > 0 && (
                    <button onClick={handleBack} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-100">
                      ← 戻る
                    </button>
                  )}
                  <span className="text-xs text-amber-700">テキストを選択して 🔥 で登録</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => recordTriggerRef.current?.()}
                  disabled={!selectedPageId}
                  className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40"
                >
                  📚 記録
                </button>
                <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100" title="閉じる">
                  ✕
                </button>
              </div>
            </div>

            {/* ブックのチャプタータブ */}
            {selectedPage?.type === 'book' && bookChapters.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-100 bg-gray-50 px-3 py-1.5">
                {bookChapters.map((chapter, ci) => (
                  <button
                    key={chapter.id}
                    onClick={() => { if (activeChapterId !== chapter.id) { setActiveChapterId(chapter.id); setEditorKey((k) => k + 1); } }}
                    className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition ${
                      activeChapterId === chapter.id
                        ? 'bg-white text-brand-600 shadow-sm ring-1 ring-gray-200'
                        : 'text-gray-400 hover:bg-white hover:text-gray-600'
                    }`}
                  >
                    {chapterLabel(ci, chapter.title)}
                  </button>
                ))}
                <button
                  onClick={handleAddBookChapter}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white hover:text-brand-500"
                  title="チャプターを追加"
                >＋</button>
              </div>
            )}

            {/* エディタエリア */}
            <div className="flex min-h-0 flex-1 flex-col">
              {selectedPage ? (
                selectedPage.type === 'book' ? (
                  activeChapter ? (
                    <NotionEditor
                      key={`book-${selectedPageId}-${activeChapterId}-${editorKey}`}
                      initialTitle=""
                      initialContent={activeChapter.content}
                      onSave={handleBookChapterSave}
                      onCreateSubPage={handleCreateSubPageInModal}
                      recordTriggerRef={recordTriggerRef}
                      onRecordText={handleRecord}
                      notionPageId={selectedPageId ?? ''}
                      hideTitle
                      onPageNavigate={(href) => {
                        const id = href.match(/\/notion-plus\/([^/?#]+)/)?.[1];
                        if (id) navigateTo(id);
                      }}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2">
                      <span className="text-3xl">📚</span>
                      <p className="text-sm text-gray-400">チャプターがありません</p>
                      <button onClick={handleAddBookChapter} className="mt-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs text-white hover:bg-brand-600">
                        ＋ 最初のチャプターを作成
                      </button>
                    </div>
                  )
                ) : (
                  <NotionEditor
                    key={selectedPageId ?? ''}
                    initialTitle={selectedPage.title}
                    initialContent={selectedPage.content}
                    onSave={handleSave}
                    onCreateSubPage={handleCreateSubPageInModal}
                    recordTriggerRef={recordTriggerRef}
                    onRecordText={handleRecord}
                    notionPageId={selectedPageId ?? ''}
                    onPageNavigate={(href) => {
                      const id = href.match(/\/notion-plus\/([^/?#]+)/)?.[1];
                      if (id) navigateTo(id);
                    }}
                  />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <span className="text-3xl">📝</span>
                  <p className="text-sm text-gray-400">左のページを選択してください</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 登録完了ビッグ演出（🎉＋紙吹雪） */}
      {bigToast && <RegisterCelebration />}

      {confirming && selectedPageId && (
        <ConfirmDialog
          text={recordedText}
          pageId={selectedPageId}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}

      {newPageDialog && (
        <NewPageDialog
          onConfirm={handleCreateWithOptions}
          onCancel={() => setNewPageDialog(false)}
        />
      )}

      {/* 右クリックコンテキストメニュー */}
      {contextMenu && (() => {
        const ctxPage = pages.find((p) => p.id === contextMenu.pageId);
        if (!ctxPage) return null;
        return (
          <div
            className="fixed z-[60] min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {ctxPage.type === 'book' ? (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => convertToNote(contextMenu.pageId)}
              >
                📄 ノートに変換
              </button>
            ) : (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => convertToBook(contextMenu.pageId)}
              >
                📚 ブックに変換
              </button>
            )}
          </div>
        );
      })()}
    </>
  );
}
