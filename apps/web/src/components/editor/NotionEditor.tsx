'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import './editor.css';

interface NotionEditorProps {
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
}

export function NotionEditor({ initialTitle, initialContent, onSave }: NotionEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const titleValue = useRef(initialTitle);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: '書き始めてください...',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent ? JSON.parse(initialContent) : '',
    editorProps: {
      attributes: {
        class: 'notion-editor',
      },
    },
    onUpdate: () => {
      scheduleSave();
    },
  });

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!editor) return;
      const content = JSON.stringify(editor.getJSON());
      onSave(titleValue.current, content);
    }, 1000);
  }, [editor, onSave]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-3xl">
        {/* タイトル */}
        <input
          ref={titleRef}
          defaultValue={initialTitle}
          placeholder="Untitled"
          onChange={(e) => {
            titleValue.current = e.target.value;
            scheduleSave();
          }}
          className="mb-6 w-full border-none text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-200"
        />

        {/* ツールバー */}
        {editor && <Toolbar editor={editor} />}

        {/* エディタ本体 */}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-sm transition ${active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`;

  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-gray-100 bg-gray-50 p-1">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="太字">B</button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="斜体"><i>I</i></button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))} title="取り消し線"><s>S</s></button>
      <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={btn(editor.isActive('highlight'))} title="ハイライト">H</button>
      <span className="mx-1 border-r border-gray-200" />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))}>H1</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}>H2</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))}>H3</button>
      <span className="mx-1 border-r border-gray-200" />
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>• リスト</button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>1. リスト</button>
      <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={btn(editor.isActive('taskList'))}>☑ Todo</button>
      <span className="mx-1 border-r border-gray-200" />
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))}>引用</button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))}>コード</button>
      <span className="mx-1 border-r border-gray-200" />
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)}>──</button>
    </div>
  );
}
