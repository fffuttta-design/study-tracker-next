import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * Annotation (Tip) カスタムマーク
 * - 選択テキストに note 属性を持つ黄色ハイライトを付与
 * - ホバーで .annotation-mark[data-note] を読んでツールチップを表示（NotionEditor 側で処理）
 */
export const AnnotationMark = Mark.create({
  name: 'annotation',

  addAttributes() {
    return {
      note: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-note') ?? '',
        renderHTML: (attrs) => ({ 'data-note': attrs.note as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-annotation]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-annotation': 'true',
        class: 'annotation-mark',
      }),
      0,
    ];
  },
});
