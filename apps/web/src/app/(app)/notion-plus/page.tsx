'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';

// ── グループ設定の型 ───────────────────────────────────────────────────
interface PageGroup {
  id: string;
  label: string;
  order: number;
}

interface GroupConfig {
  groups: PageGroup[];
  assignments: Record<string, string>; // pageId → groupId
}

function parseGroupConfig(content: string): GroupConfig {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.groups && parsed?.assignments) return parsed;
  } catch { /* ignore */ }
  return { groups: [], assignments: {} };
}

function serializeGroupConfig(config: GroupConfig): string {
  return JSON.stringify(config);
}

// ── アイコン描画ヘルパー ─────────────────────────────────────────────
function PageIcon({ icon, className = 'h-5 w-5' }: { icon: string; className?: string }) {
  if ((icon ?? '').startsWith('http') || (icon ?? '').startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={`shrink-0 rounded object-cover ${className}`} />;
  }
  return <span className="shrink-0 text-base leading-none">{icon || '📄'}</span>;
}

// ── メインページ ──────────────────────────────────────────────────────
export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, ensureWorkspace, add, update } = useNotionPageStore();
  const router = useRouter();

  // グループ設定の state
  const [config, setConfig] = useState<GroupConfig>({ groups: [], assignments: {} });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pageId: string } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const workspacePage = pages.find((p) => p.id === WORKSPACE_ID);

  // ワークスペース初期化 & グループ設定の読み込み
  useEffect(() => {
    if (!user || loading) return;
    ensureWorkspace(user.uid).catch(() => {});
  }, [user, loading, ensureWorkspace]);

  useEffect(() => {
    if (workspacePage) {
      setConfig(parseGroupConfig(workspacePage.content));
    }
  }, [workspacePage?.content]);

  // グループ設定の保存
  const saveConfig = useCallback(async (newConfig: GroupConfig) => {
    if (!user) return;
    setConfig(newConfig);
    await update(user.uid, WORKSPACE_ID, { content: serializeGroupConfig(newConfig) });
  }, [user, update]);

  // コンテキストメニューを閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // グループ編集インプットのフォーカス
  useEffect(() => {
    if (editingGroupId) editRef.current?.focus();
  }, [editingGroupId]);

  // 新規ページ作成
  const handleAdd = async () => {
    if (!user) return;
    const page = await add(user.uid);
    router.push(`/notion-plus/${page.id}`);
  };

  // グループ追加
  const handleAddGroup = async () => {
    const newGroup: PageGroup = { id: uuidv4(), label: '新しいグループ', order: config.groups.length };
    const newConfig = { ...config, groups: [...config.groups, newGroup] };
    await saveConfig(newConfig);
    setEditingGroupId(newGroup.id);
    setEditingLabel(newGroup.label);
  };

  // グループ名確定
  const handleGroupLabelCommit = async () => {
    if (!editingGroupId || !editingLabel.trim()) { setEditingGroupId(null); return; }
    const newConfig = {
      ...config,
      groups: config.groups.map((g) => g.id === editingGroupId ? { ...g, label: editingLabel.trim() } : g),
    };
    await saveConfig(newConfig);
    setEditingGroupId(null);
  };

  // グループ削除
  const handleDeleteGroup = async (groupId: string) => {
    const newAssignments = { ...config.assignments };
    Object.keys(newAssignments).forEach((pid) => { if (newAssignments[pid] === groupId) delete newAssignments[pid]; });
    const newConfig = { groups: config.groups.filter((g) => g.id !== groupId), assignments: newAssignments };
    await saveConfig(newConfig);
  };

  // ページをグループに割り当て
  const handleAssign = async (pageId: string, groupId: string | null) => {
    const newAssignments = { ...config.assignments };
    if (groupId === null) { delete newAssignments[pageId]; }
    else { newAssignments[pageId] = groupId; }
    await saveConfig({ ...config, assignments: newAssignments });
    setContextMenu(null);
  };

  // ルートページ一覧
  const roots = useMemo(() =>
    pages
      .filter((p) => !p.parentId && p.id !== WORKSPACE_ID)
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return a.order - b.order;
      }),
    [pages],
  );

  // グループ別に分類
  const grouped = useMemo(() => {
    const result: { group: PageGroup; pages: typeof roots }[] = config.groups
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ group: g, pages: roots.filter((p) => config.assignments[p.id] === g.id) }));
    const ungrouped = roots.filter((p) => !config.assignments[p.id]);
    return { result, ungrouped };
  }, [roots, config]);

  // ページリストアイテム
  const PageItem = ({ page }: { page: typeof roots[0] }) => (
    <li
      key={page.id}
      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, pageId: page.id }); }}
    >
      <Link
        href={`/notion-plus/${page.id}`}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
      >
        <PageIcon icon={page.icon} />
        <span className="flex-1 truncate">{page.title || '無題'}</span>
        {page.isFavorite && <span className="text-xs text-yellow-500">★</span>}
      </Link>
    </li>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-3">
        <h1 className="text-sm font-semibold text-gray-800">📝 NotionPlus</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddGroup}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            title="グループを追加"
          >
            ＋ グループ
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            ＋ 新規ページ
          </button>
        </div>
      </div>

      {/* ページ一覧（グループ分け） */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {roots.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-gray-400">
            <span className="text-4xl">📄</span>
            <p className="text-sm">「＋ 新規ページ」で作成しましょう。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* グループあり */}
            {grouped.result.map(({ group, pages: gpages }) => (
              <div key={group.id}>
                {/* グループヘッダー */}
                <div className="mb-1 flex items-center gap-1 group">
                  {editingGroupId === group.id ? (
                    <input
                      ref={editRef}
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onBlur={handleGroupLabelCommit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleGroupLabelCommit();
                        if (e.key === 'Escape') setEditingGroupId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-brand-400 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingGroupId(group.id); setEditingLabel(group.label); }}
                      className="flex-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-brand-500"
                      title="クリックで編集"
                    >
                      {group.label}
                    </button>
                  )}
                  <span className="text-[10px] text-gray-300">{gpages.length}件</span>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] text-gray-300 hover:text-red-400 transition-opacity"
                    title="グループを削除"
                  >✕</button>
                </div>
                {gpages.length === 0 ? (
                  <p className="py-1 pl-3 text-[11px] text-gray-300">（ページを右クリックして追加）</p>
                ) : (
                  <ul className="space-y-0.5">
                    {gpages.map((page) => <PageItem key={page.id} page={page} />)}
                  </ul>
                )}
              </div>
            ))}

            {/* グループ未割当 */}
            {grouped.ungrouped.length > 0 && (
              <div>
                {config.groups.length > 0 && (
                  <div className="mb-1 flex items-center gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-300">未割当</span>
                    <span className="text-[10px] text-gray-300">{grouped.ungrouped.length}件</span>
                  </div>
                )}
                <ul className="space-y-0.5">
                  {grouped.ungrouped.map((page) => <PageItem key={page.id} page={page} />)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右クリックコンテキストメニュー（グループ割当） */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" />
          <div
            className="fixed z-50 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-2xl"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">グループに追加</p>
            {config.groups.map((g) => (
              <button
                key={g.id}
                onClick={() => handleAssign(contextMenu.pageId, g.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${config.assignments[contextMenu.pageId] === g.id ? 'text-brand-500 font-medium' : 'text-gray-700'}`}
              >
                {config.assignments[contextMenu.pageId] === g.id && <span className="text-[10px]">✓</span>}
                <span className="truncate">{g.label}</span>
              </button>
            ))}
            {config.groups.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">「＋ グループ」でまず作成してください</p>
            )}
            {config.assignments[contextMenu.pageId] && (
              <>
                <div className="mx-3 my-1 border-t border-gray-100" />
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
      )}
    </div>
  );
}
