'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Node } from '@tiptap/core';
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
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import './editor.css';

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
  '📄','📝','📚','📖','📓','📔','📒','📃','📜','📑','🗒️','🗓️',
  '💡','🎯','🔖','✅','📌','📍','🗂️','📁','📂','🗃️','📋','🗄️',
  '🧠','🔍','🔎','💭','🤔','📊','📈','📉','🗺️','🧩','🔬','🔭',
  '🚀','🌟','⭐','🔥','💎','🏆','🥇','🎖️','👑','🎉','✨','🎊',
  '🎨','🖌️','🎵','🎶','🎸','🎹','📸','🎬','🎭','🖼️','🎮','🎲',
  '💼','🖥️','💻','📱','⌨️','🖱️','📡','📞','📠','🔐','🔒','🗝️',
  '🛠️','⚙️','🔧','🔨','🔩','💰','💵','💳','📊','🏢','🏪','🏫',
  '👤','👥','🤝','👍','✌️','💪','🙌','👏','🧑‍💻','👨‍🎓','👩‍💼','🧑‍🔬',
  '🌿','🌱','🍀','🌸','🌻','🌙','☀️','⚡','❄️','🌊','🌈','🌪️',
  '🏠','🏡','🌍','🌏','✈️','🚂','🚗','⛰️','🌅','🏝️','🗼','⛩️',
  '☕','🍵','🍎','🍊','🍋','🍇','🥑','🍕','🍜','🍣','🍰','🎂',
  '❤️','💚','💙','💜','🧡','💛','🤍','🖤','🔴','🟠','🟡','🟢',
  '🔵','🟣','⬛','⬜','🔲','🎪','🦋','🦁','🐯','🦊','🐸','🐺',
];

// ── PageLink ノード ──────────────────────────────────────────────────

function PageLinkView({ node, updateAttributes }: NodeViewProps) {
  const router = useRouter();
  const { href, title: storedTitle, icon: storedIcon } = node.attrs as { href: string; title: string; icon: string };
  const pages = useNotionPageStore((s) => s.pages);
  const update = useNotionPageStore((s) => s.update);
  const { user } = useAuthStore();
  const pageId = href?.match(/\/notion-plus\/([^/?#]+)/)?.[1];
  const livePage = pageId ? pages.find((p) => p.id === pageId) : null;
  const title = livePage?.title || storedTitle || 'Untitled';
  const icon = livePage?.icon || storedIcon || '📄';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconUrlDraft, setIconUrlDraft] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

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

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="flex w-fit items-center gap-1 py-0.5">
        <div className="relative" ref={pickerRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}
            className="rounded p-0.5 hover:bg-gray-100"
            title="アイコンを変更"
          >
            {isImageSrc(icon) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="block h-[1.1em] w-[1.1em] flex-shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />
            ) : (
              <span className="text-[0.95em] leading-none">{icon}</span>
            )}
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-full z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
              <p className="mb-1 text-xs font-medium text-gray-400">絵文字</p>
              <div className="mb-2 grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
                {EMOJI_PRESETS.map((emoji) => (
                  <button key={emoji} onClick={() => handleIconChange(emoji)}
                    className={`rounded p-1 text-base hover:bg-gray-100 ${icon === emoji ? 'bg-brand-50 ring-1 ring-brand-400' : ''}`}>
                    {emoji}
                  </button>
                ))}
              </div>
              <p className="mb-1 text-xs font-medium text-gray-400">画像URL / コピペ</p>
              <div className="flex gap-1">
                <input type="text" value={iconUrlDraft} onChange={(e) => setIconUrlDraft(e.target.value)}
                  onPaste={handleIconPaste}
                  onKeyDown={(e) => e.key === 'Enter' && iconUrlDraft && handleIconChange(iconUrlDraft)}
                  placeholder="https://..."
                  className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-brand-400" />
                <button onClick={() => iconUrlDraft && handleIconChange(iconUrlDraft)} disabled={!iconUrlDraft}
                  className="rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600 disabled:opacity-40">設定</button>
              </div>
              {isImageSrc(iconUrlDraft) && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconUrlDraft} alt="" className="block h-8 w-8 rounded object-cover" style={{ aspectRatio: '1/1' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="text-xs text-gray-400">プレビュー</span>
                </div>
              )}
            </div>
          )}
        </div>
        <button onClick={() => href && router.push(href)} className="cursor-pointer hover:opacity-70">
          <span className="text-[0.95em] text-gray-700 underline">{title || 'Untitled'}</span>
        </button>
      </div>
    </NodeViewWrapper>
  );
}

