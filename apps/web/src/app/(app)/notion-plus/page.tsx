'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { deleteField } from 'firebase/firestore';
import { type NotionPage } from '@study-tracker/core';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';

// ── グループ設定の型 ───────────────────────────────────────────────────
interface PageGroup { id: string; label: string; order: number; }
interface GroupConfig {
  groups: PageGroup[];
  assignments: Record<string, string>;  // pageId → groupId
  pageOrder?: Record<string, string[]>; // groupKey → ordered pageIds ('__ungrouped__' for ungrouped)
}

function parseGroupConfig(content: string): GroupConfig {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.groups && parsed?.assignments) return parsed;
  } catch { /* ignore */ }
  return { groups: [], assignments: {} };
}

// ── アイコン ─────────────────────────────────────────────────────────
function PageIcon({ icon }: { icon: string }) {
  if ((icon ?? '').startsWith('http') || (icon ?? '').startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />;
  }
  return <span className="shrink-0 text-base leading-none">{icon || '📄'}</span>;
}

// ── ページ行コンポーネント（最上位定義：内部定義するとフック数不整合でクラッシュするため）────
interface PageRowProps {
  page: NotionPage;
  groupKey: string;
  isDragging: boolean;
  dragOverItem: { pageId: string; position: 'before' | 'after' } | null;
  sourceGroupKey: (pageId: string) => string; // そのページが属するgroupKey
  onDragStart: (e: React.DragEvent, pageId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, pageId: string, el: HTMLLIElement | null) => void;
  onDragLeave: (pageId: string) => void;
  onDrop: (e: React.DragEvent, pageId: string, sameGroup: boolean) => void;
  onContextMenu: (e: React.MouseEvent, pageId: string) => void;
}
function PageRow({ page, groupKey, isDragging, dragOverItem, sourceGroupKey, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onContextMenu }: PageRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const isSameGroup = sourceGroupKey(page.id) === groupKey;
  const dropLine = dragOverItem?.pageId === page.id ? dragOverItem.position : null;
  return (
    <li
      ref={rowRef}
      draggable
      onDragStart={(e) => onDragStart(e, page.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, page.id, rowRef.current)}
      onDragLeave={() => onDragLeave(page.id)}
      onDrop={(e) => onDrop(e, page.id, isSameGroup)}
      onContextMenu={(e) => onContextMenu(e, page.id)}
      className={`relative transition-opacity ${isDragging ? 'opacity-40' : ''}`}
    >
      {dropLine === 'before' && <div className="pointer-events-none absolute -top-px left-0 right-0 h-0.5 rounded bg-brand-400" />}
      <Link href={`/notion-plus/${page.id}`} className="flex cursor-grab items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 active:cursor-grabbing">
        <span className="shrink-0 text-[10px] text-gray-300">⠿</span>
        <PageIcon icon={page.icon} />
        <span className="flex-1 truncate">{page.title || '無題'}</span>
        {page.isFavorite && <span className="text-xs text-yellow-500">★</span>}
      </Link>
      {dropLine === 'after' && <div className="pointer-events-none absolute -bottom-px left-0 right-0 h-0.5 rounded bg-brand-400" />}
    </li>
  );
}

