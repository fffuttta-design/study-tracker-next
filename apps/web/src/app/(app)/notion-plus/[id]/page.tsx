'use client';

import { Fragment, use, useEffect, useCallback, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { type NotionPage } from '@study-tracker/core';
import { NotionEditor } from '@/components/editor/NotionEditor';

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
  const { pages, update, add } = useNotionPageStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightText = searchParams.get('hl') ?? undefined;
  const { notionPlusLayout, setNotionPlusLayout } = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconUrlDraft, setIconUrlDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const recordTriggerRef = useRef<(() => void) | null>(null);

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
      } finally {
        setSaving(false);
      }
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

      <NotionEditor
        key={page.id}
        initialTitle={page.title}
        initialContent={page.content}
        onSave={handleSave}
        onCreateSubPage={handleCreateSubPage}
        recordTriggerRef={recordTriggerRef}
        notionPageId={page.id}
        notionPagePath={breadcrumbs.map((p) => p.title || 'Untitled').join(' / ')}
        highlightText={highlightText}
      />
    </div>
  );
}
