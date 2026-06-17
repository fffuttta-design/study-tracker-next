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

import { Node as TiptapNode, InputRule, Extension, wrappingInputRule, textblockTypeInputRule } from '@tiptap/core';
import {
  useEditor, EditorContent,
  NodeViewWrapper, NodeViewContent,
  ReactNodeViewRenderer, type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import Youtube from '@tiptap/extension-youtube';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { DragHandleExtension, setDragHandleVertOffset } from './DragHandleExtension';
import { AnnotationMark } from './AnnotationMark';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { useDbRowStore } from '@/stores/notionDatabaseRowStore';
import { parseDbSchema, createBookChapter, serializeBookChapters, parseBookChapters, type NotionPage } from '@study-tracker/core';
import './editor.css';

// ── ProseMirror → Markdown 変換 ──────────────────────────────────────

interface PmNode {
  isText: boolean;
  text?: string;
  marks: Array<{ type: { name: string }; attrs: Record<string, unknown> }>;
  type: { name: string };
  attrs: Record<string, unknown>;
  textContent: string;
  forEach(fn: (node: PmNode) => void): void;
}

function pmToMarkdown(node: PmNode): string {
  if (node.isText) {
    let t = node.text ?? '';
    for (const m of node.marks) {
      switch (m.type.name) {
        case 'bold':   t = `**${t}**`; break;
        case 'italic': t = `*${t}*`; break;
        case 'code':   t = `\`${t}\``; break;
        case 'strike': t = `~~${t}~~`; break;
        case 'link':   t = `[${t}](${m.attrs.href as string})`; break;
        case 'textStyle': {
          const color = m.attrs.color as string | undefined;
          if (color) t = `<span style="color:${color}">${t}</span>`;
          break;
        }
      }
    }
    return t;
  }
  const children = (): string => {
    const parts: string[] = [];
    node.forEach((child) => parts.push(pmToMarkdown(child)));
    return parts.join('');
  };
  switch (node.type.name) {
    case 'doc':
    case 'bulletList':
    case 'taskList':
      return children();
    case 'orderedList': {
      const parts: string[] = [];
      let idx = 0;
      node.forEach((item) => {
        idx++;
        const inner: string[] = [];
        item.forEach((child) => inner.push(pmToMarkdown(child)));
        parts.push(`${idx}. ${inner.join('').trim()}\n`);
      });
      return parts.join('');
    }
    case 'paragraph': {
      const c = children();
      return c.trim() ? c + '\n\n' : '';
    }
    case 'heading':
      return `${'#'.repeat(node.attrs.level as number)} ${children()}\n\n`;
    case 'blockquote':
      return children().split('\n').filter(Boolean).map(l => `> ${l}`).join('\n') + '\n\n';
    case 'codeBlock': {
      const lang = (node.attrs.language as string | null) ?? '';
      return `\`\`\`${lang}\n${node.textContent}\n\`\`\`\n\n`;
    }
    case 'listItem': {
      return `- ${children().trim()}\n`;
    }
    case 'taskItem': {
      const checked = node.attrs.checked as boolean | undefined;
      return `${checked ? '- [x]' : '- [ ]'} ${children().trim()}\n`;
    }
    case 'hardBreak':
      return '\n';
    default:
      return children();
  }
}

// ── helpers ────────────────────────────────────────────────────────────

function isYouTubeUrl(url: string) {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed)/.test(url);
}

