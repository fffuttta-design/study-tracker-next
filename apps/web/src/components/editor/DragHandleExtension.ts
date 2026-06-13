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

// 外部から縦オフセット(px)を設定できる口。NotionEditor から useEffect で呼ぶ
let _offset = 0;
export function setDragHandleVertOffset(n: number) { _offset = n; }

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
      let isDragging = false;
      let scrollEl: HTMLElement | null = null;

      const showHandle = () => {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      };
      const scheduleHide = () => {
        hideTimer = setTimeout(() => { handle.style.opacity = '0'; }, 150);
      };

      // ── スクロールコンテナを遅延取得（overflow-y:auto / scroll な祖先要素）──
      const findScrollEl = (): HTMLElement | null => {
        if (scrollEl) return scrollEl;
        let el: HTMLElement | null = view.dom.parentElement;
        while (el && el !== document.body) {
          const ov = getComputedStyle(el).overflowY;
          if (ov === 'auto' || ov === 'scroll') { scrollEl = el; return el; }
          el = el.parentElement;
        }
        return null;
      };

      // ── drag 中オートスクロール（dragover + rAF ベース）─────────────────────
      // Chrome は HTML5 DnD 中に wheel イベントを発火しないため、
      // dragover イベント（DnD 中も必ず発火）でカーソル位置を監視してスクロールする
      let scrollSpeed = 0;       // px/frame（正 = 下向き、負 = 上向き）
      let scrollRaf: number | null = null;
      const SCROLL_ZONE = 100;   // スクロールゾーンの高さ（px）
      const MAX_SPEED   = 18;    // 最大スクロール速度（px/frame ≒ px/16ms）

      // rAF ループ: isDragging の間 scrollSpeed に応じてコンテナを移動
      const scrollTick = () => {
        if (!isDragging) { scrollRaf = null; return; }
        if (scrollSpeed !== 0) {
          const c = findScrollEl();
          if (c) c.scrollTop += scrollSpeed;
        }
        scrollRaf = requestAnimationFrame(scrollTick);
      };

      // dragover: カーソルが上下ゾーンに入ったら速度を計算
      const onDragOverForScroll = (e: DragEvent) => {
        if (!isDragging) return;
        const c = findScrollEl();
        if (!c) return;
        const rect = c.getBoundingClientRect();
        const y = e.clientY;
        if (y < rect.top + SCROLL_ZONE) {
          // 上ゾーン：上端に近いほど速く
          const ratio = 1 - Math.max(0, y - rect.top) / SCROLL_ZONE;
          scrollSpeed = -Math.round(ratio * MAX_SPEED);
        } else if (y > rect.bottom - SCROLL_ZONE) {
          // 下ゾーン：下端に近いほど速く
          const ratio = 1 - Math.max(0, rect.bottom - y) / SCROLL_ZONE;
          scrollSpeed = Math.round(ratio * MAX_SPEED);
        } else {
          scrollSpeed = 0;
        }
      };

      // wheel: Chrome 以外のブラウザや将来の変更に備えて残す
      const onWheelDuringDrag = (e: WheelEvent) => {
        if (!isDragging) return;
        const c = findScrollEl();
        if (!c) return;
        e.preventDefault();
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 20;
        else if (e.deltaMode === 2) delta *= c.clientHeight;
        c.scrollTop += delta;
      };

      document.addEventListener('dragover', onDragOverForScroll, true); // capture で確実に受信
      document.addEventListener('wheel', onWheelDuringDrag, { passive: false });

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
        const handleTop = rect.top + rect.height / 2 - 8 + _offset;
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
          isDragging = true;
          // rAF スクロールループを開始
          if (!scrollRaf) scrollRaf = requestAnimationFrame(scrollTick);
        } catch { e.preventDefault(); }
      });

      handle.addEventListener('dragend', () => {
        isDragging = false;
        scrollSpeed = 0;
        (view as unknown as PmViewInternal).dragging = null;
        handle.style.opacity = '0';
        // scrollRaf は scrollTick 内で isDragging=false を検知して自動停止
      });

      return {
        destroy() {
          isDragging = false;
          scrollSpeed = 0;
          if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('dragover', onDragOverForScroll, true);
          document.removeEventListener('wheel', onWheelDuringDrag);
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
