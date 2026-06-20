import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

// ── 見出しアウトライン・インデント拡張 ──────────────────────────────
// 見出しの「直下の段」だけを軽く1段（1.5rem）字下げする（表示のみ・データ非破壊）。
//   - 見出し自身は下げない。
//   - 見出しの直後に続く本文ブロックを1段だけ字下げ。
//   - 「空行」または「次の見出し」で字下げは終了する＝そこから下は左端に戻る。
//     （＝一度見出しを作ると延々インデントが続いて“抜け出せない”問題への対応）
// さらに「見出し行の先頭で Backspace」を押すと、その見出しを通常テキストに戻す（見出し解除）。
// 切り戻しは extensions から HeadingOutlineIndent を外すだけ。content は一切変更しない。

const KEY = new PluginKey('headingOutlineIndent');
const STEP_REM = 1.5; // 字下げ量（1段）

function isEmptyParagraph(node: PmNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0;
}

function buildDecorations(doc: PmNode): DecorationSet {
  const decos: Decoration[] = [];
  let inSection = false; // 直前に見出しがあり、その直下の連続ブロック中か
  // doc 直下のトップレベルブロックを走査。offset = そのブロック直前の絶対位置。
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      // 見出し自身は下げない。直後から「直下の段」を開始。
      inSection = true;
      return;
    }
    if (isEmptyParagraph(node)) {
      // 空行が来たらセクション終わり（ここから下は左端に戻る）
      inSection = false;
      return;
    }
    if (inSection) {
      decos.push(
        Decoration.node(offset, offset + node.nodeSize, {
          style: `padding-left:${STEP_REM}rem`,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

export const HeadingOutlineIndent = Extension.create({
  name: 'headingOutlineIndent',
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        const { empty, $from } = selection;
        if (!empty) return false;
        // 見出し行の先頭で Backspace → 見出し解除（通常段落に戻す）
        if ($from.parent.type.name === 'heading' && $from.parentOffset === 0) {
          return this.editor.chain().setNode('paragraph').run();
        }
        return false;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        state: {
          init: (_config, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return KEY.getState(state) as DecorationSet | undefined;
          },
        },
      }),
    ];
  },
});