function getYoutubeEmbedUrl(src: string): string {
  const short = src.match(/youtu\.be\/([^?&#]+)/);
  if (short) return `https://www.youtube-nocookie.com/embed/${short[1]}`;
  const watch = src.match(/[?&]v=([^&]+)/);
  if (watch) return `https://www.youtube-nocookie.com/embed/${watch[1]}`;
  if (/youtube(?:-nocookie)?\.com\/embed/.test(src)) return src;
  return src;
}

function isImageSrc(s: string) {
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:');
}

// ── 絵文字プリセット ──────────────────────────────────────────────────

const EMOJI_PRESETS = [
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
  '📈','💹','🤝','🏅','🎖️','🏆','🔐','🔒','🔓','🗺️',
  // 自然・天気
  '🌿','🌱','🌲','🌳','🌴','🌵','🎋','🎍','🍀','🌾',
  '🌸','🌺','🌻','🌹','🌷','🌼','💐','🍁','🍂','🍃',
  '🌙','🌛','🌜','🌚','🌝','🌞','☀️','⛅','🌤️','🌥️',
  '🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','💨','🌬️',
  '🌊','🌈','⚡','🌍','🌎','🌏','🗺️','🧊','🌋','🏔️',
  '⛰️','🏕️','🏖️','🏜️','🏝️','🏞️','🌄','🌅','🌆','🌉',
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
  '🏍️','🛵','🚲','⛵','🚢','🏠','🏡','🏢','🏣','🏤',
  '🏥','🏦','🏫','🏛️','🏗️','🏰','🏯','⛩️','🕌','⛪',
  '🕍','🗼','🗽','⛲','🎡','🎢','🎠',
  // スポーツ・活動
  '⚽','🏀','🏈','⚾','🎾','🏐','🏉','🥏','🎱','🏓',
  '🏸','🥊','🥋','🎿','⛷️','🏂','🏋️','🤸','⛹️','🏊',
  '🚴','🧘','🏄','🤾','🏇','⛺','🎣','🤿','🏹','🥅',
  // クリエイティブ・エンタメ
  '🎨','🖌️','🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎷',
  '🎤','🎙️','🎧','📸','📷','🎥','📽️','🎬','📺','📻',
  '🎮','🕹️','🎲','🎯','🎳','🎪','🎭','🖼️','🎟️','🎠',
  // ファッション・アクセサリー
  '👗','👒','🎩','🎓','👑','💍','💄','👓','🕶️','🥽',
  '👟','👠','👡','👢','🧣','🧤','🧥','👜','👛','🎒',
  // その他
  '🔮','💊','💉','🩺','🧬','⚗️','🔭','🌡️','🧭','💌',
  '📬','📦','🎁','🧨','🎆','🎇','🪄','🪆','🧸','🪁',
  '🎊','🎉','🎈','🎀','🎗️','🏮','🪔','🕯️','🔦','💡',
];

// ── PageLink ノード ──────────────────────────────────────────────────

function PageLinkView({ node, updateAttributes, deleteNode, getPos, editor: tiptapEditor }: NodeViewProps) {
  const router = useRouter();
  const onPageNavigate = useContext(PageNavigationContext);
  const { href, title: storedTitle, icon: storedIcon } = node.attrs as { href: string; title: string; icon: string };
  const pages = useNotionPageStore((s) => s.pages);
  const update = useNotionPageStore((s) => s.update);
  const { user } = useAuthStore();
  const pageId = href?.match(/\/notion-plus\/([^/?#]+)/)?.[1];
  const livePage = pageId ? pages.find((p) => p.id === pageId) : null;
  const title = livePage?.title || storedTitle || 'Untitled';
  const icon = livePage?.icon || storedIcon || '📄';
  // notion-child:// = インポート時に未解決のまま残ったリンク（ツリー外のページ等）
  const isUnresolved = !href || href.startsWith('notion-child://');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconUrlDraft, setIconUrlDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleIconChange = async (newIcon: string) => {
    if (pageId && user && livePage) {
      await update(user.uid, pageId, { icon: newIcon });
    } else {
      updateAttributes({ icon: newIcon });
    }
    setPickerOpen(false);
    setIconUrlDraft('');
  };

  const handleIconPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
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

  // リンク先ページの種別と、ノート⇄ブック変換（内容を保持する）
  const isBook = livePage?.type === 'book';
  const isDatabase = livePage?.type === 'database';

  const convertLinkedToBook = async () => {
    setContextMenu(null);
    if (!pageId || !user || !livePage) return;
    if (!window.confirm(`「${title}」をブックに変換しますか？\n現在の内容は第1章になります。`)) return;
    const firstChapter = { ...createBookChapter(0), content: livePage.content };
    await update(user.uid, pageId, {
      type: 'book',
      icon: livePage.icon === '📄' ? '📖' : livePage.icon,
      content: serializeBookChapters([firstChapter]),
    });
  };

  const convertLinkedToNote = async () => {
    setContextMenu(null);
    if (!pageId || !user || !livePage) return;
    if (!window.confirm(`「${title}」をノートに戻しますか？\n全チャプターの内容を1ページに結合します。`)) return;
    // 全チャプターの本文(doc)を1つの doc に結合して内容を保持
    const chapters = parseBookChapters(livePage.content);
    const merged: { type: 'doc'; content: unknown[] } = { type: 'doc', content: [] };
    for (const ch of chapters) {
      try {
        const doc = JSON.parse(ch.content) as { content?: unknown[] };
        if (Array.isArray(doc?.content)) merged.content.push(...doc.content);
      } catch { /* ignore */ }
    }
    await update(user.uid, pageId, {
      type: 'page', // 'page' = ノート扱い（undefined は merge で消えず反映されないため明示）
      content: JSON.stringify(merged),
    });
  };

  return (
    <NodeViewWrapper data-type="page-link" contentEditable={false}>
      {/* 右クリックコンテキストメニュー */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[200] min-w-[120px] rounded-lg border border-gray-100 bg-white py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {/* リンク先がノート/ブックのときだけ変換を出す（DB・未解決リンクは対象外） */}
          {livePage && !isDatabase && !isUnresolved && (
            <>
              {isBook ? (
                <button
                  onMouseDown={(e) => { e.preventDefault(); convertLinkedToNote(); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  📄 ノートに変換
                </button>
              ) : (
                <button
                  onMouseDown={(e) => { e.preventDefault(); convertLinkedToBook(); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  📚 ブックに変換
                </button>
              )}
              <div className="my-1 border-t border-gray-100" />
            </>
          )}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setContextMenu(null);
              const pos = typeof getPos === 'function' ? getPos() : undefined;
              if (typeof pos === 'number' && tiptapEditor) {
                // focus() を先に当てないと execCommand('cut') が ProseMirror に届かず無反応になる（貼り付けと同じ手順）
                tiptapEditor.chain().focus().setNodeSelection(pos).run();
                setTimeout(() => document.execCommand('cut'), 10);
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ✂️ 切り取り
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); setContextMenu(null); deleteNode(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
          >
            🗑️ 削除
          </button>
        </div>
      )}
      <div className="flex w-full items-center gap-1 py-px" onContextMenu={handleContextMenu}>
        <div className="relative" ref={pickerRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}
            className="rounded p-0.5 hover:bg-gray-100"
            title="アイコンを変更"
          >
            {/* 18px 固定枠・overflow-hidden+rounded で四角クリッピング */}
            {/* style={{ }} はCSSの height:auto より優先度が高いためバグ回避 */}
            <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center overflow-hidden rounded">
              {isImageSrc(icon) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" className="h-full w-full object-cover" style={{ height: '18px', width: '18px', aspectRatio: '1/1' }} />
              ) : (
                <span className="text-[14px] leading-none">{icon}</span>
              )}
            </span>
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-full z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
              <p className="mb-1 text-xs font-medium text-gray-400">画像URL / コピペ</p>
              <div className="flex gap-1">
                <input type="text" value={iconUrlDraft} onChange={(e) => setIconUrlDraft(e.target.value)}
                  onPaste={handleIconPaste}
                  onKeyDown={(e) => e.key === 'Enter' && iconUrlDraft && handleIconChange(iconUrlDraft)}
                  className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
                <button onClick={() => iconUrlDraft && handleIconChange(iconUrlDraft)} disabled={!iconUrlDraft}
                  className="rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600 disabled:opacity-40">設定</button>
              </div>
              {isImageSrc(iconUrlDraft) && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconUrlDraft} alt="" className="block h-8 w-8 rounded-md object-cover" style={{ aspectRatio: '1/1' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="text-xs text-gray-400">プレビュー</span>
                </div>
              )}
              <p className="mb-1 mt-3 text-xs font-medium text-gray-400">絵文字</p>
              <div className="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
                {EMOJI_PRESETS.map((emoji) => (
                  <button key={emoji} onClick={() => handleIconChange(emoji)}
                    className={`rounded p-1 text-base hover:bg-gray-100 ${icon === emoji ? 'bg-brand-50 ring-1 ring-brand-400' : ''}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {isUnresolved ? (
          <span
            className="cursor-not-allowed text-[0.95em] text-gray-400 line-through opacity-60"
            title="このページはインポートされていません（ツリー外の参照）"
          >
            {title || 'Untitled'}
          </span>
        ) : (
          <button onClick={() => onPageNavigate ? onPageNavigate(href) : router.push(href)} className="cursor-pointer hover:opacity-70">
            <span className="text-[0.95em] text-gray-700 underline">{title || 'Untitled'}</span>
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const PageLinkNode = TiptapNode.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      href: { default: null },
      title: { default: '' },
      icon: { default: '📄' },
    };
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="page-link"]' },
      { tag: 'span[data-type="page-link"]' }, // v1.1.28〜v1.1.31 インライン期間との後方互換
    ];
  },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'page-link' }]; },
  addNodeView() { return ReactNodeViewRenderer(PageLinkView); },
});

// ── URL メンション ノード ────────────────────────────────────────────

function UrlMentionView({ node }: NodeViewProps) {
  const { href, title, favicon } = node.attrs as { href: string; title: string; favicon: string };
  return (
    <NodeViewWrapper as="span">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        contentEditable={false}
        onClick={(e) => { e.preventDefault(); window.open(href, '_blank'); }}
        className="inline-flex cursor-pointer items-center gap-1 rounded text-blue-600 hover:opacity-75"
      >
        {favicon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={favicon} alt="" className="inline h-4 w-4 flex-shrink-0 rounded-sm object-cover" />
        )}
        <span className="underline">{title || href}</span>
      </a>
    </NodeViewWrapper>
  );
}

const UrlMentionNode = TiptapNode.create({
  name: 'urlMention',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      href:    { default: null },
      title:   { default: '' },
      favicon: { default: '' },
    };
  },
  parseHTML() { return [{ tag: 'a[data-type="url-mention"]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['a', { ...HTMLAttributes, 'data-type': 'url-mention', href: node.attrs.href }, node.attrs.title || node.attrs.href];
  },
  addNodeView() { return ReactNodeViewRenderer(UrlMentionView); },
});

// ── コールアウト ──────────────────────────────────────────────────────

const CALLOUT_BG_COLORS = [
  { label: '黄', value: '#FEF9CD' },
  { label: '青', value: '#D8EEF9' },
  { label: '緑', value: '#D8F3DC' },
  { label: '赤', value: '#FEE2E2' },
  { label: '紫', value: '#EDE9FE' },
  { label: 'グレー', value: '#F1F1EF' },
];

// ページテーブル（看板）のセクション背景色：見やすい淡色を多めに用意
const PT_SECTION_BG_COLORS = [
  { label: '黄', value: '#FEF9CD' },
  { label: 'オレンジ', value: '#FFEDD5' },
  { label: 'ベージュ', value: '#F5ECDD' },
  { label: '赤', value: '#FEE2E2' },
  { label: 'ローズ', value: '#FFE4E6' },
  { label: 'ピンク', value: '#FCE7F3' },
  { label: '紫', value: '#EDE9FE' },
  { label: 'ラベンダー', value: '#E0E7FF' },
  { label: '藍', value: '#DBEAFE' },
  { label: '青', value: '#D8EEF9' },
  { label: '水色', value: '#CFFAFE' },
  { label: 'ティール', value: '#CCFBF1' },
  { label: '緑', value: '#D8F3DC' },
  { label: 'ライム', value: '#ECFCCB' },
  { label: 'スレート', value: '#E2E8F0' },
  { label: 'グレー', value: '#F1F1EF' },
];

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const { background } = node.attrs as { background: string };
  const [colorOpen, setColorOpen] = useState(false);
  return (
    <NodeViewWrapper>
      <div className="relative my-2 rounded-lg px-4 py-3" style={{ background }} data-type="callout">
        <div contentEditable={false} className="absolute right-2 top-2">
          <button
            onClick={() => setColorOpen((v) => !v)}
            className="h-3 w-3 rounded-full border border-gray-300 opacity-40 hover:opacity-90 focus:outline-none"
            style={{ background: '#6b7280' }}
            title="背景色を変更"
          />
          {colorOpen && (
            <div className="absolute right-0 top-5 z-50 flex gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
              {CALLOUT_BG_COLORS.map((c) => (
                <button key={c.value} title={c.label}
                  onClick={() => { updateAttributes({ background: c.value }); setColorOpen(false); }}
                  className="h-5 w-5 rounded hover:ring-2 hover:ring-brand-400"
                  style={{ background: c.value, border: background === c.value ? '2px solid #7c3aed' : '1px solid #e5e7eb' }}
                />
              ))}
            </div>
          )}
        </div>
        <NodeViewContent className="callout-content" />
      </div>
    </NodeViewWrapper>
  );
}

const CalloutNode = TiptapNode.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() { return { background: { default: '#FEF9CD' } }; },
  parseHTML() { return [{ tag: 'div[data-type="callout"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'callout' }, 0]; },
  addNodeView() { return ReactNodeViewRenderer(CalloutView); },
});

// ── リサイザブル画像 ──────────────────────────────────────────────────

function ResizableImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const { src, alt, width } = node.attrs as { src: string; alt?: string; width?: number };
  const startX = useRef(0);
  const startW = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = containerRef.current?.offsetWidth ?? (width ?? 400);
    const onMove = (ev: MouseEvent) => {
      updateAttributes({ width: Math.max(80, Math.round(startW.current + (ev.clientX - startX.current))) });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper>
      <div ref={containerRef} className="relative my-2 inline-block" style={{ width: width ? `${width}px` : undefined, maxWidth: '100%' }} contentEditable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt || ''} className={`block w-full rounded-lg ${selected ? 'ring-2 ring-brand-400' : ''}`} />
        {selected && (
          <div className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize rounded-sm bg-brand-500 opacity-80 hover:opacity-100" onMouseDown={onResizeStart} />
        )}
      </div>
    </NodeViewWrapper>
  );
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}) },
    };
  },
  addNodeView() { return ReactNodeViewRenderer(ResizableImageView); },
});

// ── リサイザブル YouTube ──────────────────────────────────────────────

function ResizableYoutubeView({ node, selected, updateAttributes }: NodeViewProps) {
  const { src, width = 640, height = 360 } = node.attrs as { src: string; width: number; height: number };
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startW = useRef(0);
  const embedUrl = getYoutubeEmbedUrl(src);

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = containerRef.current?.offsetWidth ?? width;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:se-resize;';
    document.body.appendChild(overlay);
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(280, Math.round(startW.current + (ev.clientX - startX.current)));
      updateAttributes({ width: newW, height: Math.round(newW * 9 / 16) });
    };
    const onUp = () => { overlay.remove(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper>
      <div ref={containerRef} className="relative my-2" style={{ width: `${width}px`, maxWidth: '100%' }} contentEditable={false}>
        <iframe src={embedUrl} style={{ width: '100%', height: `${height}px` }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen className={`block rounded-lg ${selected ? 'ring-2 ring-brand-400' : ''}`} />
        {selected && (
          <div className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-brand-500 opacity-80 hover:opacity-100" onMouseDown={onResizeStart} />
        )}
      </div>
    </NodeViewWrapper>
  );
}

const ResizableYoutube = Youtube.extend({
  addNodeView() { return ReactNodeViewRenderer(ResizableYoutubeView); },
});

// ── トグル見出し ──────────────────────────────────────────────────────

function ToggleHeadingView({ node, updateAttributes }: NodeViewProps) {
  const { isOpen } = node.attrs as { isOpen: boolean };
  const [open, setOpen] = useState(isOpen);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    updateAttributes({ isOpen: next });
  };

  return (
    <NodeViewWrapper>
      <div className="relative pl-5 my-1">
        <button
          contentEditable={false}
          onClick={toggle}
          className="absolute left-0 top-[3px] text-[10px] text-gray-400 hover:text-gray-600 select-none leading-none"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        >
          ▶
        </button>
        <NodeViewContent className={open ? 'tg-open' : 'tg-closed'} />
      </div>
    </NodeViewWrapper>
  );
}

const ToggleHeadingNode = TiptapNode.create({
  name: 'toggleHeading',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      level: { default: 1 },
      isOpen: { default: true },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="toggle-heading"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'toggle-heading' }, 0]; },
  addNodeView() { return ReactNodeViewRenderer(ToggleHeadingView); },
  addInputRules() {
    return [
      new InputRule({
        find: /^_ $/,
        handler: ({ state, range, chain }) => {
          const $from = state.doc.resolve(range.from);
          const depth = $from.depth;
          const nodeFrom = depth > 0 ? $from.before(depth) : 0;
          const nodeTo = depth > 0 ? $from.after(depth) : state.doc.content.size;
          const { schema } = state;
          const toggleNode = schema.nodes.toggleHeading.create(
            { level: 1, isOpen: true },
            [schema.nodes.heading.create({ level: 1 }), schema.nodes.paragraph.create()],
          );
          chain().command(({ tr }) => {
            tr.replaceWith(nodeFrom, nodeTo, toggleNode);
            return true;
          }).run();
        },
      }),
    ];
  },
});

// ── 目次 ─────────────────────────────────────────────────────────────

function TocView({ editor }: NodeViewProps) {
  const [headings, setHeadings] = useState<{ level: number; text: string }[]>([]);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const items: { level: number; text: string }[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'heading') {
          items.push({ level: node.attrs.level as number, text: node.textContent });
        }
      });
      setHeadings(items);
    };
    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  const scrollTo = (text: string, level: number) => {
    if (!editor) return;
    let targetPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (targetPos !== -1) return false;
      if (node.type.name === 'heading' && node.attrs.level === level && node.textContent === text) {
        targetPos = pos;
      }
      return;
    });
    if (targetPos === -1) return;
    editor.commands.setTextSelection(targetPos + 1);
    const domNode = editor.view.domAtPos(targetPos + 1).node as HTMLElement;
    domNode?.closest?.('h1,h2,h3,h4,p')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="toc-block" contentEditable={false}>
        <p className="toc-block-title">目次</p>
        {headings.length === 0 ? (
          <p className="text-xs text-gray-400">見出しがありません</p>
        ) : (
          headings.map((h, i) => (
            <button key={i} onClick={() => scrollTo(h.text, h.level)}
              className={`toc-item toc-item-h${h.level} block w-full text-left`}>
              {h.text || '(見出しなし)'}
            </button>
          ))
        )}
      </div>
    </NodeViewWrapper>
  );
}

const TocNode = TiptapNode.create({
  name: 'toc',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'div[data-type="toc"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'toc' }]; },
  addNodeView() { return ReactNodeViewRenderer(TocView); },
});

// ── インラインデータベース埋め込み ────────────────────────────────────

function InlineDatabaseEmbed({ node }: NodeViewProps) {
  const router = useRouter();
  const onPageNavigate = useContext(PageNavigationContext);
  const uid = useContext(EditorUidContext);
  const { databaseId, title: nodeTitle } = node.attrs as { databaseId: string; title: string };
  const pages = useNotionPageStore((s) => s.pages);
  const { rows, subscribeRows } = useDbRowStore();
  const page = pages.find((p) => p.id === databaseId);
  const schema = useMemo(() => parseDbSchema(page?.content ?? ''), [page?.content]);

  useEffect(() => {
    if (!uid || !databaseId) return;
    const unsub = subscribeRows(uid, databaseId);
    return unsub;
  }, [uid, databaseId, subscribeRows]);

  const displayTitle = page?.title || nodeTitle || 'データベース';
  const href = `/notion-plus/${databaseId}`;
  const PREVIEW_LIMIT = 5;
  const previewRows = rows.slice(0, PREVIEW_LIMIT);
  const extraRows = rows.length - PREVIEW_LIMIT;

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="border rounded-lg overflow-hidden my-2 text-xs" contentEditable={false}>
        {/* ヘッダーバー */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5">
          <span className="flex items-center gap-1.5 font-medium text-gray-700">
            <span>📊</span>
            <span>{displayTitle}</span>
          </span>
          <button
            onClick={() => href && (onPageNavigate ? onPageNavigate(href) : router.push(href))}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            ↗ 開く
          </button>
        </div>
        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="min-w-max border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {schema.properties.map((prop) => (
                  <th key={prop.id} className="px-2 py-1 text-left text-[10px] font-semibold text-gray-400 border-r border-gray-100 last:border-r-0 whitespace-nowrap">
                    {prop.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={schema.properties.length} className="px-2 py-2 text-center text-gray-300">
                    データなし
                  </td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 last:border-b-0">
                    {schema.properties.map((prop) => {
                      const val = row.cells[prop.id] ?? null;
                      let display = '';
                      if (val === null || val === undefined) display = '';
                      else if (typeof val === 'boolean') display = val ? '✓' : '';
                      else if (prop.type === 'select') {
                        const opt = prop.options?.find((o) => o.id === val);
                        display = opt?.name ?? '';
                      } else display = String(val);
                      return (
                        <td key={prop.id} className="px-2 py-1 border-r border-gray-50 last:border-r-0 min-w-[80px] whitespace-nowrap text-gray-700">
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
              {extraRows > 0 && (
                <tr>
                  <td colSpan={schema.properties.length} className="px-2 py-1 text-center text-[10px] text-gray-400">
                    +{extraRows}行
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </NodeViewWrapper>
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
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="inline-database"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'inline-database' }]; },
  addNodeView() { return ReactNodeViewRenderer(InlineDatabaseEmbed); },
});

// ── ページテーブル（ページリンク整理ボード）────────────────────────────
// 大見出し（セクション）＋列（小見出し）＋各列にページリンクの縦並び、で整理する。
// データはノード attrs.sections に保持（本文JSON内・新規DB不要）。

interface PtLink { href: string; title: string; icon: string }
interface PtColumn { id: string; heading: string; links: PtLink[]; color?: string; width?: number }
interface PtSection { id: string; title: string; columns: PtColumn[]; framed?: boolean; bg?: string; borderWidth?: number }

const PT_DEFAULT_COLOR = '#F1F1EF'; // リスト（カンバン列）の既定背景＝淡グレー
const PT_DEFAULT_WIDTH = 240;       // リストの既定幅(px)
const PT_MIN_WIDTH = 160;
const PT_MAX_WIDTH = 520;

const ptNewId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `pt-${Date.now()}-${performance.now()}`;

function ptDefaultSections(): PtSection[] {
  return [{
    id: ptNewId(),
    title: '',
    columns: [
      { id: ptNewId(), heading: '', links: [] },
      { id: ptNewId(), heading: '', links: [] },
    ],
  }];
}

function ptParseSections(raw: unknown): PtSection[] {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (Array.isArray(v) && v.length > 0) return v as PtSection[];
  return ptDefaultSections();
}

const ptIdFromHref = (href: string) => href?.match(/\/notion-plus\/([^/?#]+)/)?.[1];

function PageTableView({ node, updateAttributes, editor: ptEditor }: NodeViewProps) {
  const router = useRouter();
  const onPageNavigate = useContext(PageNavigationContext);
  const currentPageId = useContext(EditorPageIdContext);
  const { user } = useAuthStore();
  const pages = useNotionPageStore((s) => s.pages);
  const addPage = useNotionPageStore((s) => s.add);

  const sections = useMemo(() => ptParseSections(node.attrs.sections), [node.attrs.sections]);
  const commit = useCallback((next: PtSection[]) => updateAttributes({ sections: next }), [updateAttributes]);

  // 切り取り中のリンク位置（移動用・実データは貼り付け時に移す＝消失しない）
  const [cut, setCut] = useState<{ s: number; c: number; i: number } | null>(null);
  // ＋追加ピッカー（どの列に追加するか）。位置は fixed＋portal で最前面に出す（スクロール領域に切られない）
  const [picker, setPicker] = useState<{ s: number; c: number } | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState('');
  const [colorOpenCol, setColorOpenCol] = useState<{ s: number; c: number } | null>(null);
  const [colorPos, setColorPos] = useState<{ top: number; left: number } | null>(null);
  const [sectionMenu, setSectionMenu] = useState<number | null>(null);
  const [sectionMenuPos, setSectionMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [resizing, setResizing] = useState<{ s: number; c: number; w: number } | null>(null);
  const dragSrc = useRef<{ s: number; c: number; i: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // ホバー枠の中だと消えるので、色/セクションメニューは最前面ポータルで開く（位置をボタンから算出）
  const openColorMenu = (e: React.MouseEvent, si: number, ci: number) => {
    if (colorOpenCol?.s === si && colorOpenCol?.c === ci) { setColorOpenCol(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setColorPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 70, window.innerWidth - 200)) });
    setColorOpenCol({ s: si, c: ci });
  };
  const openSectionMenu = (e: React.MouseEvent, si: number) => {
    if (sectionMenu === si) { setSectionMenu(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSectionMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 200)) });
    setSectionMenu(si);
  };

  // ⑤ 重複排除: 看板に入れたページは、同じ本文内の単体ページリンクを削除（看板を正の場所にする）
  const removeBodyPageLink = (href: string) => {
    const id = ptIdFromHref(href);
    if (!id || !ptEditor) return;
    const dels: { from: number; to: number }[] = [];
    ptEditor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'pageLink') {
        const h = n.attrs.href as string;
        if (h && ptIdFromHref(h) === id) dels.push({ from: pos, to: pos + n.nodeSize });
      }
    });
    if (!dels.length) return;
    let tr = ptEditor.state.tr;
    dels.sort((a, b) => b.from - a.from).forEach((d) => { tr = tr.delete(d.from, d.to); });
    ptEditor.view.dispatch(tr);
  };

  const openPicker = (e: React.MouseEvent, si: number, ci: number) => {
    const isSame = picker?.s === si && picker?.c === ci;
    if (isSame) { setPicker(null); setPickerPos(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const W = 240, H = 290;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    let top = r.bottom + 4;
    if (top + H > window.innerHeight) top = Math.max(8, r.top - H - 4); // 下にはみ出すなら上に開く
    setPickerPos({ top, left });
    setPicker({ s: si, c: ci });
    setQuery('');
  };
  const closePicker = () => { setPicker(null); setPickerPos(null); setQuery(''); };

  useEffect(() => {
    if (!picker) return;
    const h = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) { setPicker(null); setPickerPos(null); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [picker]);

  // ── セクション操作 ──
  const setSection = (si: number, fn: (s: PtSection) => PtSection) =>
    commit(sections.map((s, i) => (i === si ? fn(s) : s)));
  const addSection = () => commit([...sections, { id: ptNewId(), title: '', columns: [{ id: ptNewId(), heading: '', links: [] }, { id: ptNewId(), heading: '', links: [] }] }]);
  const removeSection = (si: number) => commit(sections.filter((_, i) => i !== si));
  const moveSection = (si: number, dir: -1 | 1) => {
    const j = si + dir; if (j < 0 || j >= sections.length) return;
    const next = [...sections]; [next[si], next[j]] = [next[j], next[si]]; commit(next);
  };

  // ── 列操作 ──
  const addColumn = (si: number) => setSection(si, (s) => ({ ...s, columns: [...s.columns, { id: ptNewId(), heading: '', links: [] }] }));
  const removeColumn = (si: number, ci: number) => setSection(si, (s) => ({ ...s, columns: s.columns.filter((_, i) => i !== ci) }));
  const moveColumn = (si: number, ci: number, dir: -1 | 1) => setSection(si, (s) => {
    const j = ci + dir; if (j < 0 || j >= s.columns.length) return s;
    const cols = [...s.columns]; [cols[ci], cols[j]] = [cols[j], cols[ci]]; return { ...s, columns: cols };
  });
  const setColumnColor = (si: number, ci: number, color: string) =>
    setSection(si, (s) => ({ ...s, columns: s.columns.map((c, i) => (i === ci ? { ...c, color } : c)) }));
  const setColumnWidth = (si: number, ci: number, width: number) =>
    setSection(si, (s) => ({ ...s, columns: s.columns.map((c, i) => (i === ci ? { ...c, width } : c)) }));
  const toggleFramed = (si: number) => setSection(si, (s) => ({ ...s, framed: s.framed === false }));
  const setSectionBg = (si: number, bg: string) => setSection(si, (s) => ({ ...s, bg: bg || undefined }));
  const setSectionBorderWidth = (si: number, w: number) => setSection(si, (s) => ({ ...s, borderWidth: w }));

  // リスト幅のドラッグリサイズ（移動中はローカル state、離したら確定）
  const startResize = (e: React.MouseEvent, si: number, ci: number, startW: number) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const clamp = (w: number) => Math.max(PT_MIN_WIDTH, Math.min(PT_MAX_WIDTH, w));
    setResizing({ s: si, c: ci, w: startW });
    const onMove = (ev: MouseEvent) => setResizing({ s: si, c: ci, w: clamp(startW + (ev.clientX - startX)) });
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      setResizing(null); setColumnWidth(si, ci, clamp(startW + (ev.clientX - startX)));
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  // カードのドラッグ移動（リスト間/並べ替え）。tIndex の位置に挿入
  const dropCard = (ts: number, tc: number, tIndex: number) => {
    const src = dragSrc.current; dragSrc.current = null;
    if (!src) return;
    const moved = sections[src.s]?.columns[src.c]?.links[src.i];
    if (!moved) return;
    const removed = sections.map((s, si) => ({
      ...s,
      columns: s.columns.map((c, ci) =>
        (si === src.s && ci === src.c) ? { ...c, links: c.links.filter((_, k) => k !== src.i) } : c),
    }));
    let idx = tIndex;
    if (src.s === ts && src.c === tc && src.i < tIndex) idx = tIndex - 1; // 同リストで前を抜いた分ずらす
    const next = removed.map((s, si) => ({
      ...s,
      columns: s.columns.map((c, ci) => {
        if (!(si === ts && ci === tc)) return c;
        const links = [...c.links]; links.splice(idx, 0, moved); return { ...c, links };
      }),
    }));
    commit(next);
  };

  // ── リンク操作 ──
  const addLink = (si: number, ci: number, link: PtLink) => setSection(si, (s) => ({
    ...s, columns: s.columns.map((c, i) => (i === ci ? { ...c, links: [...c.links, link] } : c)),
  }));
  const removeLink = (si: number, ci: number, li: number) => setSection(si, (s) => ({
    ...s, columns: s.columns.map((c, i) => (i === ci ? { ...c, links: c.links.filter((_, k) => k !== li) } : c)),
  }));
  // 切り取り→貼り付け（列・セクションをまたいで移動）
  const pasteHere = (ts: number, tc: number) => {
    if (!cut) return;
    const moved = sections[cut.s]?.columns[cut.c]?.links[cut.i];
    if (!moved) { setCut(null); return; }
    const next = sections.map((s, si) => ({
      ...s,
      columns: s.columns.map((c, ci) => {
        let links = c.links;
        if (si === cut.s && ci === cut.c) links = links.filter((_, k) => k !== cut.i);
        if (si === ts && ci === tc) links = [...links, moved];
        return links === c.links ? c : { ...c, links };
      }),
    }));
    commit(next); setCut(null);
  };

  // 既存ページ追加（看板に入れたら本文の単体リンクは重複排除で消す）
  const pickExisting = (si: number, ci: number, p: NotionPage) => {
    const href = `/notion-plus/${p.id}`;
    addLink(si, ci, { href, title: p.title || 'Untitled', icon: p.icon || '📄' });
    removeBodyPageLink(href);
    closePicker();
  };
  // 新規サブページ作成して追加（現在ページの子にする）
  const createAndAdd = async (si: number, ci: number) => {
    if (!user) return;
    const np = await addPage(user.uid, currentPageId ? { parentId: currentPageId } : {});
    addLink(si, ci, { href: `/notion-plus/${np.id}`, title: np.title || 'Untitled', icon: np.icon || '📄' });
    closePicker();
  };

  const navigate = (href: string) => onPageNavigate ? onPageNavigate(href) : router.push(href);

  const filteredPages = pages
    .filter((p) => (p.title || '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);

  return (
    <NodeViewWrapper data-type="page-table" contentEditable={false}>
      <div className="page-table my-3" contentEditable={false}>
        {sections.map((sec, si) => {
          const framed = sec.framed !== false; // 既定で枠あり（明示 false のみ枠なし）
          const panel = framed || !!sec.bg;    // 枠 or 背景があれば角丸＋余白のパネルに
          return (
          <div key={sec.id} className={`mb-5 ${panel ? 'rounded-2xl p-4' : ''}`}
            style={{
              background: sec.bg || undefined,
              ...(framed ? { borderStyle: 'solid', borderColor: '#d1d5db', borderWidth: `${sec.borderWidth ?? 1}px` } : {}),
            }}>
            {/* 大見出し（大きめ見出し） */}
            <div className="group/sec mb-3 flex items-center gap-1.5">
              <input
                value={sec.title}
                onChange={(e) => setSection(si, (s) => ({ ...s, title: e.target.value }))}
                placeholder="大見出し"
                className="min-w-0 max-w-md flex-none bg-transparent text-xl font-bold text-gray-800 outline-none placeholder:font-bold placeholder:text-gray-300"
              />
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/sec:opacity-100">
                {si > 0 && <button onClick={() => moveSection(si, -1)} className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100" title="上へ">↑</button>}
                {si < sections.length - 1 && <button onClick={() => moveSection(si, 1)} className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100" title="下へ">↓</button>}
                <button onClick={(e) => openSectionMenu(e, si)} className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100" title="セクション設定">⚙</button>
              </span>
            </div>
            {/* カンバン: リスト（コールアウト風カード）を横並び＋折り返し。items-stretch で同列のリスト高さを揃える */}
            <div className="flex flex-wrap items-stretch gap-3">
              {sec.columns.map((col, ci) => {
                const w = (resizing && resizing.s === si && resizing.c === ci) ? resizing.w : (col.width || PT_DEFAULT_WIDTH);
                return (
                <div key={col.id} className="group/col relative shrink-0 rounded-xl p-2" style={{ width: w, background: col.color || PT_DEFAULT_COLOR }}>
                  {/* リスト見出し */}
                  <div className="mb-1.5 flex items-center gap-0.5 px-1">
                    <input
                      value={col.heading}
                      onChange={(e) => setSection(si, (s) => ({ ...s, columns: s.columns.map((c, k) => (k === ci ? { ...c, heading: e.target.value } : c)) }))}
                      placeholder="リスト名"
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-700 outline-none placeholder:font-normal placeholder:text-gray-400"
                    />
                    {/* カード追加（上部・常時表示）。下部の「＋カードを追加」は廃止し見やすさ優先 */}
                    <button onClick={(e) => openPicker(e, si, ci)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-black/5 hover:text-brand-500" title="カードを追加">＋</button>
                    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/col:opacity-100">
                      {/* 色変更 */}
                      <button onClick={(e) => openColorMenu(e, si, ci)} className="flex h-5 w-5 items-center justify-center rounded hover:bg-black/5" title="色を変更">
                        <span className="block h-3.5 w-3.5 rounded-full border border-black/15" style={{ background: col.color || PT_DEFAULT_COLOR }} />
                      </button>
                      {ci > 0 && <button onClick={() => moveColumn(si, ci, -1)} className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-black/5 hover:text-gray-700" title="左へ">‹</button>}
                      {ci < sec.columns.length - 1 && <button onClick={() => moveColumn(si, ci, 1)} className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-black/5 hover:text-gray-700" title="右へ">›</button>}
                      {sec.columns.length > 1 && <button onClick={() => removeColumn(si, ci)} className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-black/5 hover:text-red-400" title="リスト削除">✕</button>}
                    </span>
                  </div>
                  {/* カード群（空きへドロップで末尾に移動）。空リストでもドロップできるよう最小高さを確保 */}
                  <div className="min-h-[20px] space-y-1.5"
                    onDragOver={(e) => { if (dragSrc.current) { e.preventDefault(); e.stopPropagation(); } }}
                    onDrop={(e) => { if (dragSrc.current) { e.preventDefault(); e.stopPropagation(); dropCard(si, ci, col.links.length); } }}>
                    {col.links.map((lk, li) => {
                      const live = pages.find((p) => p.id === ptIdFromHref(lk.href));
                      const title = live?.title || lk.title || 'Untitled';
                      const icon = live?.icon || lk.icon || '📄';
                      const isCut = cut?.s === si && cut?.c === ci && cut?.i === li;
                      return (
                        <div key={li} draggable
                          onDragStart={(e) => { dragSrc.current = { s: si, c: ci, i: li }; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); }}
                          onDragEnd={() => { dragSrc.current = null; }}
                          onDragOver={(e) => { if (dragSrc.current) { e.preventDefault(); e.stopPropagation(); } }}
                          onDrop={(e) => { if (dragSrc.current) { e.preventDefault(); e.stopPropagation(); dropCard(si, ci, li); } }}
                          className={`group/lk flex min-h-[34px] cursor-grab items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/[0.04] transition hover:ring-brand-200 active:cursor-grabbing ${isCut ? 'opacity-40 ring-2 ring-brand-300' : ''}`}>
                          {/* アイコンは絵文字でも画像でも 16px 角の枠に収めて行高を一定にする（カード高さ統一） */}
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden text-[13px] leading-none">{isImageSrc(icon)
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={icon} alt="" className="h-4 w-4 rounded object-cover" />
                            : icon}</span>
                          <button onClick={() => navigate(lk.href)} className="min-w-0 flex-1 break-words text-left text-[13px] leading-snug text-gray-700 hover:text-brand-600" title={title}>
                            {title}
                          </button>
                          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/lk:opacity-100">
                            <button onClick={() => setCut(isCut ? null : { s: si, c: ci, i: li })} className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-brand-500" title={isCut ? '切り取り解除' : '切り取り'}>✂</button>
                            <button onClick={() => removeLink(si, ci, li)} className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-red-400" title="削除">✕</button>
                          </span>
                        </div>
                      );
                    })}
                    {/* 貼り付け先（切り取り中のみ） */}
                    {cut && (
                      <button onClick={() => pasteHere(si, ci)} className="w-full rounded-lg border border-dashed border-brand-300 bg-white/60 px-2 py-1 text-[11px] text-brand-500 hover:bg-white">
                        ここに貼り付け
                      </button>
                    )}
                  </div>
                  {/* 幅リサイズハンドル（右端） */}
                  <div onMouseDown={(e) => startResize(e, si, ci, col.width || PT_DEFAULT_WIDTH)}
                    className="absolute -right-1 top-0 h-full w-2 cursor-col-resize opacity-0 transition group-hover/col:opacity-100"
                    title="幅を変更">
                    <span className="absolute right-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-gray-300" />
                  </div>
                </div>
                );
              })}
              {/* リスト追加 */}
              <button onClick={() => addColumn(si)}
                className="shrink-0 self-start rounded-xl border-2 border-dashed border-gray-200 px-3 py-2 text-left text-[12px] text-gray-400 transition hover:border-gray-300 hover:text-gray-600">
                ＋ リストを追加
              </button>
            </div>
          </div>
          );
        })}
        {/* 大見出し追加 */}
        <button onClick={addSection} className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-50 hover:text-brand-500">
          ＋ 大見出しを追加
        </button>
      </div>
      {/* メニューの外側クリックで閉じる薄い背景 */}
      {(sectionMenu !== null || colorOpenCol) && (
        <div className="fixed inset-0 z-[5]" onMouseDown={() => { setSectionMenu(null); setSectionMenuPos(null); setColorOpenCol(null); setColorPos(null); }} />
      )}
      {/* 色メニュー（最前面ポータル） */}
      {(() => {
        if (!colorOpenCol || !colorPos || typeof document === 'undefined') return null;
        const co = colorOpenCol;
        const cur = sections[co.s]?.columns[co.c]?.color || PT_DEFAULT_COLOR;
        return createPortal(
          <div style={{ position: 'fixed', top: colorPos.top, left: colorPos.left }}
            className="z-[1000] flex gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-2xl">
            {CALLOUT_BG_COLORS.map((c) => (
              <button key={c.value} title={c.label} onClick={() => { setColumnColor(co.s, co.c, c.value); setColorOpenCol(null); setColorPos(null); }}
                className="h-6 w-6 rounded-full hover:ring-2 hover:ring-brand-300"
                style={{ background: c.value, border: cur === c.value ? '2px solid #7c3aed' : '1px solid #e5e7eb' }} />
            ))}
          </div>,
          document.body,
        );
      })()}
      {/* セクション設定メニュー（最前面ポータル） */}
      {(() => {
        if (sectionMenu === null || !sectionMenuPos || typeof document === 'undefined') return null;
        const si = sectionMenu;
        const isFramed = sections[si]?.framed !== false;
        const curBg = sections[si]?.bg || '';
        return createPortal(
          <div style={{ position: 'fixed', top: sectionMenuPos.top, left: sectionMenuPos.left }}
            className="z-[1000] w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl">
            <label className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
              <span>枠で囲む</span>
              <input type="checkbox" checked={isFramed} onChange={() => toggleFramed(si)} className="h-4 w-4 accent-brand-500" />
            </label>
            {/* 枠線の太さ（枠ありのときだけ） */}
            {isFramed && (
              <div className="mt-1 px-1.5 py-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">枠線の太さ</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((w) => (
                    <button key={w} onClick={() => setSectionBorderWidth(si, w)}
                      className={`flex-1 rounded border py-1 text-[11px] transition ${(sections[si]?.borderWidth ?? 1) === w ? 'border-brand-400 bg-brand-50 font-medium text-brand-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* セクション背景色（枠の中） */}
            <div className="mt-1 px-1.5 py-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">背景色</p>
              <div className="flex flex-wrap gap-1">
                {[{ label: 'なし', value: '' }, ...PT_SECTION_BG_COLORS].map((c) => (
                  <button key={c.value || 'none'} title={c.label} onClick={() => setSectionBg(si, c.value)}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:ring-2 hover:ring-brand-300"
                    style={{ background: c.value || '#ffffff', border: curBg === c.value ? '2px solid #7c3aed' : '1px solid #e5e7eb' }}>
                    {c.value === '' && <span className="text-[10px] leading-none text-gray-300">/</span>}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => { addColumn(si); setSectionMenu(null); setSectionMenuPos(null); }} className="mt-0.5 w-full rounded px-1.5 py-1 text-left text-xs text-gray-600 hover:bg-gray-50">＋ リストを追加</button>
            {sections.length > 1 && (
              <button onClick={() => { removeSection(si); setSectionMenu(null); setSectionMenuPos(null); }} className="mt-0.5 w-full rounded px-1.5 py-1 text-left text-xs text-red-500 hover:bg-red-50">🗑️ この大見出しを削除</button>
            )}
          </div>,
          document.body,
        );
      })()}
      {/* ＋追加ピッカー: portal＋fixed で最前面（スクロール領域に切られない）*/}
      {(() => {
        if (!picker || !pickerPos || typeof document === 'undefined') return null;
        const pk = picker;
        return createPortal(
          <div ref={pickerRef} style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, width: 240 }}
            className="z-[1000] rounded-xl border border-gray-200 bg-white p-2 shadow-2xl">
            <button onMouseDown={(e) => { e.preventDefault(); createAndAdd(pk.s, pk.c); }}
              className="mb-1 flex w-full items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100">
              ＋ 新規ページを作成して追加
            </button>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="既存ページを検索..."
              className="mb-1 w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
            <div className="max-h-52 overflow-y-auto">
              {filteredPages.length === 0 ? (
                <p className="px-2 py-1 text-xs text-gray-400">該当なし</p>
              ) : filteredPages.map((p) => (
                <button key={p.id} onMouseDown={(e) => { e.preventDefault(); pickExisting(pk.s, pk.c, p); }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50">
                  <span className="shrink-0 text-sm leading-none">{isImageSrc(p.icon)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.icon} alt="" className="h-4 w-4 rounded object-cover" />
                    : (p.icon || '📄')}</span>
                  <span className="truncate">{p.title || 'Untitled'}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        );
      })()}
    </NodeViewWrapper>
  );
}

const PageTableNode = TiptapNode.create({
  name: 'pageTable',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      sections: {
        default: null,
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute('data-sections') || 'null'); } catch { return null; } },
        renderHTML: (attrs) => ({ 'data-sections': JSON.stringify(attrs.sections ?? []) }),
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="page-table"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'page-table' }]; },
  addNodeView() { return ReactNodeViewRenderer(PageTableView); },
});

// ── テーブル拡張（セル背景色対応）───────────────────────────────────

const TABLE_CELL_COLORS = [
  { label: 'なし', value: '' },
  { label: 'グレー', value: '#F1F1EF' },
  { label: '黄', value: '#FEF9CD' },
  { label: '緑', value: '#D8F3DC' },
  { label: '青', value: '#D8EEF9' },
  { label: '赤', value: '#FEE2E2' },
  { label: '紫', value: '#EDE9FE' },
  { label: 'ピンク', value: '#FCE7F3' },
];

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-bg') || null,
        renderHTML: (attrs) => attrs.backgroundColor
          ? { 'data-bg': attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` }
          : {},
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-bg') || null,
        renderHTML: (attrs) => attrs.backgroundColor
          ? { 'data-bg': attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` }
          : {},
      },
    };
  },
});

// ── マークダウンショートカット（- スペース → 箇条書き）────────────────
// StarterKit の BulletList にも同等の InputRule が含まれているが、
// カスタム拡張との競合対策として明示的に追加して確実に動作させる
const MarkdownBulletShortcut = Extension.create({
  name: 'markdownBulletShortcut',
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\s*-\s$/,
        type: this.editor.schema.nodes.bulletList,
      }),
    ];
  },
});

