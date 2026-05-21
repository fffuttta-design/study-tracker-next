import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Slice } from '@tiptap/pm/model';

// ── ドラッグハンドル拡張（外部パッケージ不要・自前実装）────────────────
// 切り戻し: extensions リストから DragHandleExtension を削除するだけ

interface PmViewInternal {
  dragging: { slice: Slice; move: boolean } | null;
  serializeForClipboard(slice: Slice): { dom: HTMLElement; text: string };
}

const DRAG_HANDLE_KEY = new PluginKey('dragHandle');

function dragHandlePlugin() {
  return new Plugin({
    key: DRAG_HANDLE_KEY,
    view(view: EditorView) {
      // ── body直下にfixedで配置（overflow clipping を回避）──
      const handle = document.createElement('div');
      handle.className = 'pm-drag-handle';
      handle.draggable = true;
      handle.contentEditable = 'false';
      handle.innerHTML = `<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
        <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
        <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
        <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
      </svg>`;
      document.body.appendChild(handle);

      let hoveredPos = -1;
      let hideTimer: ReturnType<typeof setTimeout> | null = null;

      const showHandle = () => {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      };
      const scheduleHide = () => {
        hideTimer = setTimeout(() => { handle.style.opacity = '0'; }, 150);
      };

      // ── top-levelブロックのPM位置を取得 ──
      const getTopLevelPos = (x: number, y: number): number => {
        const pos = view.posAtCoords({ left: x, top: y });
        if (!pos) return -1;
        try {
          const $pos = view.state.doc.resolve(pos.pos);
          return $pos.depth > 0 ? $pos.before(1) : pos.pos;
        } catch { return -1; }
      };

      // ── documentレベルでmousemoveを監視（左マージン含め反応させるため）──
      const onMouseMove = (e: MouseEvent) => {
        const editorRect = view.dom.getBoundingClientRect();

        // エディタの縦範囲外なら非表示
        if (e.clientY < editorRect.top || e.clientY > editorRect.bottom) {
          scheduleHide(); return;
        }
        // エディタの横範囲から大きく外れたら非表示（左40pxまでは許容）
        if (e.clientX < editorRect.left - 40 || e.clientX > editorRect.right) {
          scheduleHide(); return;
        }

        // エディタ左端より左にいるときは最後のホバーポジションを使う（ハンドル上にマウスがある）
        const lookupX = Math.max(e.clientX, editorRect.left + 4);
        const pos = getTopLevelPos(lookupX, e.clientY);
        if (pos < 0) { scheduleHide(); return; }

        const node = view.state.doc.nodeAt(pos);
        if (!node) { scheduleHide(); return; }

        hoveredPos = pos;
        showHandle();

        // ブロックのDOMからviewport座標を取得
        const nodeDOM = view.nodeDOM(pos);
        const domEl = nodeDOM instanceof HTMLElement ? nodeDOM : (nodeDOM as ChildNode | null)?.parentElement;
        if (!domEl) { scheduleHide(); return; }

        const rect = domEl.getBoundingClientRect();
        const handleTop = rect.top + rect.height / 2 - 10;
        const handleLeft = editorRect.left - 28;

        handle.style.top = `${handleTop}px`;
        handle.style.left = `${handleLeft}px`;
        handle.style.opacity = '1';
      };

      // ハンドル自体にホバーしているときは非表示にしない
      handle.addEventListener('mouseenter', () => showHandle());
      handle.addEventListener('mouseleave', () => scheduleHide());

      document.addEventListener('mousemove', onMouseMove);

      // ── ドラッグ開始 ──
      handle.addEventListener('dragstart', (e) => {
        if (hoveredPos < 0) { e.preventDefault(); return; }
        try {
          const selection = NodeSelection.create(view.state.doc, hoveredPos);
          view.dispatch(view.state.tr.setSelection(selection));
          const slice = view.state.selection.content();
          const { dom, text } = (view as unknown as PmViewInternal).serializeForClipboard(slice);
          e.dataTransfer!.clearData();
          e.dataTransfer!.setData('text/html', dom.innerHTML);
          e.dataTransfer!.setData('text/plain', text);
          e.dataTransfer!.effectAllowed = 'move';
          (view as unknown as PmViewInternal).dragging = { slice, move: true };
          handle.style.opacity = '0';
        } catch { e.preventDefault(); }
      });

      handle.addEventListener('dragend', () => {
        (view as unknown as PmViewInternal).dragging = null;
        handle.style.opacity = '0';
      });

      return {
        destroy() {
          document.removeEventListener('mousemove', onMouseMove);
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