const PageLinkNode = Node.create({
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
  parseHTML() { return [{ tag: 'div[data-type="page-link"]' }]; },
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

const UrlMentionNode = Node.create({
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

const CalloutNode = Node.create({
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

const ToggleHeadingNode = Node.create({
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

const TocNode = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'div[data-type="toc"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-type': 'toc' }]; },
  addNodeView() { return ReactNodeViewRenderer(TocView); },
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

// ── スラッシュコマンド ──────────────────────────────────────────────

interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action: (editor: ReturnType<typeof useEditor>) => void;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { label: 'テキスト',           description: '通常のテキスト',       icon: '¶',   action: (e) => e?.chain().focus().setParagraph().run() },
  { label: '見出し 1',           description: '大見出し',             icon: 'H1',  action: (e) => e?.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: '見出し 2',           description: '中見出し',             icon: 'H2',  action: (e) => e?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: '見出し 3',           description: '小見出し',             icon: 'H3',  action: (e) => e?.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: '見出し 4',           description: '小小見出し',           icon: 'H4',  action: (e) => e?.chain().focus().toggleHeading({ level: 4 }).run() },
  { label: 'トグル見出し',       description: '折りたたみ可能な見出し', icon: '▶',  action: (e) => e?.chain().focus().insertContent({ type: 'toggleHeading', attrs: { level: 1, isOpen: true }, content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '' }] }, { type: 'paragraph' }] }).run() },
  { label: '箇条書き',           description: '・リスト',             icon: '•',   action: (e) => e?.chain().focus().toggleBulletList().run() },
  { label: '番号付きリスト',     description: '1. 2. 3. ...',        icon: '1.',  action: (e) => e?.chain().focus().toggleOrderedList().run() },
  { label: 'チェックリスト',     description: 'Todoリスト',           icon: '☑',  action: (e) => e?.chain().focus().toggleTaskList().run() },
  { label: 'テーブル',           description: '表を挿入',             icon: '⊞',   action: (e) => e?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: '目次',               description: '見出しから目次を生成', icon: '≡',   action: (e) => e?.chain().focus().insertContent({ type: 'toc' }).run() },
  { label: 'コールアウト',       description: '目立つ注釈ブロック',   icon: '💡',  action: (e) => e?.chain().focus().insertContent({ type: 'callout', attrs: { background: '#FEF9CD' }, content: [{ type: 'paragraph' }] }).run() },
  { label: '引用',               description: 'ブロック引用',         icon: '❝',  action: (e) => e?.chain().focus().toggleBlockquote().run() },
  { label: 'コード',             description: 'コードブロック',       icon: '</>', action: (e) => e?.chain().focus().toggleCodeBlock().run() },
  { label: '区切り線',           description: '水平線',               icon: '—',  action: (e) => e?.chain().focus().setHorizontalRule().run() },
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
  const firstLine = initialContent.split('\n').find((l) => l.trim())?.trim() ?? '';
  const [title, setTitle] = useState(firstLine.slice(0, 80));
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const dateKey = new Date().toISOString().slice(0, 10);
  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500';

  const submit = async () => {
    if (!content.trim() && !title.trim()) return;
    if (!user) return;
    setSaving(true);
    try {
      await add(user.uid, { dateKey, title: title.trim(), content: content.trim(), sortOrder: 0, notionPageId, notionPagePath });
      onClose();
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
}

interface PastePopup {
  url: string;
  pos: { top: number; left: number };
  isYoutube: boolean;
}

export function NotionEditor({
  initialTitle, initialContent, onSave, onCreateSubPage,
  recordTriggerRef, onRecordText, notionPageId, notionPagePath, highlightText,
}: NotionEditorProps) {
  const notionPlusLayout = useSettingsStore((s) => s.notionPlusLayout);
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const titleValue = useRef(initialTitle);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const slashStartPos = useRef<number | null>(null);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [pastePopup, setPastePopup] = useState<PastePopup | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [recordText, setRecordText] = useState<string | null>(null);

  const pasteUrlCallbackRef = useRef<((url: string, coords: { bottom: number; left: number }) => void) | null>(null);
  pasteUrlCallbackRef.current = (url, coords) => {
    setPastePopup({ url, pos: { top: coords.bottom + 8, left: coords.left }, isYoutube: isYouTubeUrl(url) });
  };

  const filteredCommands = SLASH_COMMANDS.filter((c) =>
    !slashQuery || c.label.toLowerCase().includes(slashQuery.toLowerCase())
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
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
    ],
    content: (() => {
      if (!initialContent) return '';
      try { return JSON.parse(initialContent); } catch { return initialContent; }
    })(),
    editorProps: {
      attributes: { class: 'notion-editor' },
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
      handleKeyDown(view, event) {
        // '>' キーで見出しをトグル見出しに変換
        if (event.key === '>' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
          const { state } = view;
          const { $from } = state.selection;
          if ($from.parent.type.name === 'heading' && $from.parentOffset === 0) {
            const level = $from.parent.attrs.level as number;
            const headingNode = $from.parent;
            const from = $from.before();
            const to = $from.after();
            const toggleNode = state.schema.nodes.toggleHeading.create(
              { level, isOpen: true },
              [headingNode.copy(headingNode.content), state.schema.nodes.paragraph.create()]
            );
            view.dispatch(state.tr.replaceWith(from, to, toggleNode));
            return true;
          }
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
          setMenuPos({ top: coords.bottom + 8, left: coords.left });
          setSlashOpen(true);
          return;
        }
      }
      setSlashOpen(false);
      slashStartPos.current = null;
    },
  });

  const applyCommand = useCallback((cmd: SlashCommand) => {
    if (!editor || slashStartPos.current === null) return;
    const { from } = editor.state.selection;
    editor.chain().focus().deleteRange({ from: slashStartPos.current, to: from }).run();
    cmd.action(editor);
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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!editor) return;
      onSave(titleValue.current, JSON.stringify(editor.getJSON()));
    }, 1200);
  }, [editor, onSave]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ハイライトテキストが指定された場合、エディタ内で検索してハイライト
  useEffect(() => {
    if (!editor || !highlightText) return;
    const search = highlightText.slice(0, 60);
    const timer = setTimeout(() => {
      let found = false;
      editor.state.doc.descendants((node, pos) => {
        if (found) return false;
        if (node.isText && node.text) {
          const idx = node.text.indexOf(search);
          if (idx !== -1) {
            const from = pos + idx;
            const to = from + search.length;
            editor.chain()
              .setTextSelection({ from, to })
              .setHighlight({ color: '#FDE68A' })
              .scrollIntoView()
              .run();
            found = true;
          }
        }
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [editor, highlightText]);

  const handleRecord = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = from !== to ? editor.state.doc.textBetween(from, to, '\n') : '';
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
    router.push(`/notion-plus/${newPage.id}`);
  }, [editor, onCreateSubPage, onSave, router]);

  const handleCtxCallout = useCallback(() => {
    setCtxMenu(null);
    editor?.chain().focus().insertContent({ type: 'callout', attrs: { background: '#FEF9CD' }, content: [{ type: 'paragraph' }] }).run();
  }, [editor]);

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

  const outerClass = `relative flex flex-1 overflow-y-auto py-8 ${notionPlusLayout === 'center' ? 'justify-center px-6' : 'pl-16 pr-8'}`;

  return (
    <div className={outerClass} onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}>
      <div className="w-full max-w-3xl">
        <input
          ref={titleRef}
          defaultValue={initialTitle}
          placeholder="Untitled"
          onChange={(e) => { titleValue.current = e.target.value; scheduleSave(); }}
          className="mb-6 w-full border-none text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-200"
        />
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>

      {/* スラッシュコマンドメニュー */}
      {slashOpen && filteredCommands.length > 0 && (
        <div className="fixed z-50 w-64 rounded-xl border border-gray-200 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }}>
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
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-50 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-2xl" style={{ top: ctxMenu.y, left: ctxMenu.x, transform: 'translateY(-50%)' }}>
            {onCreateSubPage && (
              <button onClick={handleCtxCreatePage} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                <span className="text-base">📄</span>新規ページを作成
              </button>
            )}
            <button onClick={handleCtxCallout} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
              <span className="text-base">💡</span>コールアウトを挿入
            </button>
            <button onClick={handleRecord} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
              <span className="text-base">📚</span>学習リストに記録
            </button>
          </div>
        </>
      )}

      {/* 学習記録ダイアログ */}
      {recordText !== null && (
        <RecordDialog initialContent={recordText} notionPageId={notionPageId} notionPagePath={notionPagePath} onClose={() => setRecordText(null)} />
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
  );
}

// ── ツールバー ────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
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
    <div className="mb-4 flex flex-wrap gap-0.5 rounded-lg border border-gray-100 bg-gray-50 p-1">
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