// ── コードブロック ``` ショートカット ──────────────────────────────────
// StarterKit の CodeBlock にも同等の InputRule があるが、明示追加で確実に動作させる
// 行頭に ``` + スペース or Enter でコードブロックに変換
const MarkdownCodeBlockShortcut = Extension.create({
  name: 'markdownCodeBlockShortcut',
  priority: 150,
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-z]*)\s$/,
        type: this.editor.schema.nodes.codeBlock,
        getAttributes: (match) => ({ language: match[1] || null }),
      }),
    ];
  },
});

// ── Ctrl+B 行全体 bold トグル ──────────────────────────────────────────
// テキスト未選択時のみ発動。選択中は StarterKit の toggleBold に委譲。
// ・行のすべてが bold → 全解除
// ・一部だけ bold / bold なし → 一旦すべて解除してから全体に bold 適用
const LineBoldShortcut = Extension.create({
  name: 'lineBoldShortcut',
  priority: 200, // StarterKit の Bold (priority 100) より先にキーを捕捉
  addKeyboardShortcuts() {
    return {
      'Mod-b': () => {
        const { state } = this.editor.view;
        const { selection } = state;

        // テキスト選択中は通常の toggleBold に任せる
        if (!selection.empty) return false;

        const { $from } = selection;
        const boldMark = state.schema.marks.bold;
        if (!boldMark) return false;

        // カーソルがいるブロック（段落・見出し等）の内容範囲を取得
        const depth = $from.depth;
        const blockStart = $from.start(depth);
        const blockEnd = $from.end(depth);

        if (blockStart >= blockEnd) return true; // 空行は何もしない

        // 行内の全テキストノードが bold かチェック
        let allBold = true;
        let hasText = false;

        state.doc.nodesBetween(blockStart, blockEnd, (node) => {
          if (node.isText) {
            hasText = true;
            if (!boldMark.isInSet(node.marks)) {
              allBold = false;
            }
          }
          return true;
        });

        if (!hasText) return true; // テキストノードなし（画像のみ等）

        const tr = state.tr;
        // まず行全体の bold をすべて除去
        tr.removeMark(blockStart, blockEnd, boldMark);
        // 全部 bold でなかった場合（none or partial）→ 全体に bold を付与
        if (!allBold) {
          tr.addMark(blockStart, blockEnd, boldMark.create());
        }

        this.editor.view.dispatch(tr);
        return true;
      },
    };
  },
});

