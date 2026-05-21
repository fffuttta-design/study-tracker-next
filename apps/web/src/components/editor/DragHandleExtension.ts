import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Slice } from '@tiptap/pm/model';

// ── ドラッグハンドル拡張（外部パッケージ不要・自前実装）────────────────
// 切り戻し方法: extensions リストからこの拡張を削除するだけでOK

// ProseMirror の内部型（型定義に含まれないプロパティをキャスト）
interface PmViewInternal {
  dragging: { slice: Slice; move: boolean } | null;
  serializeForClipboard(slice: Slice): { dom: HTMLElement; text: string };
}

const DRAG_HANDLE_KEY = new PluginKey('dragHandle');

function dragHandlePlugin() {
  return new Plugin({
    key: DRAG_HANDLE_KEY,
    view(view: EditorView) {
      // ── ハンドル要素を作成 ──
      const handle = document.createElement('div');
      handle.className = 'pm-drag-handle';
      handle.innerHTML = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
        <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
        <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
        <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
      </svg>`;
      handle.draggable = true;
      handle.contentEditable = 'false';

      const container = view.dom.parentElement;
      if (container) {
        if (getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }
        container.appendChild(handle);
      }

      let hoveredPos = -1;

      // ── ホバー中のブロック位置を特定 ──
      const getTopLevelPos = (x: number, y: number): number => {
        const pos = view.posAtCoords({ left: x, top: y });
        if (!pos) return -1;
        try {
          const $pos = view.state.doc.resolve(pos.pos);
          if ($pos.depth === 0) return pos.pos;
          return $pos.before(1);
        } catch {
          return -1;
        }
      };

      // ── ハンドルを配置 ──
      const positionHandle = (nodePos: number) => {
        const nodeDOM = view.nodeDOM(nodePos);
        if (!nodeDOM || !(nodeDOM instanceof HTMLElement)) return;
        const nodeRect = nodeDOM.getBoundingClientRect();
        const containerRect = container!.getBoundingClientRect();
        handle.style.top = `${nodeRect.top - containerRect.top + (nodeRect.height / 2) - 8}px`;
        handle.style.left = `${-28}px`;
        handle.style.opacity = '1';
      };

      // ── マウス移動でハンドル追従 ──
      const onMouseMove = (e: MouseEvent) => {
        const editorRect = view.dom.getBoundingClientRect();
        // エディタ内（左マージン含む）にいるときだけ表示
        if (e.clientY < editorRect.top || e.clientY > editorRect.bottom) {
          handle.style.opacity = '0';
          return;
        }
        const pos = getTopLevelPos(e.clientX, e.clientY);
        if (pos < 0) { handle.style.opacity = '0'; return; }
        const node = view.state.doc.nodeAt(pos);
        if (!node) { handle.style.opacity = '0'; return; }
        hoveredPos = pos;
        positionHandle(pos);
      };

      const onMouseLeave = () => { handle.style.opacity = '0'; };

      container?.addEventListener('mousemove', onMouseMove);
      container?.addEventListener('mouseleave', onMouseLeave);

      // ── ドラッグ開始 ──
      handle.addEventListener('dragstart', (e) => {
        if (hoveredPos < 0) { e.preventDefault(); return; }
        try {
          const selection = NodeSelection.create(view.state.doc, hoveredPos);
          const tr = view.state.tr.setSelection(selection);
          view.dispatch(tr);

          const slice = view.state.selection.content();
          const { dom, text } = (view as unknown as PmViewInternal).serializeForClipboard(slice);
          e.dataTransfer!.clearData();
          e.dataTransfer!.setData('text/html', dom.innerHTML);
          e.dataTransfer!.setData('text/plain', text);
          e.dataTransfer!.effectAllowed = 'move';
          (view as unknown as PmViewInternal).dragging = { slice, move: true };
        } catch {
          e.preventDefault();
        }
      });

      handle.addEventListener('dragend', () => {
        (view as unknown as PmViewInternal).dragging = null;
        handle.style.opacity = '0';
      });

      return {
        destroy() {
          container?.removeEventListener('mousemove', onMouseMove);
          container?.removeEventListener('mouseleave', onMouseLeave);
          handle.remove();
        },
      };
    },
  });
}

export const DragHandleExtension = Extension.create({
  name: 'dragHandle',
  addProseMirrorPlugins() {
    return [dragHandlePlugin()];
  },
});
