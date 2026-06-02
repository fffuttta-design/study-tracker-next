import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useAuthStore } from '../../store/authStore';
import { useNotionStore } from '../../store/notionStore';
import { isTipTapContent, extractTextFromTipTap } from '../../types';
import { TipTapWebEditor } from '../../components/TipTapWebEditor';

export default function NotionPageScreen({ route, navigation }: any) {
  const { pageId } = route.params as { pageId: string };
  const { user } = useAuthStore();
  const { pages, updatePage } = useNotionStore();

  const page = pages.find(p => p.id === pageId);

  const [content, setContent] = useState(page?.content ?? '');
  const [title, setTitle] = useState(page?.title ?? '');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (page) {
      setContent(page.content);
      setTitle(page.title);
    }
  }, [page]);

  useEffect(() => {
    navigation.setOptions({ title: title || 'ページ' });
  }, [title]);

  const handleSave = useCallback(async () => {
    if (!user || !dirty) return;
    await updatePage(user.uid, pageId, { title, content });
    setDirty(false);
    setEditing(false);
  }, [user, pageId, title, content, dirty]);

  // 戻るときに自動保存
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', async () => {
      if (dirty && user) {
        await updatePage(user.uid, pageId, { title, content });
      }
    });
    return unsubscribe;
  }, [navigation, dirty, title, content, user, pageId]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* タイトル */}
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={t => { setTitle(t); setDirty(true); }}
        placeholder="ページタイトル"
        placeholderTextColor="#9ca3af"
      />

      {/* 編集モード切替 */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolBtn, !editing && styles.toolBtnActive]}
          onPress={() => { setEditing(false); handleSave(); }}>
          <Text style={[styles.toolBtnText, !editing && styles.toolBtnTextActive]}>プレビュー</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolBtn, editing && styles.toolBtnActive]}
          onPress={() => setEditing(true)}>
          <Text style={[styles.toolBtnText, editing && styles.toolBtnTextActive]}>編集</Text>
        </TouchableOpacity>
        {dirty && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>保存</Text>
          </TouchableOpacity>
        )}
      </View>

      {isTipTapContent(content) ? (
        // TipTapコンテンツ: 単一WebViewで編集/プレビュー両対応（再マウントしない）
        <TipTapWebEditor
          content={content}
          title={title}
          readOnly={!editing}
          onSave={(newContent, newTitle) => {
            setContent(newContent);
            if (newTitle) setTitle(newTitle);
            setDirty(true);
          }}
          onNavigate={(href) => {
            const match = href?.match(/\/notion-plus\/([^/?#]+)/);
            if (match) navigation.push('NotionPage', { pageId: match[1], title: '' });
          }}
          style={styles.webEditor}
        />
      ) : editing ? (
        <TextInput
          style={styles.editor}
          value={content}
          onChangeText={t => { setContent(t); setDirty(true); }}
          multiline
          textAlignVertical="top"
          placeholder={'# 見出し\n\nMarkdown で書けます...\n\n- リスト\n- **太字**\n- *イタリック*'}
          placeholderTextColor="#9ca3af"
          autoFocus
        />
      ) : (
        <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
          {content ? (
            <Markdown style={markdownStyles}>{content}</Markdown>
          ) : (
            <Text style={styles.emptyText}>編集タブをタップして書き始めましょう</Text>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  titleInput: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  toolbar: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', alignItems: 'center' },
  toolBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f3f4f6' },
  toolBtnActive: { backgroundColor: '#F59E0B' },
  toolBtnText: { color: '#6b7280', fontSize: 13 },
  toolBtnTextActive: { color: '#111827', fontWeight: '600' },
  saveBtn: { marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#10b981', borderRadius: 6 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  editor: { flex: 1, padding: 16, color: '#111827', fontSize: 15, lineHeight: 24, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', backgroundColor: '#ffffff' },
  webEditor: { flex: 1 },
  preview: { flex: 1 },
  previewContent: { padding: 16 },
  emptyText: { color: '#9ca3af', fontSize: 14, fontStyle: 'italic', marginTop: 20 },
  plainText: { color: '#374151', fontSize: 15, lineHeight: 24 },
});

const markdownStyles = {
  body: { color: '#374151', fontSize: 15, lineHeight: 24 },
  heading1: { color: '#111827', fontSize: 24, fontWeight: 'bold', marginBottom: 12, marginTop: 8 },
  heading2: { color: '#111827', fontSize: 20, fontWeight: 'bold', marginBottom: 10, marginTop: 6 },
  heading3: { color: '#111827', fontSize: 17, fontWeight: '600', marginBottom: 8 },
  paragraph: { color: '#374151', marginBottom: 10 },
  list_item: { color: '#374151' },
  bullet_list: { marginBottom: 10 },
  code_inline: { backgroundColor: '#f3f4f6', color: '#d97706', paddingHorizontal: 4, borderRadius: 4 },
  fence: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8, marginBottom: 10 },
  blockquote: { backgroundColor: '#fffbeb', borderLeftWidth: 3, borderLeftColor: '#F59E0B', paddingLeft: 12, marginBottom: 10 },
  strong: { color: '#111827', fontWeight: 'bold' },
  em: { fontStyle: 'italic', color: '#6b7280' },
  link: { color: '#3b82f6' },
  hr: { backgroundColor: '#e5e7eb', height: 1, marginVertical: 16 },
};