// ── スラッシュコマンド ──────────────────────────────────────────────

interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action?: (editor: ReturnType<typeof useEditor>) => void;
  asyncAction?: (editor: ReturnType<typeof useEditor>) => Promise<void>;
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
  { label: 'コールアウト',       description: '目立つ注釈ブロック',   icon: '💡',  action: (e) => e?.chain().focus().insertContent({ type: 'callout', attrs: { background: '#FEF9CD' }, content: [{ type: 'paragraph' }] }).run() },
  { label: '引用',               description: 'ブロック引用',         icon: '❝',  action: (e) => e?.chain().focus().toggleBlockquote().run() },
  { label: 'コード',             description: 'コードブロック',       icon: '</>', action: (e) => e?.chain().focus().toggleCodeBlock().run() },
  { label: '区切り線',           description: '水平線',               icon: '—',  action: (e) => e?.chain().focus().setHorizontalRule().run() },
  { label: 'ページテーブル',     description: 'ページリンクを整理する表', icon: '▦',  action: (e) => e?.chain().focus().insertContent({ type: 'pageTable', attrs: { sections: ptDefaultSections() } }).run() },
];

// ── カラーパレット ────────────────────────────────────────────────────

const TEXT_COLORS = [
  { label: 'デフォルト', value: '' },
  { label: '赤',         value: '#DC2626' },
  { label: 'オレンジ',   value: '#EA580C' },
  { label: '黄',         value: '#CA8A04' },
  { label: '緑',         value: '#16A34A' },
  { label: '青',         value: '#2563EB' },
  { label: '紫',         value: '#7C3AED' },
  { label: 'ピンク',     value: '#DB2777' },
  { label: 'グレー',     value: '#6B7280' },
];

