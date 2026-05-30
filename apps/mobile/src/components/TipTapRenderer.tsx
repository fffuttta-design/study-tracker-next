import React from 'react';
import { View, Text, StyleSheet, TextStyle } from 'react-native';

interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  attrs?: Record<string, any>;
}

function extractText(node: TipTapNode): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(extractText).join('');
}

function renderInline(nodes: TipTapNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'hardBreak') return <Text key={i}>{'\n'}</Text>;
    if (node.type !== 'text') return null;

    const marks = node.marks ?? [];
    const style: TextStyle = {};

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
          if (mark.attrs?.color) style.color = mark.attrs.color;
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

    return (
      <Text key={i} style={style}>
        {node.text}
      </Text>
    );
  });
}

function renderBlock(
  node: TipTapNode,
  key: number,
  baseColor: string,
): React.ReactNode {
  switch (node.type) {
    case 'paragraph': {
      const children = node.content ?? [];
      if (children.length === 0) return <Text key={key} style={s.paragraph}>{' '}</Text>;
      return (
        <Text key={key} style={[s.paragraph, { color: baseColor }]}>
          {renderInline(children)}
        </Text>
      );
    }

    case 'heading': {
      const level = node.attrs?.level ?? 1;
      const hs = level === 1 ? s.h1 : level === 2 ? s.h2 : s.h3;
      return (
        <Text key={key} style={hs}>
          {renderInline(node.content ?? [])}
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
                {renderInline(item.content?.[0]?.content ?? [])}
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
                {renderInline(item.content?.[0]?.content ?? [])}
              </Text>
            </View>
          ))}
        </View>
      );

    case 'taskList':
      return (
        <View key={key} style={s.list}>
          {(node.content ?? []).map((item, i) => {
            const checked = item.attrs?.checked ?? false;
            return (
              <View key={i} style={s.listItem}>
                <Text style={[s.bullet, { color: baseColor }]}>
                  {checked ? '☑' : '☐'}
                </Text>
                <Text
                  style={[
                    s.listItemText,
                    { color: baseColor },
                    checked && s.strikethrough,
                  ]}>
                  {renderInline(item.content?.[0]?.content ?? [])}
                </Text>
              </View>
            );
          })}
        </View>
      );

    case 'blockquote':
      return (
        <View key={key} style={s.blockquote}>
          {(node.content ?? []).map((child, i) =>
            renderBlock(child, i, '#6b7280'),
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
            {node.content.map((child, i) => renderBlock(child, i, baseColor))}
          </View>
        );
      }
      return null;
  }
}

interface Props {
  content: string;
  baseTextColor?: string;
}

export function TipTapRenderer({ content, baseTextColor = '#374151' }: Props) {
  let doc: TipTapNode;
  try {
    doc = JSON.parse(content);
    if (doc?.type !== 'doc') throw new Error();
  } catch {
    return <Text style={{ color: baseTextColor, fontSize: 13 }}>{content}</Text>;
  }

  return (
    <View>
      {(doc.content ?? []).map((node, i) =>
        renderBlock(node, i, baseTextColor),
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
