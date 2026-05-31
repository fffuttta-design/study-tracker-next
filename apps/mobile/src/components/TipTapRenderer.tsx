import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextStyle } from 'react-native';

interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  attrs?: Record<string, any>;
}

// レンダリング時の共有コンテキスト（taskItem のグローバルインデックス追跡）
interface RenderCtx {
  taskCounter: number;
  onToggleTask?: (index: number) => void;
}

function extractText(node: TipTapNode): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(extractText).join('');
}

// ① baseColor を引数で受け取り、全テキストに明示的な色を設定
//    → 親 <Text> の色に飲み込まれず、マーク色が確実に上書きされる
function renderInline(nodes: TipTapNode[], baseColor: string): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'hardBreak') return <Text key={i}>{'\n'}</Text>;
    if (node.type !== 'text') return null;

    const marks = node.marks ?? [];
    const style: TextStyle = { color: baseColor }; // 明示的なベース色

    for (const mark of marks) {
      switch (mark.type) {
        case 'bold':
          style.fontWeight = 'bold';
          break;
        case 'italic':
          style.fontStyle = 'italic';
          break;
        case 'strike':
          style.textDecorationLine = 'line-through';
          break;
        case 'underline':
          style.textDecorationLine = 'underline';
          break;
        case 'textStyle':
          if (mark.attrs?.color) style.color = mark.attrs.color; // ベース色を上書き
          break;
        case 'highlight':
          if (mark.attrs?.color) style.backgroundColor = mark.attrs.color;
          break;
        case 'code':
          style.fontFamily = 'monospace';
          style.backgroundColor = '#f3f4f6';
          style.fontSize = 12;
          break;
      }
    }

    return <Text key={i} style={style}>{node.text}</Text>;
  });
}

function renderBlock(
  node: TipTapNode,
  key: number,
  baseColor: string,
  ctx: RenderCtx,
): React.ReactNode {
  switch (node.type) {
    case 'paragraph': {
      const children = node.content ?? [];
      if (children.length === 0) return <Text key={key} style={s.paragraph}>{' '}</Text>;
      return (
        <Text key={key} style={s.paragraph}>
          {renderInline(children, baseColor)}
        </Text>
      );
    }

    case 'heading': {
      const level = node.attrs?.level ?? 1;
      const hs = level === 1 ? s.h1 : level === 2 ? s.h2 : s.h3;
      return (
        <Text key={key} style={hs}>
          {renderInline(node.content ?? [], baseColor)}
        </Text>
      );
    }

    case 'bulletList':
      return (
        <View key={key} style={s.list}>
          {(node.content ?? []).map((item, i) => (
            <View key={i} style={s.listItem}>
              <Text style={[s.bullet, { color: baseColor }]}>{'•'}</Text>
              <Text style={[s.listItemText, { color: baseColor }]}>
                {renderInline(item.content?.[0]?.content ?? [], baseColor)}
              </Text>
            </View>
          ))}
        </View>
      );

    case 'orderedList':
      return (
        <View key={key} style={s.list}>
          {(node.content ?? []).map((item, i) => (
            <View key={i} style={s.listItem}>
              <Text style={[s.bullet, { color: baseColor }]}>{i + 1}{'.'}</Text>
              <Text style={[s.listItemText, { color: baseColor }]}>
                {renderInline(item.content?.[0]?.content ?? [], baseColor)}
              </Text>
            </View>
          ))}
        </View>
      );

    // ② taskList: onToggleTask があればタップ可能にする
    case 'taskList':
      return (
        <View key={key} style={s.list}>
          {(node.content ?? []).map((item, i) => {
            const checked = item.attrs?.checked ?? false;
            const currentIndex = ctx.taskCounter++;
            return (
              <TouchableOpacity
                key={i}
                style={s.listItem}
                onPress={() => ctx.onToggleTask?.(currentIndex)}
                activeOpacity={ctx.onToggleTask ? 0.6 : 1}
                disabled={!ctx.onToggleTask}
              >
                <Text style={[s.bullet, { color: checked ? '#10b981' : '#9ca3af' }]}>
                  {checked ? '☑' : '☐'}
                </Text>
                <Text
                  style={[
                    s.listItemText,
                    { color: baseColor },
                    checked && s.strikethrough,
                  ]}>
                  {renderInline(item.content?.[0]?.content ?? [], baseColor)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );

    case 'blockquote':
      return (
        <View key={key} style={s.blockquote}>
          {(node.content ?? []).map((child, i) =>
            renderBlock(child, i, '#6b7280', ctx),
          )}
        </View>
      );

    case 'codeBlock':
      return (
        <View key={key} style={s.codeBlock}>
          <Text style={s.codeBlockText}>{extractText(node)}</Text>
        </View>
      );

    case 'horizontalRule':
      return <View key={key} style={s.hr} />;

    default:
      if (node.content) {
        return (
          <View key={key}>
            {node.content.map((child, i) => renderBlock(child, i, baseColor, ctx))}
          </View>
        );
      }
      return null;
  }
}

interface Props {
  content: string;
  baseTextColor?: string;
  onToggleTask?: (taskIndex: number) => void;
}

export function TipTapRenderer({ content, baseTextColor = '#374151', onToggleTask }: Props) {
  let doc: TipTapNode;
  try {
    doc = JSON.parse(content);
    if (doc?.type !== 'doc') throw new Error();
  } catch {
    return <Text style={{ color: baseTextColor, fontSize: 13 }}>{content}</Text>;
  }

  const ctx: RenderCtx = { taskCounter: 0, onToggleTask };

  return (
    <View>
      {(doc.content ?? []).map((node, i) =>
        renderBlock(node, i, baseTextColor, ctx),
      )}
    </View>
  );
}

const s = StyleSheet.create({
  paragraph: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  h1: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
    marginBottom: 4,
  },
  h2: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 6,
    marginBottom: 3,
  },
  h3: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 4,
    marginBottom: 2,
  },
  list: {
    marginBottom: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  bullet: {
    fontSize: 13,
    marginRight: 6,
    lineHeight: 20,
    width: 14,
  },
  listItemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#d1d5db',
    paddingLeft: 10,
    marginLeft: 2,
    marginBottom: 4,
  },
  codeBlock: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    padding: 10,
    marginBottom: 4,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#374151',
  },
  hr: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
});
