'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';

// ── 型定義 ──────────────────────────────────────────────────
type RNMessage =
  | { type: 'init'; content: string; title: string; readOnly?: boolean }
  | { type: 'setEditable'; editable: boolean };

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

// ── ツールバーボタン ────────────────────────────────────────
interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  label: string;
  title?: string;
}

function ToolbarButton({ onClick, active, label, title }: ToolbarButtonProps) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault(); // フォーカスを奪わない
        onClick();
      }}
      title={title ?? label}
      style={{
        height: 44,
        minWidth: 36,
        padding: '0 8px',
        border: 'none',
        borderRadius: 6,
        background: active ? '#F59E0B' : '#f3f4f6',
        color: active ? '#111827' : '#374151',
        fontWeight: active ? 700 : 400,
        fontSize: 13,
        cursor: 'pointer',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 28,
        background: '#d1d5db',
        flexShrink: 0,
        alignSelf: 'center',
        margin: '0 2px',
      }}
    />
  );
}

// ── メインページ ────────────────────────────────────────────
export default function EditorMobilePage() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef('');
  const readyPostedRef = useRef(false);
  const readOnlyRef = useRef(false);
  const [dbg, setDbg] = useState('① ページロード中');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder: '書き始めるか、「/」でコマンドを入力...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: false }),
      TextStyle,
      Color,
      Underline,
    ],
    editorProps: {
      attributes: { class: 'mobile-editor' },
    },
    onUpdate: ({ editor }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const content = JSON.stringify(editor.getJSON());
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: 'change', content, title: titleRef.current })
        );
      }, 1500);
    },
  });

  // エディタ ready 後の処理
  useEffect(() => {
    if (!editor) return;

    setDbg('② エディタ初期化完了');

    // injectJavaScript から呼ばれるグローバル関数を公開
    (window as any).__applyEditorContent = (c: string, t: string, ro: boolean) => {
      setDbg(`③ コンテンツ受信 len=${c?.length ?? 0} ro=${ro}`);
      titleRef.current = t ?? '';
      readOnlyRef.current = !!ro;
      editor.setEditable(!ro);
      try {
        const parsed = JSON.parse(c);
        editor.commands.setContent(parsed, { emitUpdate: false });
        setDbg(`④ setContent完了 nodes=${parsed?.content?.length ?? '?'}`);
      } catch (e) {
        setDbg(`⑤ JSON parse失敗: ${String(e).slice(0, 40)}`);
        editor.commands.setContent(c ?? '', { emitUpdate: false });
      }
    };

    // ページロード前に injectJavaScript が先に実行された場合の処理
    const pending = (window as any).__rnContent;
    if (pending) {
      setDbg('② エディタ初期化完了（ペンディングあり）');
      (window as any).__applyEditorContent(
        pending,
        (window as any).__rnTitle ?? '',
        (window as any).__rnReadOnly ?? false,
      );
    }

    // postMessage 経由の通知もサポート（フォールバック）
    if (!readyPostedRef.current) {
      readyPostedRef.current = true;
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
    }
  }, [editor]);

  // RN からの init メッセージを受信してエディタにコンテンツをセット
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: RNMessage = typeof event.data === 'string'
          ? JSON.parse(event.data)
          : event.data;

        if (data.type === 'init' && editor) {
          const apply = (window as any).__applyEditorContent;
          if (typeof apply === 'function') {
            apply(data.content, data.title ?? '', !!data.readOnly);
          }
        }
        if (data.type === 'setEditable' && editor) {
          readOnlyRef.current = !data.editable;
          editor.setEditable(!!data.editable);
        }
      } catch {
        // 無視
      }
    },
    [editor]
  );

  useEffect(() => {
    // Android WebView は document に、iOS/ブラウザは window に届く
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage as EventListener);
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage as EventListener);
    };
  }, [handleMessage]);

  if (!editor) return null;

  const tb = editor;
  const isReadOnly = readOnlyRef.current;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#fff' }}>
      {/* ツールバー（readOnly時は非表示） */}
      <div
        style={{
          display: isReadOnly ? 'none' : 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          padding: '6px 8px',
          borderBottom: '1px solid #e5e7eb',
          overflowX: 'auto',
          overflowY: 'hidden',
          flexShrink: 0,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        } as React.CSSProperties}
      >
        {/* 文字装飾 */}
        <ToolbarButton
          label="B"
          title="太字"
          active={tb.isActive('bold')}
          onClick={() => tb.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="I"
          title="斜体"
          active={tb.isActive('italic')}
          onClick={() => tb.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="U"
          title="下線"
          active={tb.isActive('underline')}
          onClick={() => tb.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          label="S"
          title="取り消し線"
          active={tb.isActive('strike')}
          onClick={() => tb.chain().focus().toggleStrike().run()}
        />

        <Divider />

        {/* 見出し */}
        <ToolbarButton
          label="H1"
          active={tb.isActive('heading', { level: 1 })}
          onClick={() => tb.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          label="H2"
          active={tb.isActive('heading', { level: 2 })}
          onClick={() => tb.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="H3"
          active={tb.isActive('heading', { level: 3 })}
          onClick={() => tb.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <ToolbarButton
          label="H4"
          active={tb.isActive('heading', { level: 4 })}
          onClick={() => tb.chain().focus().toggleHeading({ level: 4 }).run()}
        />

        <Divider />

        {/* リスト */}
        <ToolbarButton
          label="•リスト"
          active={tb.isActive('bulletList')}
          onClick={() => tb.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="1.リスト"
          active={tb.isActive('orderedList')}
          onClick={() => tb.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="☑"
          title="チェックリスト"
          active={tb.isActive('taskList')}
          onClick={() => tb.chain().focus().toggleTaskList().run()}
        />

        <Divider />

        {/* ブロック */}
        <ToolbarButton
          label="引用"
          active={tb.isActive('blockquote')}
          onClick={() => tb.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          label="</>"
          title="コードブロック"
          active={tb.isActive('codeBlock')}
          onClick={() => tb.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          label="─"
          title="区切り線"
          onClick={() => tb.chain().focus().setHorizontalRule().run()}
        />

        <Divider />

        {/* 揃え */}
        <ToolbarButton
          label="左"
          active={tb.isActive({ textAlign: 'left' })}
          onClick={() => tb.chain().focus().setTextAlign('left').run()}
        />
        <ToolbarButton
          label="中"
          active={tb.isActive({ textAlign: 'center' })}
          onClick={() => tb.chain().focus().setTextAlign('center').run()}
        />
        <ToolbarButton
          label="右"
          active={tb.isActive({ textAlign: 'right' })}
          onClick={() => tb.chain().focus().setTextAlign('right').run()}
        />
      </div>

      {/* エディタエリア */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 80px' }}>
        <EditorContent editor={editor} />
      </div>

      {/* デバッグバナー（問題解決後に削除） */}
      <div style={{ background: '#fef08a', borderTop: '1px solid #ca8a04', padding: '4px 10px', fontSize: '11px', color: '#713f12', flexShrink: 0 }}>
        🔍 {dbg}
      </div>

      <style>{`
        .mobile-editor {
          outline: none;
          font-size: 16px;
          line-height: 1.7;
          color: #111;
          min-height: 200px;
        }
        .mobile-editor p { margin: 0.3rem 0; }
        .mobile-editor h1 { font-size: 1.75rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .mobile-editor h2 { font-size: 1.4rem; font-weight: 600; margin: 0.875rem 0 0.375rem; }
        .mobile-editor h3 { font-size: 1.2rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
        .mobile-editor h4 { font-size: 1.05rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
        .mobile-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.25rem 0; }
        .mobile-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.25rem 0; }
        .mobile-editor li { margin: 0.15rem 0; }
        .mobile-editor ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .mobile-editor ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; padding-left: 0; }
        .mobile-editor ul[data-type="taskList"] li > label { margin-top: 0.25rem; }
        .mobile-editor ul[data-type="taskList"] li > div { flex: 1; }
        .mobile-editor blockquote { border-left: 4px solid #111; padding-left: 1rem; color: #374151; margin: 0.5rem 0; }
        .mobile-editor pre { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; overflow-x: auto; margin: 0.5rem 0; }
        .mobile-editor code { font-family: monospace; font-size: 0.875em; background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 3px; }
        .mobile-editor pre code { background: none; padding: 0; }
        .mobile-editor hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
        .mobile-editor strong { font-weight: 700; }
        .mobile-editor em { font-style: italic; }
        .mobile-editor s { text-decoration: line-through; }
        .mobile-editor u { text-decoration: underline; }
        .mobile-editor a { color: #3b82f6; text-decoration: underline; }
        .mobile-editor mark { background: #fef08a; border-radius: 2px; padding: 0 2px; }
        .mobile-editor p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        /* スクロールバー非表示（ツールバー） */
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
