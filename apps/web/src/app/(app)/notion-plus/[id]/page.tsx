'use client';

import { Fragment, use, useEffect, useCallback, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, type PageHistorySnapshot } from '@/stores/notionPageStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { type NotionPage } from '@study-tracker/core';
import { NotionEditor } from '@/components/editor/NotionEditor';
import { DatabaseView } from '@/components/database/DatabaseView';

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

function isImageSrc(s: string) {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:');
}

const ICON_PRESETS = [
  // 顔・感情
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉',
  '😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪',
  '😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑',
  '😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤',
  '😴','😷','🤒','🤕','🤢','🤧','🥵','🥶','🥴','😵',
  '🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️',
  '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥',
  '😢','😭','😱','😖','😣','😞','😓','😩','😫','😤',
  '😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹',
  '👺','👻','👽','👾','🤖',
  // ジェスチャー・体
  '👋','🤚','✋','🖐','🖖','👌','✌️','🤞','🤟','🤘',
  '🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊',
  '🤛','🤜','👏','🙌','🤝','🙏','💪','🦾','🦿','🦵',
  '🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👅','🫦',
  // ハート・愛
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
  '❣️','💕','💞','💓','💗','💖','💘','💝','💟','❤️‍🔥',
  // よく使う記号・マーク
  '⭐','🌟','✨','🔥','💥','💫','❄️','🌈','💯','🎉',
  '🎊','🎁','🎈','🥳','🏆','🥇','🥈','🥉','👑','💎',
  '🎯','✅','❌','⚡','🌀','💢','💨','💦','🎀','🎗️',
  '🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶',
  // ドキュメント・仕事・学習
  '📄','📝','📚','📖','📓','📔','📒','📕','📗','📘',
  '📙','📋','📊','📈','📉','💡','🔖','📌','📍','🗂️',
  '📁','📂','🗃️','💼','🗄️','🖥️','💻','📱','⌨️','🖱️',
  '🖨️','🔐','🔑','🗝️','🛠️','⚙️','🔧','🔩','🧰','🧲',
  '🔬','🔭','📡','🧪','🧫','🧬','🎓','🏫','✏️','📏',
  '📐','🗒️','🗓️','📆','📅','⏰','⌚','⏱️','⏲️','🕰️',
  // お金・ビジネス
  '💰','💴','💵','💶','💷','💸','💳','🏦','🏢','📊',
  '📈','💹','🤝','🏅','🎖️','🏆',
  // 自然・天気
  '🌿','🌱','🌲','🌳','🌴','🌵','🎋','🍀','🌾','🌸',
  '🌺','🌻','🌹','🌷','🌼','💐','🍁','🍂','🍃','🌙',
  '🌞','☀️','⛅','🌤️','🌧️','⛈️','🌨️','❄️','☃️','💨',
  '🌊','🌈','⚡','🌍','🌎','🌏','🗺️','🧊','🌋','🏔️',
  '🏕️','🏖️','🏝️','🌄','🌅','🌉',
  // 動物
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
  '🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
  '🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🦄','🐝',
  '🦋','🐛','🐌','🐞','🦎','🐢','🐍','🦕','🦖','🐙',
  '🦑','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊',
  '🦒','🦓','🐘','🦛','🦏','🦍','🐪','🦘','🐆','🐅',
  '🦌','🐕','🐩','🐈','🐓','🦃','🦜','🦢','🦩','🕊️',
  // 食べ物・飲み物
  '☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🥃',
  '🍸','🍹','🍾','🍎','🍊','🍋','🍌','🍉','🍇','🍓',
  '🍒','🍑','🥭','🍍','🥥','🥝','🍅','🫐','🍆','🥑',
  '🌽','🥕','🥦','🍄','🥜','🌰','🍞','🥐','🧀','🍳',
  '🥚','🍖','🍗','🥩','🍔','🍟','🌭','🍕','🌮','🌯',
  '🍜','🍝','🍛','🍣','🍱','🥟','🦪','🍙','🍚','🍘',
  '🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪','🍡',
  // 旅行・乗り物
  '✈️','🚀','🛸','🚁','🚂','🚗','🚕','🚙','🚌','🚎',
  '🏍️','🛵','🚲','⛵','🚢','🏠','🏡','🏢','🏥','🏦',
  '🏫','🏛️','🏗️','🏰','🏯','⛩️','🕌','⛪','🗼','🗽',
  // スポーツ・活動
  '⚽','🏀','🏈','⚾','🎾','🏐','🏉','🥏','🎱','🏓',
  '🏸','🥊','🥋','🎿','⛷️','🏂','🏋️','🤸','⛹️','🏊',
  '🚴','🧘','🏄','🤾','⛺','🎣','🤿','🏹','🥅','🎯',
  // クリエイティブ・エンタメ
  '🎨','🖌️','🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎷',
  '🎤','🎙️','🎧','📸','📷','🎥','📽️','🎬','📺','📻',
  '🎮','🕹️','🎲','🎯','🎳','🎪','🎭','🖼️','🎟️','🎠',
  // ファッション・その他
  '👗','👒','🎩','🎓','👑','💍','💄','👓','🕶️','🥽',
  '👟','👠','👡','👢','🧣','🧤','🧥','👜','👛','🎒',
  '🔮','💊','💉','🩺','🧬','⚗️','🔭','🌡️','🧭','💌',
  '📬','📦','🎁','🧨','🎆','🎇','🪄','🧸','🎊','🎉',
  '🎈','🎀','🎗️','🏮','🪔','🕯️','🔦','💡','🛒','📬',
];

