import React, { useState, useMemo } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useLearningStore } from '../../store/learningStore';
import { useNotionStore } from '../../store/notionStore';
import { localDateKey } from '../../types';

const WORKSPACE_ID = 'workspace';

export default function AddLearningScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { addItem, categories } = useLearningStore();
  const { pages } = useNotionStore();

  const [title, setTitle]               = useState('');
  const [content, setContent]           = useState('');
  const [categoryId, setCategoryId]     = useState<string | undefined>();
  const [notionPageId, setNotionPageId] = useState<string | undefined>();
  const [saving, setSaving]             = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);

  // ページ一覧（ワークスペース・ブック除外）
  const pageOptions = useMemo(() =>
    pages.filter(p => !p.parentId && p.id !== WORKSPACE_ID && p.type !== 'book')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [pages]
  );

  const selectedPage = pages.find(p => p.id === notionPageId);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('入力エラー', 'タイトルを入力してください');
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      // undefined は Firestore 非対応のため null に変換または省略
      await addItem(user.uid, {
        title: title.trim(),
        content: content.trim(),
        ...(categoryId   ? { categoryId }                         : {}),
        ...(notionPageId ? { notionPageId, notionPagePath: selectedPage?.title ?? '' } : {}),
        dateKey: localDateKey(),
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* NotionPlus ページ選択 */}
        <Text style={styles.label}>ノートに紐づける（任意）</Text>
        <TouchableOpacity
          style={styles.pageSelector}
          onPress={() => setPagePickerOpen(v => !v)}
        >
          <Text style={notionPageId ? styles.pageSelectorText : styles.pageSelectorPlaceholder}>
            {selectedPage ? `${selectedPage.icon ?? '📄'} ${selectedPage.title}` : '選択しない（特急メモ）'}
          </Text>
          <Text style={styles.pageChevron}>{pagePickerOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {pagePickerOpen && (
          <View style={styles.pageList}>
            <TouchableOpacity
              style={[styles.pageItem, !notionPageId && styles.pageItemActive]}
              onPress={() => { setNotionPageId(undefined); setPagePickerOpen(false); }}
            >
              <Text style={styles.pageItemText}>⚡ 選択しない（特急メモ）</Text>
            </TouchableOpacity>
            {pageOptions.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.pageItem, notionPageId === p.id && styles.pageItemActive]}
                onPress={() => { setNotionPageId(p.id); setPagePickerOpen(false); }}
              >
                <Text style={styles.pageItemText}>{p.icon ?? '📄'} {p.title || 'Untitled'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* タイトル */}
        <Text style={styles.label}>タイトル *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="学習した内容（例：React Hooks の基礎）"
          placeholderTextColor="#9ca3af"
          autoFocus
        />

        {/* メモ */}
        <Text style={styles.label}>メモ</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={content}
          onChangeText={setContent}
          placeholder="気づいたこと、感想、要点など..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* カテゴリ */}
        {categories.length > 0 && (
          <>
            <Text style={styles.label}>カテゴリ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              <TouchableOpacity
                style={[styles.catChip, !categoryId && styles.catChipActive]}
                onPress={() => setCategoryId(undefined)}>
                <Text style={[styles.catChipText, !categoryId && styles.catChipTextActive]}>なし</Text>
              </TouchableOpacity>
              {categories.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catChip, categoryId === c.id && styles.catChipActive]}
                  onPress={() => setCategoryId(c.id)}>
                  <Text style={[styles.catChipText, categoryId === c.id && styles.catChipTextActive]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* 保存ボタン */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}>
          {saving
            ? <ActivityIndicator color="#111827" />
            : <Text style={styles.saveBtnText}>
                {notionPageId ? '📚 通常記録する' : '⚡ 特急メモとして記録'}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 4, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: '#ffffff', borderRadius: 8, padding: 12,
    color: '#111827', fontSize: 15, borderWidth: 1, borderColor: '#e5e7eb',
  },
  textarea: { minHeight: 100 },
  // ページ選択
  pageSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  pageSelectorText: { color: '#111827', fontSize: 15, flex: 1 },
  pageSelectorPlaceholder: { color: '#9ca3af', fontSize: 15, flex: 1 },
  pageChevron: { color: '#9ca3af', fontSize: 12, marginLeft: 8 },
  pageList: {
    backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb',
    marginTop: 4, maxHeight: 220, overflow: 'hidden',
  },
  pageItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pageItemActive: { backgroundColor: '#fef3c7' },
  pageItemText: { color: '#111827', fontSize: 14 },
  // カテゴリ
  catScroll: { marginBottom: 4 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', marginRight: 8,
  },
  catChipActive: { backgroundColor: '#F59E0B33', borderColor: '#F59E0B' },
  catChipText: { color: '#6b7280', fontSize: 13 },
  catChipTextActive: { color: '#F59E0B', fontWeight: '600' },
  // 保存
  saveBtn: {
    marginTop: 24, backgroundColor: '#F59E0B', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#111827', fontWeight: 'bold', fontSize: 16 },
});