// ── ③ ページ移動モーダル ──────────────────────────────────────────────
function MovePageModal({
  target, pages, uid, onClose,
}: { target: NotionPage; pages: NotionPage[]; uid: string; onClose: () => void }) {
  const { update } = useNotionPageStore();
  const router = useRouter();

  const getDescendantIds = (id: string): string[] => {
    const children = pages.filter((p) => p.parentId === id);
    return children.flatMap((c) => [c.id, ...getDescendantIds(c.id)]);
  };

  const getAncestorPath = (page: NotionPage): string => {
    const parts: string[] = [];
    let cur: NotionPage | undefined = page;
    while (cur?.parentId && cur.parentId !== WORKSPACE_ID) {
      const parent = pages.find((p) => p.id === cur!.parentId);
      if (!parent) break;
      parts.unshift(parent.title || 'Untitled');
      cur = parent;
    }
    return parts.join(' › ');
  };

  const excludeIds = new Set([target.id, WORKSPACE_ID, ...getDescendantIds(target.id)]);
  const validTargets = pages
    .filter((p) => !excludeIds.has(p.id) && p.type !== 'database')
    .sort((a, b) => a.order - b.order);

  const getMaxOrder = (parentId: string | undefined) => {
    const siblings = pages.filter((p) =>
      p.id !== WORKSPACE_ID && p.id !== target.id &&
      (parentId ? p.parentId === parentId : !p.parentId)
    );
    return siblings.reduce((max, p) => Math.max(max, p.order ?? 0), -1) + 1;
  };

  const handleMove = async (parentId: string | undefined) => {
    const data: Record<string, unknown> = { order: getMaxOrder(parentId), updatedAt: new Date().toISOString() };
    data.parentId = parentId !== undefined ? parentId : deleteField();
    await update(uid, target.id, data as Partial<NotionPage>);
    onClose();
    router.push(`/notion-plus/${target.id}`);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex w-96 max-h-[70vh] flex-col rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">📁 移動先を選択</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">「{target.title || 'Untitled'}」の移動先</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <button
            onClick={() => handleMove(undefined)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50"
          >
            <span>🏠</span>
            <span className="font-medium">ルートに移動（最上位）</span>
            {!target.parentId && <span className="ml-auto text-[10px] text-brand-400">現在</span>}
          </button>
          <div className="mx-4 my-1 border-t border-gray-100" />
          {validTargets.map((p) => {
            const path = getAncestorPath(p);
            return (
              <button
                key={p.id}
                onClick={() => handleMove(p.id)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-brand-50 ${p.id === target.parentId ? 'bg-brand-50 text-brand-600' : 'text-gray-700'}`}
              >
                <PageIcon icon={p.icon} />
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate font-medium">{p.title || 'Untitled'}</div>
                  {path && <div className="truncate text-[10px] text-gray-400">{path}</div>}
                </div>
                {p.id === target.parentId && <span className="ml-auto shrink-0 text-[10px] text-brand-400">現在の親</span>}
              </button>
            );
          })}
          {validTargets.length === 0 && (
            <p className="px-4 py-4 text-center text-xs text-gray-400">移動可能なページがありません</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── グループ設定の localStorage ヘルパー ──────────────────────────────
function getLocalKey(uid: string) { return `notion-group-config-${uid}`; }
function loadLocalConfig(uid: string): GroupConfig {
  try {
    const raw = localStorage.getItem(getLocalKey(uid));
    if (raw) return parseGroupConfig(raw);
  } catch { /* ignore */ }
  return { groups: [], assignments: {} };
}
function saveLocalConfig(uid: string, config: GroupConfig) {
  try { localStorage.setItem(getLocalKey(uid), JSON.stringify(config)); } catch { /* ignore */ }
}

// ── メインページ ──────────────────────────────────────────────────────
export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, ensureWorkspace, add, update } = useNotionPageStore();
  const router = useRouter();

  const workspacePage = pages.find((p) => p.id === WORKSPACE_ID);

  // config は localStorage を一次保存先とする（Firestore の timing に依存しない）
  const [config, setConfig] = useState<GroupConfig>(() =>
    user ? loadLocalConfig(user.uid) : { groups: [], assignments: {} }
  );
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Firestore からデータが来たら localStorage と config を更新（マルチデバイス同期）
  useEffect(() => {
    if (!workspacePage?.content || !user) return;
    const firestoreConfig = parseGroupConfig(workspacePage.content);
    // Firestore の方がグループが多い場合のみ上書き（初回ロードや別端末から）
    if (firestoreConfig.groups.length > 0 || Object.keys(firestoreConfig.assignments).length > 0) {
      setConfig(firestoreConfig);
      saveLocalConfig(user.uid, firestoreConfig);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePage?.content]);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pageId: string } | null>(null);
  const [moveModalPage, setMoveModalPage] = useState<NotionPage | null>(null);

  useEffect(() => {
    if (!user || loading) return;
    ensureWorkspace(user.uid).catch(() => {});
  }, [user, loading, ensureWorkspace]);


  // コンテキストメニュー外クリックで閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // グループ編集インプットのオートフォーカス
  useEffect(() => {
    if (editingGroupId) editRef.current?.focus();
  }, [editingGroupId]);

  // グループ設定の保存（localStorage に即時保存 → Firestore にバックグラウンド同期）
  const saveConfig = useCallback(async (newConfig: GroupConfig) => {
    if (!user) return;
    setConfig(newConfig);            // UI 即時反映
    configRef.current = newConfig;
    saveLocalConfig(user.uid, newConfig); // localStorage に即保存（ページ遷移でも消えない）
    update(user.uid, WORKSPACE_ID, { content: JSON.stringify(newConfig) }).catch(console.error);
  }, [user, update]);

  // ① Enter / blur でグループ名確定（configRef で最新値を参照）
  const handleGroupLabelCommit = useCallback(async (label: string, groupId: string) => {
    if (!label.trim() || !groupId) { setEditingGroupId(null); return; }
    const current = configRef.current;
    const newConfig: GroupConfig = {
      ...current,
      groups: current.groups.map((g) => g.id === groupId ? { ...g, label: label.trim() } : g),
    };
    setEditingGroupId(null);
    await saveConfig(newConfig);
  }, [saveConfig]);

  // グループ追加
  const handleAddGroup = async () => {
    const newGroup: PageGroup = { id: uuidv4(), label: '新しいグループ', order: configRef.current.groups.length };
    const newConfig: GroupConfig = { ...configRef.current, groups: [...configRef.current.groups, newGroup] };
    await saveConfig(newConfig);
    setEditingGroupId(newGroup.id);
    setEditingLabel(newGroup.label);
  };

  // グループ削除
  const handleDeleteGroup = async (groupId: string) => {
    const current = configRef.current;
    const newAssignments = { ...current.assignments };
    Object.keys(newAssignments).forEach((pid) => { if (newAssignments[pid] === groupId) delete newAssignments[pid]; });
    await saveConfig({ groups: current.groups.filter((g) => g.id !== groupId), assignments: newAssignments });
  };

  // ページをグループに割り当て（内部共通ロジック）
  const assignPage = useCallback(async (pageId: string, groupId: string | null) => {
    const current = configRef.current;
    const newAssignments = { ...current.assignments };
    if (groupId === null) { delete newAssignments[pageId]; } else { newAssignments[pageId] = groupId; }
    await saveConfig({ ...current, assignments: newAssignments });
  }, [saveConfig]);

  // 右クリックメニュー用（メニューを閉じる付き）
  const handleAssign = async (pageId: string, groupId: string | null) => {
    await assignPage(pageId, groupId);
    setContextMenu(null);
  };

  // ドラッグ状態
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ pageId: string; position: 'before' | 'after' } | null>(null);

  // ルートページ一覧（handleReorder が参照するため先に宣言）
  const roots = useMemo(() =>
    pages
      .filter((p) => !p.parentId && p.id !== WORKSPACE_ID)
      .sort((a, b) => { if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1; return a.order - b.order; }),
    [pages],
  );

  // グループ内並び替え
  const handleReorder = useCallback(async (
    dragId: string, targetId: string, groupKey: string, insertBefore: boolean,
  ) => {
    const current = configRef.current;
    const groupId = groupKey === '__ungrouped__' ? null : groupKey;
    const groupPages = groupId
      ? roots.filter((p) => current.assignments[p.id] === groupId)
      : roots.filter((p) => !current.assignments[p.id]);

    // 既存の順序 + グループ内ページを統合してフル順序リストを構築
    const existingOrder = current.pageOrder?.[groupKey] ?? [];
    const baseOrder: string[] = [];
    existingOrder.forEach((id) => { if (groupPages.some((p) => p.id === id)) baseOrder.push(id); });
    groupPages.forEach((p) => { if (!baseOrder.includes(p.id)) baseOrder.push(p.id); });

    const fromIdx = baseOrder.indexOf(dragId);
    if (fromIdx === -1) return;

    const newOrder = [...baseOrder];
    newOrder.splice(fromIdx, 1);
    const targetIdx = newOrder.indexOf(targetId);
    if (targetIdx === -1) return;
    newOrder.splice(insertBefore ? targetIdx : targetIdx + 1, 0, dragId);

    await saveConfig({ ...current, pageOrder: { ...(current.pageOrder ?? {}), [groupKey]: newOrder } });
  }, [roots, saveConfig]);

  // 新規ページ
  const handleAdd = async () => {
    if (!user) return;
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  // pageOrder に従ってページを並び替えるヘルパー
  const applyOrder = useCallback((pages: NotionPage[], groupKey: string): NotionPage[] => {
    const order = config.pageOrder?.[groupKey];
    if (!order) return pages;
    const ordered = order.map((id) => pages.find((p) => p.id === id)).filter(Boolean) as NotionPage[];
    const rest = pages.filter((p) => !order.includes(p.id));
    return [...ordered, ...rest];
  }, [config.pageOrder]);

  // グループ別分類（pageOrder 反映）
  const { groupedResult, ungrouped } = useMemo(() => {
    const result = config.groups
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        group: g,
        pages: applyOrder(roots.filter((p) => config.assignments[p.id] === g.id), g.id),
      }));
    return {
      groupedResult: result,
      ungrouped: applyOrder(roots.filter((p) => !config.assignments[p.id]), '__ungrouped__'),
    };
  }, [roots, config, applyOrder]);

  // PageRow 用ハンドラ（最上位コンポーネントに渡す）
  const handleRowDragStart = useCallback((e: React.DragEvent, pageId: string) => {
    setDraggingPageId(pageId);
    e.dataTransfer.setData('text/plain', pageId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleRowDragEnd = useCallback(() => {
    setDraggingPageId(null); setDragOverGroupId(null); setDragOverItem(null);
  }, []);

  const handleRowDragOver = useCallback((e: React.DragEvent, pageId: string, el: HTMLLIElement | null) => {
    if (!draggingPageId || draggingPageId === pageId) return;
    const srcKey = config.assignments[draggingPageId] ?? '__ungrouped__';
    const tgtKey = config.assignments[pageId] ?? '__ungrouped__';
    if (srcKey === tgtKey) {
      e.preventDefault();
      e.stopPropagation();
      const rect = el?.getBoundingClientRect();
      const position = rect && e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      setDragOverItem({ pageId, position });
    }
  }, [draggingPageId, config.assignments]);

  const handleRowDragLeave = useCallback((pageId: string) => {
    setDragOverItem((prev) => prev?.pageId === pageId ? null : prev);
  }, []);

  const handleRowDrop = useCallback((e: React.DragEvent, targetPageId: string, sameGroup: boolean) => {
    if (!draggingPageId || !sameGroup) return;
    e.preventDefault();
    e.stopPropagation();
    const tgtKey = config.assignments[targetPageId] ?? '__ungrouped__';
    handleReorder(draggingPageId, targetPageId, tgtKey, dragOverItem?.position === 'before');
    setDragOverItem(null); setDraggingPageId(null);
  }, [draggingPageId, config.assignments, handleReorder, dragOverItem]);

  const handleRowContextMenu = useCallback((e: React.MouseEvent, pageId: string) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, pageId });
  }, []);

  const getSourceGroupKey = useCallback((pageId: string) =>
    config.assignments[pageId] ?? '__ungrouped__', [config.assignments]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-3">
        <h1 className="text-sm font-semibold text-gray-800">📝 NotionPlus</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleAddGroup} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            ＋ グループ
          </button>
          <button onClick={handleAdd} className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
            ＋ 新規ページ
          </button>
        </div>
      </div>

      {/* ページ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {roots.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-gray-400">
            <span className="text-4xl">📄</span>
            <p className="text-sm">「＋ 新規ページ」で作成しましょう。</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* グループあり */}
            {groupedResult.map(({ group, pages: gpages }) => (
              <div
                key={group.id}
                onDragOver={(e) => { if (draggingPageId) { e.preventDefault(); setDragOverGroupId(group.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const pid = e.dataTransfer.getData('text/plain');
                  if (pid) assignPage(pid, group.id);
                  setDragOverGroupId(null);
                  setDraggingPageId(null);
                }}
                className={`rounded-lg p-2 transition-colors ${dragOverGroupId === group.id ? 'bg-brand-50 ring-1 ring-brand-300' : ''}`}
              >
                <div className="group mb-1 flex items-center gap-1">
                  {editingGroupId === group.id ? (
                    <input
                      ref={editRef}
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onBlur={() => handleGroupLabelCommit(editingLabel, group.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleGroupLabelCommit(editingLabel, group.id); }
                        if (e.key === 'Escape') setEditingGroupId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-brand-400 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingGroupId(group.id); setEditingLabel(group.label); }}
                      className="flex-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-brand-500"
                      title="クリックで名前を変更"
                    >
                      {group.label}
                    </button>
                  )}
                  <span className="text-[10px] text-gray-300">{gpages.length}件</span>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="rounded px-1 text-[10px] text-gray-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    title="グループを削除"
                  >✕</button>
                </div>
                {gpages.length === 0 ? (
                  <p className={`py-2 pl-3 text-[11px] ${dragOverGroupId === group.id ? 'text-brand-400' : 'text-gray-300'}`}>
                    {dragOverGroupId === group.id ? '↓ ここにドロップ' : '（ページをドラッグ or 右クリックして追加）'}
                  </p>
                ) : (
                  <ul className="space-y-0.5">{gpages.map((p) => (
                    <PageRow key={p.id} page={p} groupKey={group.id}
                      isDragging={draggingPageId === p.id} dragOverItem={dragOverItem}
                      sourceGroupKey={getSourceGroupKey}
                      onDragStart={handleRowDragStart} onDragEnd={handleRowDragEnd}
                      onDragOver={handleRowDragOver} onDragLeave={handleRowDragLeave}
                      onDrop={handleRowDrop} onContextMenu={handleRowContextMenu} />
                  ))}</ul>
                )}
              </div>
            ))}

            {/* 未割当（ドロップでグループ解除） */}
            {(ungrouped.length > 0 || draggingPageId) && (
              <div
                onDragOver={(e) => { if (draggingPageId) { e.preventDefault(); setDragOverGroupId('__ungrouped__'); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const pid = e.dataTransfer.getData('text/plain');
                  if (pid) assignPage(pid, null);
                  setDragOverGroupId(null);
                  setDraggingPageId(null);
                }}
                className={`rounded-lg p-2 transition-colors ${dragOverGroupId === '__ungrouped__' ? 'bg-gray-50 ring-1 ring-gray-300' : ''}`}
              >
                {config.groups.length > 0 && (
                  <div className="mb-1 flex items-center gap-1">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${dragOverGroupId === '__ungrouped__' ? 'text-gray-500' : 'text-gray-300'}`}>
                      {dragOverGroupId === '__ungrouped__' ? '↓ グループから外す' : '未割当'}
                    </span>
                    {ungrouped.length > 0 && <span className="text-[10px] text-gray-300">{ungrouped.length}件</span>}
                  </div>
                )}
                {ungrouped.length > 0 && (
                  <ul className="space-y-0.5">{ungrouped.map((p) => (
                    <PageRow key={p.id} page={p} groupKey="__ungrouped__"
                      isDragging={draggingPageId === p.id} dragOverItem={dragOverItem}
                      sourceGroupKey={getSourceGroupKey}
                      onDragStart={handleRowDragStart} onDragEnd={handleRowDragEnd}
                      onDragOver={handleRowDragOver} onDragLeave={handleRowDragLeave}
                      onDrop={handleRowDrop} onContextMenu={handleRowContextMenu} />
                  ))}</ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右クリックコンテキストメニュー */}
      {contextMenu && (() => {
        const ctxPage = pages.find((p) => p.id === contextMenu.pageId);
        return (
          <>
            <div className="fixed inset-0 z-40" />
            <div
              className="fixed z-50 w-52 rounded-xl border border-gray-100 bg-white py-1 shadow-2xl"
              style={{
                top: contextMenu.y + 240 > (typeof window !== 'undefined' ? window.innerHeight : 800)
                  ? contextMenu.y - 240
                  : contextMenu.y,
                left: contextMenu.x + 220 > (typeof window !== 'undefined' ? window.innerWidth : 1200)
                  ? contextMenu.x - 220
                  : contextMenu.x,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ③ ページを移動 */}
              {ctxPage && (
                <button
                  onClick={() => { setMoveModalPage(ctxPage); setContextMenu(null); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span>📁</span><span>ページを移動</span>
                </button>
              )}
              <div className="mx-2 my-1 border-t border-gray-100" />
              {/* グループ割当 */}
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">グループに追加</p>
              {config.groups.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">「＋ グループ」で作成してください</p>
              )}
              {config.groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleAssign(contextMenu.pageId, g.id)}
                  className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${config.assignments[contextMenu.pageId] === g.id ? 'text-brand-500 font-medium' : 'text-gray-700'}`}
                >
                  {config.assignments[contextMenu.pageId] === g.id && <span className="text-[10px]">✓</span>}
                  <span className="truncate">{g.label}</span>
                </button>
              ))}
              {config.assignments[contextMenu.pageId] && (
                <>
                  <div className="mx-2 my-1 border-t border-gray-100" />
                  <button
                    onClick={() => handleAssign(contextMenu.pageId, null)}
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-gray-400 hover:bg-gray-50"
                  >
                    グループから外す
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* ③ ページ移動モーダル */}
      {moveModalPage && user && (
        <MovePageModal
          target={moveModalPage}
          pages={pages}
          uid={user.uid}
          onClose={() => setMoveModalPage(null)}
        />
      )}
    </div>
  );
}