const BG_COLORS = [
  { label: 'デフォルト', value: '' },
  { label: 'グレー',     value: '#F1F1EF' },
  { label: 'ブラウン',   value: '#F3E8DC' },
  { label: 'オレンジ',   value: '#FDEBD0' },
  { label: '黄',         value: '#FEF9CD' },
  { label: '緑',         value: '#D8F3DC' },
  { label: '青',         value: '#D8EEF9' },
  { label: '紫',         value: '#EDE9FE' },
  { label: 'ピンク',     value: '#FCE7F3' },
  { label: '赤',         value: '#FEE2E2' },
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
}

export function NotionEditor({
  initialTitle, initialContent, onSave, onCreateSubPage,
  recordTriggerRef, onRecordText, notionPageId, notionPagePath, highlightText, onPageNavigate,
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

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [pastePopup, setPastePopup] = useState<PastePopup | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [recordText, setRecordText] = useState<string | null>(null);

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

  const pasteUrlCallbackRef = useRef<((url: string, coords: { bottom: number; left: number }) => void) | null>(null);
  pasteUrlCallbackRef.current = (url, coords) => {
    setPastePopup({ url, pos: { top: coords.bottom + 8, left: coords.left }, isYoutube: isYouTubeUrl(url) });
  };

  const { user } = useAuthStore();
  const { add: addPage } = useNotionPageStore();

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
      }),
      Placeholder.configure({ placeholder: '書き始めるか、「/」でコマンドを入力...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: true, autolink: true }),
      ResizableImage.configure({ allowBase64: true, inline: false }),
      TextStyle,
      Color,
      Underline,
      ResizableYoutube.configure({ width: 640, height: 360, nocookie: true }),
      Table.configure({ resizable: true }),
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
          const coords = view.coordsAtPos(view.state.selection.from);
          pasteUrlCallbackRef.current?.(text, coords);
          return true;
        }
        return false;
      },
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
    if (cmd.asyncAction) {
      await cmd.asyncAction(editor);
    } else if (cmd.action) {
      cmd.action(editor);
    }
    setSlashOpen(false);
    slashStartPos.current = null;
  }, [editor]);

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
      const highlightMark = editor.state.schema.marks.highlight?.create({ color: '#FDE68A' });
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
    editor?.chain().focus().insertContent({ type: 'callout', attrs: { background: '#FEF9CD' }, content: [{ type: 'paragraph' }] }).run();
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
    const url = pastePopup.url;
    setPastePopup(null);
    setPasteLoading(true);
    try {
      const res = await fetch(`/api/url-preview?url=${encodeURIComponent(url)}`);
      const data = await res.json() as { title?: string; favicon?: string };
      editor.chain().focus().insertContent({ type: 'urlMention', attrs: { href: url, title: data.title ?? url, favicon: data.favicon ?? '' } }).run();
    } catch {
      editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url, target: '_blank' } }] }).run();
    } finally { setPasteLoading(false); }
  }, [pastePopup, editor]);

  const handlePasteUrl = useCallback(() => {
    if (!pastePopup || !editor) return;
    const url = pastePopup.url;
    setPastePopup(null);
    editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' } }] }).run();
  }, [pastePopup, editor]);

  const handlePasteYoutube = useCallback(() => {
    if (!pastePopup || !editor) return;
    const url = pastePopup.url;
    setPastePopup(null);
    editor.chain().focus().setYoutubeVideo({ src: url }).run();
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

  const outerClass = `relative flex flex-1 overflow-y-auto py-8 ${notionPlusLayout === 'center' ? 'justify-center px-6' : 'pl-16 pr-8'}`;

  return (
    <EditorUidContext.Provider value={user?.uid ?? ''}>
    <EditorPageIdContext.Provider value={notionPageId ?? ''}>
    <PageNavigationContext.Provider value={onPageNavigate ?? null}>
    <div
      className={outerClass}
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
        {/* ブック: チャプター名を書式バーの下にタイトル（セクション見出し）として表示 */}
        {chapterHeading && (
          <div className="mb-5 mt-1 flex items-center gap-3 border-b-2 border-gray-100 pb-2">
            <span className="h-7 w-1.5 shrink-0 rounded-full bg-brand-400" />
            <h1 className="text-2xl font-bold text-gray-900">{chapterHeading}</h1>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* スラッシュコマンドメニュー */}
      {slashOpen && filteredCommands.length > 0 && (
        <div className="fixed z-50 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left, maxHeight: 'min(400px, 80vh)' }}>
          <p className="px-3 py-1 text-xs font-medium text-gray-400">コマンド</p>
          {filteredCommands.map((cmd, i) => (
            <button key={cmd.label} onMouseDown={(e) => { e.preventDefault(); applyCommand(cmd); }}
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
                {[
                  { color: null,      bg: 'bg-gray-800', title: 'デフォルト' },
                  { color: '#EF4444', bg: 'bg-red-500',    title: '赤' },
                  { color: '#F97316', bg: 'bg-orange-500', title: 'オレンジ' },
                  { color: '#EAB308', bg: 'bg-yellow-500', title: '黄' },
                  { color: '#22C55E', bg: 'bg-green-500',  title: '緑' },
                  { color: '#3B82F6', bg: 'bg-blue-500',   title: '青' },
                  { color: '#8B5CF6', bg: 'bg-purple-500', title: '紫' },
                  { color: '#6B7280', bg: 'bg-gray-500',   title: 'グレー' },
                ].map(({ color, bg, title }) => (
                  <button
                    key={title}
                    title={title}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (color) editor?.chain().focus().setColor(color).run();
                      else editor?.chain().focus().unsetColor().run();
                      setCtxMenu(null);
                    }}
                    className={`h-5 w-5 rounded-full ${bg} ring-offset-1 hover:ring-2 hover:ring-gray-400`}
                  />
                ))}
              </div>
              <p className="mb-1 mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">背景色</p>
              <div className="flex flex-wrap gap-1">
                {[
                  { color: null,      bg: 'bg-white border border-gray-300', title: 'なし' },
                  { color: '#FDE68A', bg: 'bg-yellow-200', title: '黄' },
                  { color: '#BBF7D0', bg: 'bg-green-200',  title: '緑' },
                  { color: '#BFDBFE', bg: 'bg-blue-200',   title: '青' },
                  { color: '#FECACA', bg: 'bg-red-200',    title: '赤' },
                  { color: '#DDD6FE', bg: 'bg-purple-200', title: '紫' },
                  { color: '#FED7AA', bg: 'bg-orange-200', title: 'オレンジ' },
                  { color: '#F3F4F6', bg: 'bg-gray-200',   title: 'グレー' },
                ].map(({ color, bg, title }) => (
                  <button
                    key={title}
                    title={title}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (color) editor?.chain().focus().setHighlight({ color }).run();
                      else editor?.chain().focus().unsetHighlight().run();
                      setCtxMenu(null);
                    }}
                    className={`h-5 w-5 rounded-full ${bg} ring-offset-1 hover:ring-2 hover:ring-gray-400`}
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

      {/* URL ペーストポップアップ */}
      {pastePopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPastePopup(null)} />
          <div className="fixed z-50 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-2xl" style={{ top: pastePopup.pos.top, left: pastePopup.pos.left }}>
            <p className="px-3 py-1.5 text-xs font-medium text-gray-400">貼り付け方法を選択</p>
            <button onClick={handlePasteMention} disabled={pasteLoading}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <span className="text-base">🔗</span>
              <div><p className="font-medium">メンション</p><p className="text-xs text-gray-400">ページタイトル＋アイコン</p></div>
            </button>
            <button onClick={handlePasteUrl} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
              <span className="text-base">🌐</span>
              <div><p className="font-medium">URL</p><p className="text-xs text-gray-400">リンク付きテキスト</p></div>
            </button>
            {pastePopup.isYoutube && (
              <button onClick={handlePasteYoutube} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">▶</span>
                <div><p className="font-medium">YouTube 埋め込み</p><p className="text-xs text-gray-400">プレイヤーを挿入</p></div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
    </PageNavigationContext.Provider>
    </EditorPageIdContext.Provider>
    </EditorUidContext.Provider>
  );
}

// ── ツールバー ────────────────────────────────────────────────────────

export function Toolbar({ editor, className }: { editor: NonNullable<ReturnType<typeof useEditor>>; className?: string }) {
  const [colorOpen, setColorOpen] = useState(false);
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [cellColorOpen, setCellColorOpen] = useState(false);

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs transition ${active ? 'bg-gray-200 text-gray-900 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`;

  const currentColor = editor.getAttributes('textStyle').color as string | undefined;
  const currentBg = editor.getAttributes('highlight').color as string | undefined;
  const inTable = editor.isActive('table');

  const setCellBg = (color: string) => {
    setCellColorOpen(false);
    if (editor.isActive('tableHeader')) {
      editor.chain().focus().updateAttributes('tableHeader', { backgroundColor: color || null }).run();
    } else {
      editor.chain().focus().updateAttributes('tableCell', { backgroundColor: color || null }).run();
    }
  };

  return (
    <div className={`flex flex-wrap gap-0.5 rounded-lg border border-gray-100 bg-gray-50 p-1 ${className ?? 'mb-4'}`}>
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>B</button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}><i>I</i></button>
      <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))}><u>U</u></button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}><s>S</s></button>
      <button onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive('code'))}>{'`'}</button>

      {/* 文字色 */}
      <div className="relative">
        <button onClick={() => { setColorOpen((v) => !v); setBgColorOpen(false); setCellColorOpen(false); }}
          className={`rounded px-2 py-1 text-xs transition ${colorOpen ? 'bg-gray-200' : 'text-gray-500 hover:bg-gray-100'}`} title="文字色">
          <span style={{ color: currentColor || '#111', borderBottom: `2px solid ${currentColor || '#111'}` }}>A</span>
        </button>
        {colorOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl" style={{ width: 160 }}>
            {TEXT_COLORS.map((c) => (
              <button key={c.value} title={c.label}
                onClick={() => { c.value ? editor.chain().focus().setColor(c.value).run() : editor.chain().focus().unsetColor().run(); setColorOpen(false); }}
                className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold hover:ring-2 hover:ring-brand-400"
                style={{ color: c.value || '#111', border: '1px solid #e5e7eb', background: currentColor === c.value ? '#f3f4f6' : 'white' }}>A</button>
            ))}
          </div>
        )}
      </div>

      {/* 背景色 */}
      <div className="relative">
        <button onClick={() => { setBgColorOpen((v) => !v); setColorOpen(false); setCellColorOpen(false); }}
          className={`rounded px-2 py-1 text-xs transition ${bgColorOpen ? 'bg-gray-200' : 'text-gray-500 hover:bg-gray-100'}`} title="背景色">
          <span style={{ background: currentBg || 'transparent', padding: '1px 3px', borderRadius: 2, border: currentBg ? 'none' : '1px solid #d1d5db' }}>A</span>
        </button>
        {bgColorOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl" style={{ width: 160 }}>
            <p className="mb-1.5 text-xs text-gray-400">背景色</p>
            <div className="flex flex-wrap gap-1">
              {BG_COLORS.map((c) => (
                <button key={c.value} title={c.label}
                  onClick={() => { c.value ? editor.chain().focus().toggleHighlight({ color: c.value }).run() : editor.chain().focus().unsetHighlight().run(); setBgColorOpen(false); }}
                  className="flex h-6 w-6 rounded hover:ring-2 hover:ring-brand-400"
                  style={{ background: c.value || 'white', border: currentBg === c.value ? '2px solid #7c3aed' : '1px solid #e5e7eb' }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <Sep />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))}>H1</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}>H2</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))}>H3</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} className={btn(editor.isActive('heading', { level: 4 }))}>H4</button>
      <Sep />
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>• リスト</button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>1. リスト</button>
      <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={btn(editor.isActive('taskList'))}>☑ Todo</button>
      <Sep />
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))}>引用</button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))}>{'</>'}</button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)}>──</button>
      <Sep />
      <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btn(editor.isActive({ textAlign: 'left' }))}>左</button>
      <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btn(editor.isActive({ textAlign: 'center' }))}>中</button>
      <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btn(editor.isActive({ textAlign: 'right' }))}>右</button>

      {/* テーブル操作（テーブル内のみ表示） */}
      {inTable && (
        <>
          <Sep />
          <button onClick={() => editor.chain().focus().addRowAfter().run()} className={btn(false)} title="行を追加">行↓</button>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()} className={btn(false)} title="列を追加">列→</button>
          <button onClick={() => editor.chain().focus().deleteRow().run()} className={btn(false)} title="行を削除">行✕</button>
          <button onClick={() => editor.chain().focus().deleteColumn().run()} className={btn(false)} title="列を削除">列✕</button>
          <button onClick={() => editor.chain().focus().deleteTable().run()} className={btn(false)} title="テーブルを削除">表✕</button>
          {/* セル背景色 */}
          <div className="relative">
            <button onClick={() => { setCellColorOpen((v) => !v); setColorOpen(false); setBgColorOpen(false); }}
              className={`rounded px-2 py-1 text-xs transition ${cellColorOpen ? 'bg-gray-200' : 'text-gray-500 hover:bg-gray-100'}`} title="セル背景色">
              セル色
            </button>
            {cellColorOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl" style={{ width: 160 }}>
                {TABLE_CELL_COLORS.map((c) => (
                  <button key={c.value} title={c.label} onClick={() => setCellBg(c.value)}
                    className="h-6 w-6 rounded hover:ring-2 hover:ring-brand-400"
                    style={{ background: c.value || 'white', border: '1px solid #e5e7eb' }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Sep() {
  return <span className="mx-0.5 self-stretch border-r border-gray-200" />;
}
