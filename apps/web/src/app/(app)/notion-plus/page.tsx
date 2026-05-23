'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { type NotionPage } from '@study-tracker/core';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, add, remove } = useNotionPageStore();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'title' | 'text'>('title');

  const roots = pages
    .filter((p) => !p.parentId)
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.order - b.order;
    });

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    return pages.filter((p) => {
      if (searchMode === 'title') return (p.title || 'Untitled').toLowerCase().includes(q);
      return (p.title || '').toLowerCase().includes(q) || (p.content || '').toLowerCase().includes(q);
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [pages, searchQuery, searchMode]);

  const addPage = async () => {
    if (!user) return;
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  if (loading) {
    return <div className="flex justify-center pt-20"><Spinner /></div>;
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">NotionPlus</h1>
        <button
          onClick={addPage}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          + 新規ページ
        </button>
      </div>

      {/* 検索 */}
      <div className="mb-4 flex items-center gap-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ノートを検索…"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs">
          <button
            onClick={() => setSearchMode('title')}
            className={`px-3 py-1.5 transition ${searchMode === 'title' ? 'bg-brand-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            ノート名
          </button>
          <button
            onClick={() => setSearchMode('text')}
            className={`border-l border-gray-200 px-3 py-1.5 transition ${searchMode === 'text' ? 'bg-brand-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            テキスト
          </button>
        </div>
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="shrink-0 text-xs text-gray-400 hover:text-gray-600">
            ✕
          </button>
        )}
      </div>

      {/* 検索結果 */}
      {searchResults !== null ? (
        <div>
          <p className="mb-2 px-1 text-xs text-gray-400">
            {searchResults.length > 0 ? `${searchResults.length}件 見つかりました` : '一致するノートはありません'}
          </p>
          <div className="space-y-1">
            {searchResults.map((page) => (
              <SearchResultRow key={page.id} page={page} pages={pages} uid={user?.uid ?? ''} onRemove={remove} />
            ))}
          </div>
        </div>
      ) : roots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-4xl">📝</p>
          <p className="mt-3 text-sm text-gray-500">ページがまだありません</p>
          <button onClick={addPage} className="mt-4 text-sm text-brand-500 hover:underline">
            最初のページを作成する
          </button>
        </div>
      ) : (
        <div>
          {roots.some((p) => p.isFavorite) && (
            <div className="mb-4">
              <p className="mb-1 px-1 text-xs font-medium text-gray-400">★ お気に入り</p>
              <div className="space-y-1">
                {roots.filter((p) => p.isFavorite).map((page) => (
                  <PageRow key={page.id} page={page} uid={user?.uid ?? ''} onRemove={remove} />
                ))}
              </div>
            </div>
          )}
          <div>
            {roots.some((p) => p.isFavorite) && (
              <p className="mb-1 px-1 text-xs font-medium text-gray-400">すべてのページ</p>
            )}
            <ReorderablePageList roots={roots} uid={user?.uid ?? ''} onRemove={remove} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── ドラッグ並び替え可能なリスト ────────────────────────────────────
function ReorderablePageList({
  roots, uid, onRemove,
}: {
  roots: NotionPage[];
  uid: string;
  onRemove: (uid: string, id: string) => Promise<void>;
}) {
  const { update } = useNotionPageStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropZoneIndex, setDropZoneIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, pageId: string) => {
    setDragId(pageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-reorder-page-id', pageId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropZoneIndex(null);
  }, []);

  const handleZoneDragOver = useCallback((e: React.DragEvent, zoneIndex: number) => {
    if (!e.dataTransfer.types.includes('application/x-reorder-page-id')) return;
    e.preventDefault();
    e.stopPropagation();
    setDropZoneIndex(zoneIndex);
  }, []);

  const handleZoneDrop = useCallback(async (e: React.DragEvent, zoneIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const reorderPageId = e.dataTransfer.getData('application/x-reorder-page-id');
    if (!reorderPageId || !uid) { setDropZoneIndex(null); return; }
    const fromIndex = roots.findIndex((p) => p.id === reorderPageId);
    if (fromIndex === -1) { setDropZoneIndex(null); return; }

    if (zoneIndex === fromIndex || zoneIndex === fromIndex + 1) {
      setDropZoneIndex(null);
      setDragId(null);
      return;
    }

    const newOrder = [...roots];
    const [moved] = newOrder.splice(fromIndex, 1);
    const insertAt = fromIndex < zoneIndex ? zoneIndex - 1 : zoneIndex;
    newOrder.splice(insertAt, 0, moved);

    await Promise.all(
      newOrder
        .map((p, i) => ({ page: p, newOrder: i }))
        .filter(({ page, newOrder: o }) => page.order !== o)
        .map(({ page, newOrder: o }) => update(uid, page.id, { order: o }))
    );

    setDragId(null);
    setDropZoneIndex(null);
  }, [roots, uid, update]);

  const handleZoneDragLeave = useCallback(() => {
    setDropZoneIndex(null);
  }, []);

  const isDraggingRoot = dragId !== null && roots.some((p) => p.id === dragId);

  return (
    <div>
      <DropZone
        active={dropZoneIndex === 0 && isDraggingRoot}
        dragging={isDraggingRoot}
        onDragOver={(e) => handleZoneDragOver(e, 0)}
        onDrop={(e) => handleZoneDrop(e, 0)}
        onDragLeave={handleZoneDragLeave}
      />
      {roots.map((page, i) => (
        <div key={page.id}>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, page.id)}
            onDragEnd={handleDragEnd}
            className={`transition-opacity ${dragId === page.id ? 'opacity-40' : ''}`}
          >
            <PageRow page={page} uid={uid} onRemove={onRemove} isDragging={dragId === page.id} />
          </div>
          <DropZone
            active={dropZoneIndex === i + 1 && isDraggingRoot}
            dragging={isDraggingRoot}
            onDragOver={(e) => handleZoneDragOver(e, i + 1)}
            onDrop={(e) => handleZoneDrop(e, i + 1)}
            onDragLeave={handleZoneDragLeave}
          />
        </div>
      ))}
    </div>
  );
}

function DropZone({
  active, dragging, onDragOver, onDrop, onDragLeave,
}: {
  active: boolean;
  dragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragLeave: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      // ドラッグ中はヒットエリアを確保。アクティブ時だけ視覚的に拡大
      className={`relative mx-1 transition-all duration-100 ${active ? 'h-4' : dragging ? 'h-2' : 'h-0.5'}`}
    >
      {active && (
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-px rounded bg-brand-400" />
      )}
    </div>
  );
}

// ── 各行 ────────────────────────────────────────────────────────────
function PageRow({ page, uid, onRemove, isDragging = false }: {
  page: NotionPage;
  uid: string;
  onRemove: (uid: string, id: string) => Promise<void>;
  isDragging?: boolean;
}) {
  return (
    <div className="group flex items-center rounded px-2 py-1 hover:bg-gray-50">
      {/* ドラッグハンドル */}
      <span className="mr-1 cursor-grab select-none text-gray-300 opacity-0 transition-opacity group-hover:opacity-100">
        ⠿
      </span>
      <Link
        href={`/notion-plus/${page.id}`}
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        <PageIcon icon={page.icon} />
        <span className="truncate text-sm text-gray-700">{page.title || 'Untitled'}</span>
        {page.isFavorite && <span className="shrink-0 text-xs text-yellow-400">★</span>}
        <span className="ml-1 shrink-0 text-xs text-gray-300">
          {format(new Date(page.updatedAt), 'M/d HH:mm', { locale: ja })}
        </span>
      </Link>
      <button
        onClick={() => onRemove(uid, page.id)}
        className="shrink-0 px-2 py-0.5 text-xs text-gray-200 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
      >
        削除
      </button>
    </div>
  );
}

// 検索結果用：パンくずつき表示
function SearchResultRow({ page, pages, uid, onRemove }: {
  page: NotionPage;
  pages: NotionPage[];
  uid: string;
  onRemove: (uid: string, id: string) => Promise<void>;
}) {
  const breadcrumb = buildBreadcrumbTitles(pages, page.id);

  return (
    <div className="group flex items-center rounded px-2 py-1 hover:bg-gray-50">
      <Link
        href={`/notion-plus/${page.id}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <div className="flex items-center gap-1.5">
          <PageIcon icon={page.icon} />
          <span className="truncate text-sm text-gray-700">{page.title || 'Untitled'}</span>
          <span className="ml-1 shrink-0 text-xs text-gray-300">
            {format(new Date(page.updatedAt), 'M/d HH:mm', { locale: ja })}
          </span>
        </div>
        {breadcrumb.length > 1 && (
          <p className="pl-6 text-xs text-gray-400">{breadcrumb.join(' / ')}</p>
        )}
      </Link>
      <button
        onClick={() => onRemove(uid, page.id)}
        className="shrink-0 px-2 py-0.5 text-xs text-gray-200 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
      >
        削除
      </button>
    </div>
  );
}

function buildBreadcrumbTitles(pages: NotionPage[], currentId: string): string[] {
  const map = new Map(pages.map((p) => [p.id, p]));
  const path: string[] = [];
  let cur = map.get(currentId);
  while (cur) {
    path.unshift(cur.title || 'Untitled');
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return path;
}

function PageIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="block h-5 w-5 shrink-0 flex-shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />;
  }
  return <span className="shrink-0 text-base leading-none">{icon}</span>;
}

function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
