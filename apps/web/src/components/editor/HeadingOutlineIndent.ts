import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

// ── 見出しアウトライン・インデント拡張 ──────────────────────────────
// 見出しの「中」に入る本文を、見出しレベルに応じて段階的に字下げする（表示のみ・データ非破壊）。
//   H1 自身=0段 / H1 配下の本文=1段
//   H2 自身=1段 / H2 配下の本文=2段
//   H3 自身=2段 / H3 配下の本文=3段 … というカスケード。
// ProseMirror のデコレーション（padding-left のインライン style）で付けるだけなので、
// 切り戻しは extensions から HeadingOutlineIndent を外すだけ。content は一切変更しない。

const KEY = new PluginKey('headingOutlineIndent');
const STEP_REM = 1.5; // 1段あたりの字下げ量

function buildDecorations(doc: PmNode): DecorationSet {
  const decos: Decoration[] = [];
  let level = 0; // 直近の見出しレベル（0 = まだ見出しが出ていない）
  // doc 直下のトップレベルブロックを走査。offset = そのブロック直前の絶対位置。
  doc.forEach((node, offset) => {
    let indentSteps: number;
    if (node.type.name === 'heading') {
      const lv = (node.attrs.level as number) || 1;
      level = lv;
      indentSteps = lv - 1; // 見出し自身は1段浅く（H1=0, H2=1, ...）
    } else {
      indentSteps = level; // 見出し配下の本文は見出しレベルぶん
    }
    if (indentSteps > 0) {
      decos.push(
        Decoration.node(offset, offset + node.nodeSize, {
          style: `padding-left:${indentSteps * STEP_REM}rem`,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

export const HeadingOutlineIndent = Extension.create({
  name: 'headingOutlineIndent',
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
