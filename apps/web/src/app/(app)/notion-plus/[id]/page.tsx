'use client';

import { Fragment, use, useEffect, useCallback, useMemo, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID, addPageLinkToContent, type PageHistorySnapshot } from '@/stores/notionPageStore';
import { useSettingsStore, type NotionBlockOffsets, DEFAULT_BLOCK_OFFSETS } from '@/stores/settingsStore';
import { useLearningStore } from '@/stores/learningStore';
import { localDateKey } from '@study-tracker/core';

import { type NotionPage, type BookChapter, parseBookChapters, serializeBookChapters, createBookChapter } from '@study-tracker/core';
import { chapterLabel, numberHeadings, type BookChapterFormat } from '@/lib/bookNumbering';
import { DatabaseView } from '@/components/database/DatabaseView';
import { IconImagePreview } from '@/components/IconImagePreview';

const NotionEditor = dynamic(
  () => import('@/components/editor/NotionEditor').then((m) => ({ default: m.NotionEditor })),
  { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div> }
);

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

// 本文(TipTap JSON)に含まれる全サブページリンクのページIDを抽出
function extractPageLinkIds(content: string): string[] {
  if (!content) return [];
  let doc: unknown;
  try { doc = JSON.parse(content); } catch { return []; }
  const ids: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: string; attrs?: { href?: string; sections?: unknown }; content?: unknown[] };
    if (n.type === 'pageLink' && typeof n.attrs?.href === 'string') {
      const m = n.attrs.href.match(/\/notion-plus\/([^/?#]+)/);
      if (m) ids.push(m[1]);
    }
    // ページテーブル: attrs.sections[].columns[].links[].href も子リンクとして拾う
    if (n.type === 'pageTable' && n.attrs?.sections) {
      let secs: unknown = n.attrs.sections;
      if (typeof secs === 'string') { try { secs = JSON.parse(secs); } catch { secs = null; } }
      if (Array.isArray(secs)) {
        for (const sec of secs as { columns?: { links?: { href?: string }[] }[] }[]) {
          for (const col of sec.columns ?? []) {
            for (const lk of col.links ?? []) {
              const m = typeof lk.href === 'string' ? lk.href.match(/\/notion-plus\/([^/?#]+)/) : null;
              if (m) ids.push(m[1]);
            }
          }
        }
      }
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return ids;
}

// 本文に貼り付けられたサブページリンクに合わせ、子ページの parentId を本ページへ付け替える。
// （本文中のリンクを切り貼りして移動したとき、パンくず＝parentId が追従するように。循環は防ぐ）
async function reconcileChildrenParent(
  uid: string,
  parentPage: NotionPage,
  content: string,
  pages: NotionPage[],
  update: (uid: string, id: string, data: Partial<NotionPage>) => Promise<void>,
): Promise<void> {
  const linkedIds = extractPageLinkIds(content);
  if (linkedIds.length === 0) return;
  const byId = new Map(pages.map((p) => [p.id, p]));
  // childId が parentPage の祖先なら、付け替えると循環するのでスキップ
  const isAncestorOfParent = (childId: string): boolean => {
    let cur: NotionPage | undefined = parentPage;
    while (cur?.parentId) {
      if (cur.parentId === childId) return true;
      cur = byId.get(cur.parentId);
    }
    return false;
  };
  for (const childId of linkedIds) {
    if (childId === parentPage.id) continue;
    const child = byId.get(childId);
    if (!child) continue;
    if (child.parentId === parentPage.id) continue; // 既に正しい
    if (isAncestorOfParent(childId)) continue;       // 循環防止
    await update(uid, childId, { parentId: parentPage.id });
  }
}

// ブックごとに「最後に開いていた章」を記憶（セッション中・別ページへ行って戻っても章を保てる）
const lastChapterByBook = new Map<string, string>();

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
  const { pages, loading, update, add, remove, saveHistory, loadPageHistory } = useNotionPageStore();
  const learningItems = useLearningStore((s) => s.items);
  const addLearning = useLearningStore((s) => s.add);
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightText = searchParams.get('hl') ?? undefined;
  const {
    notionPlusLayout, setNotionPlusLayout,
    notionPlusParaLineHeight, setNotionPlusParaLineHeight,
    notionPlusSoftLineHeight, setNotionPlusSoftLineHeight,
    notionPlusBlockOffsets, setNotionPlusBlockOffsets, resetNotionPlusBlockOffsets,
    dragHandleOffset, setDragHandleOffset,
    bookChapterFormat, setBookChapterFormat,
    bookNumberHeadings, setBookNumberHeadings,
    bookHeadingNumberColor, setBookHeadingNumberColor,
    bookShowChapterHeading, setBookShowChapterHeading,
    setLastViewedNotionPageId,
  } = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconUrlDraft, setIconUrlDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [blockOffsetOpen, setBlockOffsetOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const recordTriggerRef = useRef<(() => void) | null>(null);
  const lastHistorySavedAtRef = useRef(0);

  // ── ブック用 state ────────────────────────────────────────────
  const [bookChapters, setBookChapters] = useState<BookChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string>('');
  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [tabCtxMenu, setTabCtxMenu] = useState<{ chapterId: string; x: number; y: number } | null>(null);

  const TOC_TAB_ID = '__toc__';

  const page = pages.find((p) => p.id === id);
  const breadcrumbs = buildBreadcrumbs(pages, id);

  useEffect(() => {
    if (!loading && !page) router.replace('/notion-plus');
  }, [page, loading, router]);

  // 前回表示ページとして記録
  useEffect(() => {
    if (page) setLastViewedNotionPageId(page.id);
  }, [page?.id, setLastViewedNotionPageId]);

  // 子ページのPageLinkが欠けていれば自動補完（過去に移動したページ対応）
  // 保存後にeditorKeyを上げてエディタを再初期化→上書きによる消失を防ぐ
  //
  // ⚠️ 看板（pageTable）でカードを新規作成すると、addPage で pages.length が即増える一方、
  //    看板へのリンク追記は本文の自動保存（約1.2秒デバウンス）後にしかストアへ反映されない。
  //    その「保存前」の一瞬に古い content を見て補完すると、看板にあるリンクを取りこぼして
  //    本文末尾に重複リンクを足し、さらに editorKey 再初期化で追加したカードごと消える
  //    （＝「新規ページが作れない／一瞬でクローズ」の正体）。
  //    そこで少し待ってから最新の保存済み content を見て判断する（取りこぼしを防ぐ）。
  useEffect(() => {
    if (!page || !user || loading || page.type === 'book' || page.type === 'database') return;
    if (pages.filter((p) => p.parentId === page.id).length === 0) return;
    const uid = user.uid;
    const timer = setTimeout(() => {
      // クロージャの古い値ではなく、ストアの最新状態を読む（看板の保存反映を待ってから判断）
      const latest = useNotionPageStore.getState().pages;
      const cur = latest.find((p) => p.id === id);
      if (!cur || cur.type === 'book' || cur.type === 'database') return;
      const children = latest.filter((p) => p.parentId === cur.id);
      if (children.length === 0) return;
      let content = cur.content;
      let changed = false;
      for (const child of children) {
        const next = addPageLinkToContent(content, child.id, child.title, child.icon);
        if (next !== content) { content = next; changed = true; }
      }
      if (changed) {
        update(uid, cur.id, { content }).then(() => {
          // エディタを強制リセットして補完済みコンテンツで再初期化
          setEditorKey(k => k + 1);
        });
      }
    }, 1800);
    return () => clearTimeout(timer);
  // page.idとchildren数が変わったときだけ実行
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, pages.length]);

  // ブック: page.content から chapters を初期化（pageId が変わった時 or 初回）
  useEffect(() => {
    if (!page || page.type !== 'book') return;
    const chapters = parseBookChapters(page.content);
    setBookChapters(chapters);
    setActiveChapterId((prev) => {
      // 0) 復習リンク等で ?chapter= 指定があればそれを優先（その章を開く）
      const wanted = searchParams.get('chapter');
      if (wanted && chapters.find((c) => c.id === wanted)) return wanted;
      // 1) 現在の選択が残っていればそのまま 2) このブックで最後に見た章 3) 第1章
      if (chapters.find((c) => c.id === prev)) return prev;
      const remembered = lastChapterByBook.get(page.id);
      if (remembered && chapters.find((c) => c.id === remembered)) return remembered;
      return chapters[0]?.id ?? '';
    });
  // page.id が変わったときだけ再初期化（content変化での上書きは不要）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, page?.type]);

  // 章を切り替えたら「このブックで最後に見た章」として記憶（目次タブは除く）
  useEffect(() => {
    if (page?.type === 'book' && activeChapterId && activeChapterId !== TOC_TAB_ID) {
      lastChapterByBook.set(page.id, activeChapterId);
    }
  }, [activeChapterId, page?.id, page?.type]);

  // ── ページ（ブックは章）まるごとを復習に登録 ─────────────────────────
  // ブックで章を開いているときは「その章」を、それ以外はページ全体を対象にする
  const reviewTarget = useMemo(() => {
    if (page?.type === 'book' && activeChapterId && activeChapterId !== TOC_TAB_ID) {
      const ch = bookChapters.find((c) => c.id === activeChapterId);
      return { chapterId: activeChapterId, chapterTitle: ch?.title || '' };
    }
    return { chapterId: undefined as string | undefined, chapterTitle: undefined as string | undefined };
  }, [page?.type, activeChapterId, bookChapters]);

  // 既にこのページ（同じ章）が「ページ全体」で復習登録済みか
  const alreadyRegistered = useMemo(() => {
    if (!page) return false;
    return learningItems.some((it) => it.isPageReview && it.notionPageId === page.id
      && (it.chapterId || '') === (reviewTarget.chapterId || ''));
  }, [learningItems, page, reviewTarget]);

  const registerPageReview = useCallback(async () => {
    if (!user || !page) return;
    if (alreadyRegistered) {
      if (!window.confirm('このページは既に復習登録されています。新しく登録しますか？')) return;
    }
    const crumbs = buildBreadcrumbs(pages, page.id);
    const path = crumbs.map((p) => p.title || 'Untitled').join(' / ');
    const isBookChapter = !!reviewTarget.chapterId;
    const title = isBookChapter
      ? `${page.title || 'Untitled'} / ${reviewTarget.chapterTitle || '章'}`
      : (page.title || 'Untitled');
    const data: Parameters<typeof addLearning>[1] = {
      dateKey: localDateKey(),
      title,
      content: '',
      sortOrder: 0,
      notionPageId: page.id,
      notionPagePath: path,
      isPageReview: true,
    };
    if (reviewTarget.chapterId) { data.chapterId = reviewTarget.chapterId; data.chapterTitle = reviewTarget.chapterTitle; }
    await addLearning(user.uid, data);
  }, [user, page, pages, alreadyRegistered, reviewTarget, addLearning]);

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

  // タブ右クリックメニューの外クリックで閉じる（click イベントで猶予を確保）
  useEffect(() => {
    if (!tabCtxMenu) return;
    const handler = () => setTabCtxMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [tabCtxMenu]);

  const handleSave = useCallback(
    async (title: string, content: string) => {
      if (!user || !page) return;
      setSaving(true);
      try {
        await update(user.uid, page.id, { title, content });
        // 本文に貼り付けられたサブページリンクに合わせて子の parentId を付け替える
        // （リンクを切り貼りして移動したとき、パンくずが追従するように）
        await reconcileChildrenParent(user.uid, page, content, pages, update).catch(() => {});
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
    [user, page, update, saveHistory, pages]
  );

  // ── ブック用ハンドラ ──────────────────────────────────────────
  const saveBookChapters = useCallback(
    async (chapters: BookChapter[]) => {
      if (!user || !page) return;
      setSaving(true);
      try {
        await update(user.uid, page.id, { content: serializeBookChapters(chapters) });
      } finally { setSaving(false); }
    },
    [user, page, update]
  );

  const handleBookChapterSave = useCallback(
    async (_title: string, content: string) => {
      if (!activeChapterId) return;
      const updated = bookChapters.map((c) =>
        c.id === activeChapterId ? { ...c, content } : c
      );
      setBookChapters(updated);
      await saveBookChapters(updated);
      // ノートと統一（A案）：本文/ページテーブルのリンクをこのブックの子へ付け替える
      if (user && page) {
        await reconcileChildrenParent(user.uid, page, content, pages, update).catch(() => {});
      }
    },
    [activeChapterId, bookChapters, saveBookChapters, user, page, pages, update]
  );

  const handleAddChapter = useCallback(async () => {
    const newChapter = createBookChapter(bookChapters.length);
    const updated = [...bookChapters, newChapter];
    setBookChapters(updated);
    setActiveChapterId(newChapter.id);
    await saveBookChapters(updated);
  }, [bookChapters, saveBookChapters]);

  const handleDeleteChapter = useCallback(async (chapterId: string) => {
    if (bookChapters.length <= 1) return; // 最後の1章は削除不可
    if (!confirm('このチャプターを削除しますか？')) return;
    const updated = bookChapters
      .filter((c) => c.id !== chapterId)
      .map((c, i) => ({ ...c, order: i }));
    setBookChapters(updated);
    if (activeChapterId === chapterId) {
      setActiveChapterId(updated[0]?.id ?? '');
    }
    await saveBookChapters(updated);
  }, [bookChapters, activeChapterId, saveBookChapters]);

  const handleRenameChapter = useCallback(async (chapterId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    const updated = bookChapters.map((c) =>
      c.id === chapterId ? { ...c, title: newTitle.trim() } : c
    );
    setBookChapters(updated);
    setRenamingChapterId(null);
    await saveBookChapters(updated);
  }, [bookChapters, saveBookChapters]);

  const handleMoveChapter = useCallback(async (chapterId: string, direction: 'left' | 'right') => {
    const idx = bookChapters.findIndex((c) => c.id === chapterId);
    if (idx === -1) return;
    const newIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= bookChapters.length) return;
    const updated = [...bookChapters];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    const reordered = updated.map((c, i) => ({ ...c, order: i }));
    setBookChapters(reordered);
    await saveBookChapters(reordered);
  }, [bookChapters, saveBookChapters]);

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
                {/* 現在のアイコンが画像（外部URL/貼付）なら、何の画像か分かるよう大きめにプレビュー（クリックで拡大） */}
                {isImageSrc(page.icon) && <IconImagePreview src={page.icon} />}
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

          {/* お気に入りトグル（ワークスペースは非表示） */}
          {id !== WORKSPACE_ID && (
            <button
              onClick={handleFavoriteToggle}
              className={`rounded p-1 text-lg transition ${page.isFavorite ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-200 hover:text-yellow-300'}`}
              title={page.isFavorite ? 'お気に入り解除' : 'お気に入りに追加'}
            >
              ★
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => recordTriggerRef.current?.()}
            className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
            title="選択テキストを学習リストに記録"
          >
            📚 記録
          </button>
          {/* ページ（ブックは現在の章）まるごとを復習に登録 */}
          {page.type !== 'database' && (
            <button
              onClick={registerPageReview}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${alreadyRegistered
                ? 'border-green-300 bg-green-50 text-green-600 hover:bg-green-100'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              title={reviewTarget.chapterId ? 'この章まるごとを復習に登録' : 'このページまるごとを復習に登録'}
            >
              {alreadyRegistered ? '✓ 復習登録済み' : '🔁 ページを復習'}
            </button>
          )}
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
            title="変更履歴"
          >
            🕐 履歴
          </button>
          <span className="text-xs text-gray-400">{saving ? '保存中...' : '自動保存'}</span>
          {/* 書式の位置調整ボタン */}
          <button
            onClick={() => setBlockOffsetOpen(true)}
            className="rounded p-1.5 text-sm text-gray-400 transition hover:bg-gray-100"
            title="書式の位置調整"
          >
            ⇅
          </button>
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
                {/* 行間設定（スライダーでドラッグ即反映＝手で触って微調整） */}
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="mb-2">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Enter 行間</p>
                      <span className="text-[11px] tabular-nums text-gray-500">{notionPlusParaLineHeight.toFixed(2)}</span>
                    </div>
                    <input
                      type="range" min={1.0} max={2.2} step={0.05}
                      value={notionPlusParaLineHeight}
                      onChange={(e) => setNotionPlusParaLineHeight(parseFloat(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Shift+Enter 行間</p>
                      <span className="text-[11px] tabular-nums text-gray-500">{notionPlusSoftLineHeight.toFixed(2)}</span>
                    </div>
                    <input
                      type="range" min={1.0} max={2.2} step={0.05}
                      value={notionPlusSoftLineHeight}
                      onChange={(e) => setNotionPlusSoftLineHeight(parseFloat(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </div>
                </div>
                {/* ブック: 章番号の書式＆本文見出し番号（book のときだけ表示） */}
                {page.type === 'book' && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">章番号の書式</p>
                    <div className="grid grid-cols-2 gap-1">
                      {([
                        { label: '第一章', v: 'kanji' },
                        { label: '第1章', v: 'arabic' },
                        { label: 'Chapter 1', v: 'chapter' },
                        { label: 'なし', v: 'none' },
                      ] as const).map(({ label, v }) => (
                        <button
                          key={v}
                          onClick={() => setBookChapterFormat(v)}
                          className={`rounded border py-1 text-[11px] transition ${bookChapterFormat === v ? 'border-brand-400 bg-brand-50 text-brand-600 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="mt-2.5 flex items-center justify-between gap-2 text-xs text-gray-600">
                      <span>チャプター名を先頭に表示</span>
                      <input
                        type="checkbox"
                        checked={bookShowChapterHeading}
                        onChange={(e) => setBookShowChapterHeading(e.target.checked)}
                        className="h-4 w-4 accent-brand-500"
                      />
                    </label>
                    <label className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-600">
                      <span>本文に見出し番号（1.1）</span>
                      <input
                        type="checkbox"
                        checked={bookNumberHeadings}
                        onChange={(e) => setBookNumberHeadings(e.target.checked)}
                        className="h-4 w-4 accent-brand-500"
                      />
                    </label>
                    {bookNumberHeadings && (
                      <div className="mt-2">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">番号の色</p>
                        <div className="flex flex-wrap items-center gap-1">
                          {([
                            { label: 'グレー', v: '#9ca3af' },
                            { label: '濃灰',   v: '#6b7280' },
                            { label: '黒',     v: '#111827' },
                            { label: '紫',     v: '#7c3aed' },
                            { label: '赤',     v: '#dc2626' },
                            { label: '青',     v: '#2563eb' },
                            { label: '緑',     v: '#16a34a' },
                          ] as const).map(({ label, v }) => (
                            <button
                              key={v}
                              title={label}
                              onClick={() => setBookHeadingNumberColor(v)}
                              className={`h-5 w-5 rounded-full border transition hover:ring-2 hover:ring-brand-300 ${bookHeadingNumberColor.toLowerCase() === v ? 'ring-2 ring-brand-400 border-white' : 'border-gray-200'}`}
                              style={{ background: v }}
                            />
                          ))}
                          {/* 自由な色を選ぶ */}
                          <label className="relative ml-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-dashed border-gray-300 text-[10px] text-gray-400 hover:border-brand-400" title="自由な色">
                            ＋
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}$/.test(bookHeadingNumberColor) ? bookHeadingNumberColor : '#9ca3af'}
                              onChange={(e) => setBookHeadingNumberColor(e.target.value)}
                              className="absolute h-0 w-0 opacity-0"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {id !== WORKSPACE_ID && (
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    <button
                      onClick={handleDelete}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
                    >
                      <span>🗑️</span>
                      <span>このページを削除</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ブック: ページタイトル入力 */}
      {page.type === 'book' && (
        <div className="border-b border-gray-100 px-6 py-3">
          <input
            defaultValue={page.title}
            placeholder="ブックのタイトル"
            onBlur={(e) => { if (user) update(user.uid, page.id, { title: e.target.value }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-full border-none text-2xl font-bold text-gray-900 outline-none placeholder:text-gray-200"
          />
        </div>
      )}

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
      ) : page.type === 'book' ? (
        <>
          {/* チャプタータブバー */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-100 bg-gray-50 px-4 py-1.5 scrollbar-hide">
            {/* 目次タブ */}
            <button
              onClick={() => setActiveChapterId(TOC_TAB_ID)}
              className={`shrink-0 flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition ${
                activeChapterId === TOC_TAB_ID
                  ? 'bg-white text-brand-600 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-400 hover:bg-white hover:text-gray-600'
              }`}
              title="目次"
            >
              📋 目次
            </button>
            <span className="shrink-0 text-gray-200">|</span>

            {bookChapters.map((chapter, idx) => (
              <div key={chapter.id} className="group relative flex shrink-0 items-center">
                {renamingChapterId === chapter.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => handleRenameChapter(chapter.id, renameDraft || chapter.title)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameChapter(chapter.id, renameDraft || chapter.title);
                      if (e.key === 'Escape') setRenamingChapterId(null);
                    }}
                    className="w-24 rounded border border-brand-400 px-2 py-0.5 text-xs outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      // 既にアクティブなタブはキーを上げない（ダブルクリック時に2回リマウントされるのを防ぐ）
                      if (activeChapterId !== chapter.id) {
                        setActiveChapterId(chapter.id);
                        setEditorKey((k) => k + 1);
                      }
                    }}
                    onDoubleClick={() => { setRenamingChapterId(chapter.id); setRenameDraft(chapter.title); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTabCtxMenu({ chapterId: chapter.id, x: e.clientX, y: e.clientY });
                    }}
                    title="右クリックでメニュー"
                    className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition ${
                      activeChapterId === chapter.id
                        ? 'bg-white text-brand-600 shadow-sm ring-1 ring-gray-200'
                        : 'text-gray-500 hover:bg-white hover:text-gray-700'
                    }`}
                  >
                    {chapterLabel(idx, chapter.title, bookChapterFormat)}
                    {/* 並び替えボタン（hover時） */}
                    <span className="hidden gap-0.5 group-hover:flex">
                      {idx > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveChapter(chapter.id, 'left'); }}
                          className="rounded px-0.5 text-gray-300 hover:text-gray-600"
                          title="左へ移動"
                        >‹</button>
                      )}
                      {idx < bookChapters.length - 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveChapter(chapter.id, 'right'); }}
                          className="rounded px-0.5 text-gray-300 hover:text-gray-600"
                          title="右へ移動"
                        >›</button>
                      )}
                      {bookChapters.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.id); }}
                          className="rounded px-0.5 text-gray-300 hover:text-red-400"
                          title="削除"
                        >×</button>
                      )}
                    </span>
                  </button>
                )}
              </div>
            ))}
            {/* チャプター追加ボタン */}
            <button
              onClick={handleAddChapter}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white hover:text-brand-500"
              title="チャプターを追加"
            >＋</button>
          </div>

          {/* タブ右クリックメニュー */}
          {tabCtxMenu && (
            <div
              className="fixed z-50 min-w-[140px] rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
              style={{ left: tabCtxMenu.x, top: tabCtxMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  const chapter = bookChapters.find((c) => c.id === tabCtxMenu.chapterId);
                  if (chapter) { setRenamingChapterId(chapter.id); setRenameDraft(chapter.title); }
                  setTabCtxMenu(null);
                }}
              >
                ✏️ リネーム
              </button>
              {bookChapters.findIndex((c) => c.id === tabCtxMenu.chapterId) > 0 && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => { handleMoveChapter(tabCtxMenu.chapterId, 'left'); setTabCtxMenu(null); }}
                >
                  ‹ 左へ移動
                </button>
              )}
              {bookChapters.findIndex((c) => c.id === tabCtxMenu.chapterId) < bookChapters.length - 1 && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => { handleMoveChapter(tabCtxMenu.chapterId, 'right'); setTabCtxMenu(null); }}
                >
                  › 右へ移動
                </button>
              )}
              {bookChapters.length > 1 && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                    onClick={() => { handleDeleteChapter(tabCtxMenu.chapterId); setTabCtxMenu(null); }}
                  >
                    🗑️ 削除
                  </button>
                </>
              )}
            </div>
          )}

          {/* 目次ビュー or チャプターエディタ */}
          {activeChapterId === TOC_TAB_ID ? (
            <BookTocView chapters={bookChapters} chapterFormat={bookChapterFormat} onJump={(id) => { setActiveChapterId(id); setEditorKey((k) => k + 1); }} />
          ) : (
            (() => {
              const activeIdx = bookChapters.findIndex((c) => c.id === activeChapterId);
              const activeChapter = bookChapters[activeIdx];
              if (!activeChapter) return null;
              return (
                <NotionEditor
                  key={`${page.id}-${activeChapterId}-${editorKey}`}
                  initialTitle=""
                  initialContent={activeChapter.content}
                  chapterHeading={bookShowChapterHeading ? chapterLabel(activeIdx, activeChapter.title, bookChapterFormat) : undefined}
                  onSave={handleBookChapterSave}
                  onCreateSubPage={handleCreateSubPage}
                  recordTriggerRef={recordTriggerRef}
                  notionPageId={page.id}
                  notionPagePath={`${breadcrumbs.map((p) => p.title || 'Untitled').join(' / ')} / ${activeChapter.title}`}
                  highlightText={highlightText}
                  hideTitle
                  stickyToolbar
                  numberHeadings={bookNumberHeadings}
                  headingNumberColor={bookHeadingNumberColor}
                />
              );
            })()
          )}
        </>
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

      {blockOffsetOpen && (
        <BlockOffsetDialog
          offsets={notionPlusBlockOffsets ?? DEFAULT_BLOCK_OFFSETS}
          dragHandleOffset={dragHandleOffset ?? 0}
          onSave={(o, dh) => { setNotionPlusBlockOffsets(o); setDragHandleOffset(dh); setBlockOffsetOpen(false); }}
          onReset={() => { resetNotionPlusBlockOffsets(); setDragHandleOffset(0); }}
          onClose={() => setBlockOffsetOpen(false)}
        />
      )}
    </div>
  );
}

// ── 書式の位置調整ダイアログ ───────────────────────────────────────────

const BLOCK_OFFSET_ROWS: Array<{ key: keyof NotionBlockOffsets; label: string; icon: string }> = [
  { key: 'bullet',     label: '箇条書き',       icon: '•' },
  { key: 'ol',         label: '番号付きリスト',  icon: '1.' },
  { key: 'check',      label: 'チェックリスト',  icon: '☑' },
  { key: 'h1',         label: '見出し 1',        icon: 'H1' },
  { key: 'h2',         label: '見出し 2',        icon: 'H2' },
  { key: 'h3',         label: '見出し 3',        icon: 'H3' },
  { key: 'h4',         label: '見出し 4',        icon: 'H4' },
  { key: 'p',          label: '段落',            icon: '¶' },
  { key: 'blockquote', label: '引用',            icon: '=' },
];

function BlockOffsetDialog({
  offsets,
  dragHandleOffset,
  onSave,
  onReset,
  onClose,
}: {
  offsets: NotionBlockOffsets;
  dragHandleOffset: number;
  onSave: (o: NotionBlockOffsets, dragHandle: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<NotionBlockOffsets>({ ...offsets });
  const [draftDragHandle, setDraftDragHandle] = useState(dragHandleOffset);

  const adjust = (key: keyof NotionBlockOffsets, delta: number) => {
    setDraft((prev) => ({
      ...prev,
      [key]: Math.round((prev[key] + delta) * 10) / 10,
    }));
  };

  const adjustDragHandle = (delta: number) => {
    setDraftDragHandle((prev) => Math.round((prev + delta) * 10) / 10);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-80 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">書式の位置調整</p>
            <p className="text-xs text-gray-400">0.1px 単位で調整 → 「確定」でベースライン保存</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        {/* 行リスト */}
        <div className="px-5 py-3 space-y-2">
          {BLOCK_OFFSET_ROWS.map(({ key, label, icon }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2 w-40">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-500">
                  {icon}
                </span>
                <span className="text-sm text-gray-700">{label}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => adjust(key, -0.1)}
                  className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
                >
                  −
                </button>
                <span className="w-10 text-center text-sm tabular-nums text-gray-700">
                  {draft[key].toFixed(1)}
                </span>
                <span className="text-xs text-gray-400">px</span>
                <button
                  onClick={() => adjust(key, 0.1)}
                  className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ドラッグハンドル行（区切り線で分離） */}
        <div className="border-t border-gray-100 px-5 pt-3 pb-1">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">ドラッグハンドル</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 w-40">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-500">⋮⋮</span>
              <span className="text-sm text-gray-700">縦位置</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => adjustDragHandle(-0.5)}
                className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
              >−</button>
              <span className="w-10 text-center text-sm tabular-nums text-gray-700">{draftDragHandle.toFixed(1)}</span>
              <span className="text-xs text-gray-400">px</span>
              <button
                onClick={() => adjustDragHandle(0.5)}
                className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
              >+</button>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">0 = 中央揃え基準。上にズレているなら + で下げる</p>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => { onReset(); setDraft({ ...DEFAULT_BLOCK_OFFSETS }); setDraftDragHandle(0); }}
            className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
          >
            ↺ デフォルトに戻す
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              閉じる
            </button>
            <button
              onClick={() => onSave(draft, draftDragHandle)}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              ✓ 確定
            </button>
          </div>
        </div>

        {/* 説明文 */}
        <div className="rounded-b-2xl bg-gray-50 px-5 py-2.5 text-xs text-gray-400">
          <p>値は即プレビューされます。気に入った値が見つかったら「確定」を押してベースラインに保存。</p>
          <p className="mt-0.5">「デフォルトに戻す」は最後に確定したベースラインに戻します。</p>
        </div>
      </div>
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

// ── ブック目次ビュー ─────────────────────────────────────────────────────

function extractHeadings(content: string): { level: number; text: string }[] {
  try {
    const json = JSON.parse(content) as { content?: unknown[] };
    const headings: { level: number; text: string }[] = [];
    function traverse(node: { type?: string; text?: string; content?: unknown[]; attrs?: { level?: number } }) {
      if (node.type === 'heading' && node.attrs?.level) {
        const text = ((node.content ?? []) as { text?: string }[]).map((c) => c.text ?? '').join('');
        if (text.trim()) headings.push({ level: node.attrs.level, text: text.trim() });
      }
      if (Array.isArray(node.content)) (node.content as typeof node[]).forEach(traverse);
    }
    if (Array.isArray(json?.content)) (json.content as typeof json[]).forEach(traverse);
    return headings;
  } catch {
    return [];
  }
}

function BookTocView({ chapters, chapterFormat, onJump }: { chapters: BookChapter[]; chapterFormat: BookChapterFormat; onJump: (chapterId: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <h2 className="mb-5 text-base font-bold text-gray-700">📋 目次</h2>
      {chapters.length === 0 ? (
        <p className="text-sm text-gray-400">チャプターがありません</p>
      ) : (
        <div className="space-y-5">
          {chapters.map((chapter, ci) => {
            const headings = numberHeadings(extractHeadings(chapter.content));
            return (
              <div key={chapter.id}>
                {/* チャプター名（自動章番号つき） */}
                <button
                  onClick={() => onJump(chapter.id)}
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-brand-600"
                >
                  <span className="text-brand-400">▶</span>
                  {chapterLabel(ci, chapter.title, chapterFormat)}
                </button>
                {/* 見出し一覧（自動番号 1 / 1.1 / 1.1.1） */}
                {headings.length > 0 ? (
                  <ul className="space-y-0.5 border-l-2 border-gray-100 pl-4">
                    {headings.map((h, i) => (
                      <li
                        key={i}
                        style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                        className="text-sm text-gray-500"
                      >
                        <span className="mr-1.5 text-xs font-medium text-brand-400 tabular-nums">
                          {h.num}
                        </span>
                        {h.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pl-4 text-xs text-gray-300 border-l-2 border-gray-100">見出しなし</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