export default function NotionPageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuthStore();
  const { pages, update, add, remove, saveHistory, loadPageHistory } = useNotionPageStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightText = searchParams.get('hl') ?? undefined;
  const { notionPlusLayout, setNotionPlusLayout } = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconUrlDraft, setIconUrlDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const recordTriggerRef = useRef<(() => void) | null>(null);
  const lastHistorySavedAtRef = useRef(0);

  const page = pages.find((p) => p.id === id);
  const breadcrumbs = buildBreadcrumbs(pages, id);

  useEffect(() => {
    if (pages.length > 0 && !page) router.replace('/notion-plus');
  }, [page, pages.length, router]);

  // アイコンピッカー / 設定パネルの外クリックで閉じる
  useEffect(() => {
    if (!iconPickerOpen && !settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) setIconPickerOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [iconPickerOpen, settingsOpen]);

  const handleSave = useCallback(
    async (title: string, content: string) => {
      if (!user || !page) return;
      setSaving(true);
      try {
        await update(user.uid, page.id, { title, content });
        // 5分に1回履歴を保存
        const now = Date.now();
        if (now - lastHistorySavedAtRef.current > 5 * 60 * 1000) {
          lastHistorySavedAtRef.current = now;
          saveHistory(user.uid, page.id, title, content).catch(() => {});
        }
      } finally {
        setSaving(false);
      }
    },
    [user, page, update, saveHistory]
  );

  const handleHistoryRestore = useCallback(
    async (title: string, content: string) => {
      if (!user || !page) return;
      await update(user.uid, page.id, { title, content });
      setEditorKey((k) => k + 1);
    },
    [user, page, update]
  );

  const handleSaveDbSchema = useCallback(
    async (content: string) => {
      if (!user || !page) return;
      await update(user.uid, page.id, { content });
    },
    [user, page, update]
  );

  const handleCreateSubPage = useCallback(async () => {
    if (!user || !page) return { id: '', title: '' };
    const newPage = await add(user.uid, { parentId: page.id });
    return { id: newPage.id, title: newPage.title };
  }, [user, page, add]);

  const handleIconChange = async (icon: string) => {
    if (!user || !page) return;
    await update(user.uid, page.id, { icon });
    setIconPickerOpen(false);
    setIconUrlDraft('');
  };

  const handleIconPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) handleIconChange(dataUrl);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  const handleFavoriteToggle = async () => {
    if (!user || !page) return;
    await update(user.uid, page.id, { isFavorite: !page.isFavorite });
  };

  const handleDelete = async () => {
    if (!user || !page) return;
    if (!confirm(`「${page.title || 'Untitled'}」を削除しますか？\nこの操作は取り消せません。`)) return;
    setSettingsOpen(false);
    await remove(user.uid, page.id);
    router.replace('/notion-plus');
  };

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* トップバー */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-2">
        <div className="flex items-center gap-2">
          {/* アイコン */}
          <div className="relative" ref={iconPickerRef}>
            <button
              onClick={() => setIconPickerOpen((v) => !v)}
              className="flex items-center justify-center rounded p-1 hover:bg-gray-100"
              title="アイコンを変更"
            >
              {isImageSrc(page.icon) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.icon} alt="" className="block h-7 w-7 flex-shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />
              ) : (
                <span className="text-xl leading-none">{page.icon}</span>
              )}
            </button>
            {iconPickerOpen && (
              <div className="absolute left-0 top-full z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                <p className="mb-1 text-xs font-medium text-gray-400">画像URL・コピペ</p>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={iconUrlDraft}
                    onChange={(e) => setIconUrlDraft(e.target.value)}
                    onPaste={handleIconPaste}
                    onKeyDown={(e) => e.key === 'Enter' && iconUrlDraft && handleIconChange(iconUrlDraft)}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
                  />
                  <button
                    onClick={() => iconUrlDraft && handleIconChange(iconUrlDraft)}
                    disabled={!iconUrlDraft}
                    className="rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600 disabled:opacity-40"
                  >
                    設定
                  </button>
                </div>
                {iconUrlDraft.startsWith('http') && (
                  <div className="mt-2 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconUrlDraft} alt="" className="h-8 w-8 rounded-md object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="text-xs text-gray-400">プレビュー</span>
                  </div>
                )}
                <p className="mb-1 mt-3 text-xs font-medium text-gray-400">絵文字</p>
                <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
                  {ICON_PRESETS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => handleIconChange(icon)}
                      className={`rounded p-1.5 text-lg hover:bg-gray-100 ${page.icon === icon ? 'bg-brand-50 ring-1 ring-brand-400' : ''}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* お気に入りトグル */}
          <button
            onClick={handleFavoriteToggle}
            className={`rounded p-1 text-lg transition ${page.isFavorite ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-200 hover:text-yellow-300'}`}
            title={page.isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
          >
            ★
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => recordTriggerRef.current?.()}
            className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
            title="選択テキストを学習リストに記録"
          >
            📚 記録
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
            title="変更履歴"
          >
            🕐 履歴
          </button>
          <span className="text-xs text-gray-400">{saving ? '保存中...' : '自動保存'}</span>
          {/* 設定ボタン */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className={`rounded p-1.5 text-sm transition hover:bg-gray-100 ${settingsOpen ? 'bg-gray-100' : 'text-gray-400'}`}
              title="NotionPlus 設定"
            >
              ⚙
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">レイアウト</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNotionPlusLayout('center')}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg border p-2 text-xs transition ${notionPlusLayout === 'center' ? 'border-brand-400 bg-brand-50 text-brand-600 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <span className="text-base">▣</span>
                    中央寄せ
                  </button>
                  <button
                    onClick={() => setNotionPlusLayout('left')}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg border p-2 text-xs transition ${notionPlusLayout === 'left' ? 'border-brand-400 bg-brand-50 text-brand-600 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <span className="text-base">▤</span>
                    左寄せ
                  </button>
                </div>
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <button
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
                  >
                    <span>🗑️</span>
                    <span>このページを削除</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* パンくず（親ページがある場合のみ表示） */}
      {breadcrumbs.length > 1 && (
        <div className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-gray-50 px-6 py-1.5 text-xs text-gray-400">
          {breadcrumbs.map((p, i) => (
            <Fragment key={p.id}>
              {i < breadcrumbs.length - 1 ? (
                <>
                  <Link href={`/notion-plus/${p.id}`} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-100 hover:text-gray-600">
                    {p.icon && (
                      isImageSrc(p.icon) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.icon} alt="" className="block h-3.5 w-3.5 flex-shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />
                      ) : (
                        <span className="text-xs leading-none">{p.icon}</span>
                      )
                    )}
                    <span className="max-w-[120px] truncate">{p.title || 'Untitled'}</span>
                  </Link>
                  <span className="shrink-0 text-gray-300">/</span>
                </>
              ) : (
                <span className="flex items-center gap-1 px-1 py-0.5 font-medium text-gray-600">
                  {p.icon && (
                    isImageSrc(p.icon) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.icon} alt="" className="block h-3.5 w-3.5 flex-shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />
                    ) : (
                      <span className="text-xs leading-none">{p.icon}</span>
                    )
                  )}
                  <span className="max-w-[120px] truncate">{p.title || 'Untitled'}</span>
                </span>
              )}
            </Fragment>
          ))}
        </div>
      )}

      {page.type === 'database' ? (
        <DatabaseView
          page={page}
          uid={user!.uid}
          onSaveSchema={handleSaveDbSchema}
        />
      ) : (
        <NotionEditor
          key={`${page.id}-${editorKey}`}
          initialTitle={page.title}
          initialContent={page.content}
          onSave={handleSave}
          onCreateSubPage={handleCreateSubPage}
          recordTriggerRef={recordTriggerRef}
          notionPageId={page.id}
          notionPagePath={breadcrumbs.map((p) => p.title || 'Untitled').join(' / ')}
          highlightText={highlightText}
        />
      )}

      {historyOpen && user && (
        <HistoryModal
          uid={user.uid}
          pageId={page.id}
          loadHistory={loadPageHistory}
          onRestore={handleHistoryRestore}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

// ── 変更履歴モーダル ──────────────────────────────────────────────────

function extractPreviewText(content: string): string {
  try {
    const json = JSON.parse(content) as { content?: unknown[] };
    const lines: string[] = [];
    function traverse(node: { type?: string; text?: string; content?: unknown[]; attrs?: { level?: number } }) {
      if (typeof node.text === 'string') {
        lines.push(node.text);
      } else if (Array.isArray(node.content)) {
        if (node.type === 'heading') {
          const prefix = '#'.repeat(node.attrs?.level ?? 1);
          const text = (node.content as { text?: string }[]).map((c) => c.text ?? '').join('');
          if (text.trim()) lines.push(`${prefix} ${text}`);
        } else if (node.type === 'paragraph') {
          const text = (node.content as { text?: string }[]).map((c) => c.text ?? '').join('');
          if (text.trim()) { lines.push(text); lines.push(''); }
        } else {
          (node.content as typeof node[]).forEach(traverse);
        }
      }
    }
    if (json.content) (json.content as typeof json[]).forEach(traverse);
    return lines.join('\n').trim();
  } catch {
    return content.slice(0, 500);
  }
}

function HistoryModal({ uid, pageId, loadHistory, onRestore, onClose }: {
  uid: string;
  pageId: string;
  loadHistory: (uid: string, pageId: string) => Promise<PageHistorySnapshot[]>;
  onRestore: (title: string, content: string) => Promise<void>;
  onClose: () => void;
}) {
  const [snapshots, setSnapshots] = useState<PageHistorySnapshot[]>([]);
  const [selected, setSelected] = useState<PageHistorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadHistory(uid, pageId).then((snaps) => {
      setSnapshots(snaps);
      if (snaps.length > 0) setSelected(snaps[0]);
      setLoading(false);
    });
  }, [uid, pageId, loadHistory]);

  const handleRestore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      await onRestore(selected.title, selected.content);
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8">
      <div className="flex w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ height: 'calc(100vh - 8rem)' }}>
        {/* サイドバー: タイムスタンプ一覧 */}
        <div className="flex w-56 shrink-0 flex-col border-r border-gray-100 bg-gray-50">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-700">🕐 変更履歴</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <p className="px-4 py-3 text-xs text-gray-400">読込中...</p>
            ) : snapshots.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400">履歴がありません</p>
            ) : snapshots.map((snap) => {
              const d = new Date(snap.savedAt);
              return (
                <button
                  key={snap.id}
                  onClick={() => setSelected(snap)}
                  className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left text-xs transition ${selected?.id === snap.id ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <span className="font-medium">{d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</span>
                  <span className="text-gray-400">{d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* プレビューエリア */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
            <p className="text-sm font-semibold text-gray-700">
              {selected
                ? `${new Date(selected.savedAt).toLocaleString('ja-JP')} のバージョン`
                : 'バージョンを選択してください'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {selected ? (
              <>
                <h1 className="mb-4 text-2xl font-bold text-gray-900">{selected.title || 'Untitled'}</h1>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-600">
                  {extractPreviewText(selected.content)}
                </pre>
              </>
            ) : (
              <p className="text-sm text-gray-400">左から履歴を選択してください</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100">
              キャンセル
            </button>
            <button
              onClick={handleRestore}
              disabled={!selected || restoring}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {restoring ? '復元中...' : 'この時点に復元'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
