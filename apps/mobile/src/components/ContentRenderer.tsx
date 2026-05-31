/**
 * ContentRenderer — TipTap JSON と Markdown（HTMLスパン含む）を統一的に描画するコンポーネント
 *
 * ・TipTap JSON  → TipTapRenderer
 * ・Markdown     → react-native-markdown-display
 *                   <span style="color:X">text</span> を [text](color:X) に変換して色を適用
 */
import React from 'react';
import { Text } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { TipTapRenderer } from './TipTapRenderer';
import { isTipTapContent } from '../types';

// <span style="color:#EF4444">text</span> → [text](colorhex:EF4444)
// に変換してから Markdown パーサーに渡す。
//
// ⚠️ 注意: markdown-it は URL 内の "#" をフラグメントとして除去するため、
//   `color:#EF4444` と書くと href が `color:` になってしまいカラーが消える。
//   そのため "#" を除去して `colorhex:EF4444` という独自スキームで保持する。
function preprocessMarkdown(content: string): string {
  return content
    .replace(
      /<span[^>]*style=["'][^"']*color:\s*([^;'">\s]+)[^>]*>([\s\S]*?)<\/span>/gi,
      (_, color: string, text: string) => {
        // # を除去して独自スキーム colorhex: に格納（markdown-it のフラグメント除去対策）
        const safeColor = color.trim().replace(/^#/, '');
        return `[${text}](colorhex:${safeColor})`;
      },
    )
    .replace(/<[^>]+>/g, '');
}

// colorhex: スキームのリンクを colored Text として描画
const colorLinkRule = {
  link: (node: any, children: any) => {
    const href = (node.attributes?.href ?? '') as string;
    if (href.startsWith('colorhex:')) {
      const raw = href.slice(9); // "#" 除去済みの hex または色名
      // hex 6桁・3桁なら # を補完、それ以外（red等）はそのまま使用
      const color = /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(raw) ? `#${raw}` : raw;
      return (
        <Text key={node.key} style={{ color }}>
          {children}
        </Text>
      );
    }
    return (
      <Text key={node.key} style={{ color: '#3b82f6', textDecorationLine: 'underline' }}>
        {children}
      </Text>
    );
  },
};

interface Props {
  content: string;
  baseTextColor?: string;
  onToggleTask?: (index: number) => void;
  markdownStyles?: Record<string, object>;
}

export function ContentRenderer({
  content,
  baseTextColor = '#374151',
  onToggleTask,
  markdownStyles = {},
}: Props) {
  if (!content) return null;

  if (isTipTapContent(content)) {
    return (
      <TipTapRenderer
        content={content}
        baseTextColor={baseTextColor}
        onToggleTask={onToggleTask}
      />
    );
  }

  // Markdown（HTML スパン含む可能性あり）
  const processed = preprocessMarkdown(content);
  const mergedStyles = {
    body:        { fontSize: 13, color: baseTextColor, lineHeight: 20 },
    heading1:    { fontSize: 16, fontWeight: '700' as const, color: '#111827', marginTop: 8, marginBottom: 4 },
    heading2:    { fontSize: 14, fontWeight: '700' as const, color: '#111827', marginTop: 6, marginBottom: 3 },
    heading3:    { fontSize: 13, fontWeight: '700' as const, color: '#374151', marginTop: 4, marginBottom: 2 },
    strong:      { fontWeight: '700' as const, color: '#374151' },
    em:          { fontStyle: 'italic' as const },
    code_inline: { backgroundColor: '#f3f4f6', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 },
    code_block:  { backgroundColor: '#f3f4f6', borderRadius: 6, padding: 8, fontFamily: 'monospace', fontSize: 12 },
    bullet_list: { marginVertical: 2 },
    ordered_list:{ marginVertical: 2 },
    list_item:   { marginVertical: 1 },
    blockquote:  { borderLeftWidth: 3, borderLeftColor: '#d1d5db', paddingLeft: 8, marginLeft: 4 },
    ...markdownStyles,
  };

  return (
    <Markdown style={mergedStyles} rules={colorLinkRule}>
      {processed}
    </Markdown>
  );
}
