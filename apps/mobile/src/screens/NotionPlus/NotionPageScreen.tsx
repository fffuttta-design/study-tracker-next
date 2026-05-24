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
  Alert,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useAuthStore } from '../../store/authStore';
import { useNotionStore } from '../../store/notionStore';

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
        placeholderTextColor="#4b5563"
        onFocus={() => setEditing(true)}
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

      {editing ? (
        <TextInput
          style={styles.editor}
          value={content}
          onChangeText={t => { setContent(t); setDirty(true); }}
          multiline
          textAlignVertical="top"
          placeholder={'# 見出し\n\nMarkdown で書けます...\n\n- リスト\n- **太字**\n- *イタリック*'}
          placeholderTextColor="#4b5563"
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
  container: { flex: 1, backgroundColor: '#111827' },
  titleInput: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f9fafb',
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  toolbar: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1f2937', alignItems: 'center' },
  toolBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: '#1f2937' },
  toolBtnActive: { backgroundColor: '#F59E0B' },
  toolBtnText: { color: '#9ca3af', fontSize: 13 },
  toolBtnTextActive: { color: '#111827', fontWeight: '600' },
  saveBtn: { marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#10b981', borderRadius: 6 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  editor: { flex: 1, padding: 16, color: '#e5e7eb', fontSize: 15, lineHeight: 24, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo' },
  preview: { flex: 1 },
  previewContent: { padding: 16 },
  emptyText: { color: '#4b5563', fontSize: 14, fontStyle: 'italic', marginTop: 20 },
});

const markdownStyles = {
  body: { color: '#e5e7eb', fontSize: 15, lineHeight: 24 },
  heading1: { color: '#f9fafb', fontSize: 24, fontWeight: 'bold', marginBottom: 12, marginTop: 8 },
  heading2: { color: '#f9fafb', fontSize: 20, fontWeight: 'bold', marginBottom: 10, marginTop: 6 },
  heading3: { color: '#f9fafb', fontSize: 17, fontWeight: '600', marginBottom: 8 },
  paragraph: { color: '#e5e7eb', marginBottom: 10 },
  list_item: { color: '#e5e7eb' },
  bullet_list: { marginBottom: 10 },
  code_inline: { backgroundColor: '#1f2937', color: '#F59E0B', paddingHorizontal: 4, borderRadius: 4 },
  fence: { backgroundColor: '#1f2937', padding: 12, borderRadius: 8, marginBottom: 10 },
  blockquote: { backgroundColor: '#1f2937', borderLeftWidth: 3, borderLeftColor: '#F59E0B', paddingLeft: 12, marginBottom: 10 },
  strong: { color: '#fff', fontWeight: 'bold' },
  em: { fontStyle: 'italic', color: '#d1d5db' },
  link: { color: '#60a5fa' },
  hr: { backgroundColor: '#374151', height: 1, marginVertical: 16 },
};
