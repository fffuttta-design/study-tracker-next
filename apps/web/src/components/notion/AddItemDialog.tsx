'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { NotionEditor } from '@/components/editor/NotionEditor';

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

// ── AddItemDialog（左右分割ビュー）────────────────────────────────────

export function AddItemDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { add: addItem } = useLearningStore();
  const { pages, add: addPage, update } = useNotionPageStore();
  const { user } = useAuthStore();
  const [recordedText, setRecordedText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const savedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current); }, []);
  const [creating, setCreating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const recordTriggerRef = useRef<(() => void) | null>(null);

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

  const roots = useMemo(() =>
    pages
      .filter((p) => !p.parentId)
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return a.order - b.order;
      }),
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

  const handleSave = useCallback(async (title: string, content: string) => {
    if (!user || !selectedPageId) return;
    await update(user.uid, selectedPageId, { title, content });
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
    if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current);
    setSavedToast(true);
    savedToastTimerRef.current = setTimeout(() => setSavedToast(false), 2500);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const page = await addPage(uid);
      setSelectedPageId(page.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
        <div className="flex w-full overflow-hidden rounded-2xl shadow-2xl bg-white" style={{ height: 'calc(100% - 3rem)' }}>
          {/* 左パネル: ページリスト */}
          <div className="flex w-60 flex-col border-r border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
              <span className="text-sm font-semibold text-gray-700">📝 ページを選択</span>
              <button
                onClick={handleCreate}
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

            <nav className="flex-1 overflow-y-auto px-1 py-1">
              {searchResults ? (
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
                          className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${selectedPageId === page.id ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
                        >
                          <PagePickerIcon icon={page.icon} />
                          <span className="min-w-0 flex-1 truncate text-left">
                            <HighlightText text={page.title || 'Untitled'} query={searchQuery} />
                          </span>
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
              ) : (
                <>
                  {roots.some((p) => p.isFavorite) && (
                    <div className="mb-1">
                      <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-500">★ お気に入り</p>
                      {roots.filter((p) => p.isFavorite).map((page) => (
                        <button
                          key={`fav-${page.id}`}
                          onClick={() => setSelectedPageId(page.id)}
                          className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 pl-4 text-xs transition-colors ${selectedPageId === page.id ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
                        >
                          <PagePickerIcon icon={page.icon} />
                          <span className="min-w-0 flex-1 truncate text-left">{page.title || 'Untitled'}</span>
                        </button>
                      ))}
                      <div className="mx-2 mb-1 mt-1 border-b border-gray-200" />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {roots.map((page) => {
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
                              className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${selectedPageId === page.id ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white hover:text-gray-900'}`}
                            >
                              <PagePickerIcon icon={page.icon} />
                              <span className="min-w-0 flex-1 truncate text-left">{page.title || 'Untitled'}</span>
                              {page.isFavorite && <span className="shrink-0 text-[10px] text-yellow-400">★</span>}
                            </button>
                          </div>
                          {isExpanded && children.length > 0 && (
                            <div className="ml-5 border-l border-gray-200 pl-2 pt-0.5">
                              {children.map((child) => (
                                <button
                                  key={child.id}
                                  onClick={() => setSelectedPageId(child.id)}
                                  className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${selectedPageId === child.id ? 'bg-white font-semibold text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
                                >
                                  <PagePickerIcon icon={child.icon} />
                                  <span className="min-w-0 flex-1 truncate text-left">{child.title || 'Untitled'}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-6 py-2.5">
              <div className="flex items-center gap-3">
                {pageHistory.length > 0 && (
                  <button onClick={handleBack} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-100">
                    ← 戻る
                  </button>
                )}
                <span className="text-sm text-amber-700">テキストを選択して 🔥 ボタンで登録</span>
              </div>
              <div className="flex items-center gap-2">
                {savedToast && (
                  <span className="flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700">
                    ✅ 登録しました
                  </span>
                )}
                <button
                  onClick={() => recordTriggerRef.current?.()}
                  disabled={!selectedPageId}
                  className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40"
                >
                  📚 学習アイテムとして記録
                </button>
                <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100" title="閉じる">
                  ✕
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {selectedPage ? (
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

      {confirming && selectedPageId && (
        <ConfirmDialog
          text={recordedText}
          pageId={selectedPageId}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
