import React, { useState, useMemo } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, View,
  Modal, FlatList, Image, SafeAreaView as RNSafeAreaView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useLearningStore } from '../../store/learningStore';
import { useNotionStore } from '../../store/notionStore';
import { localDateKey } from '../../types';
import { NotionPage } from '../../types';

const WORKSPACE_ID = 'workspace';

// アイコン表示ヘルパー
function PageIcon({ icon, size = 22 }: { icon?: string; size?: number }) {
  const isUrl = icon && (icon.startsWith('http') || icon.startsWith('data:'));
  if (isUrl) return <Image source={{ uri: icon }} style={{ width: size, height: size, borderRadius: 4 }} />;
  return <Text style={{ fontSize: size * 0.9 }}>{icon ?? '📄'}</Text>;
}

export default function AddLearningScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { addItem, categories } = useLearningStore();
  const { pages } = useNotionStore();

  const [title, setTitle]               = useState('');
  const [content, setContent]           = useState('');
  const [categoryId, setCategoryId]     = useState<string | undefined>();
  const [notionPageId, setNotionPageId] = useState<string | undefined>();
  const [saving, setSaving]             = useState(false);
  const [pageModalOpen, setPageModalOpen] = useState(false);

  const selectedPage = pages.find(p => p.id === notionPageId);

  // ページ一覧（ワークスペース・ブック除外）フラットリスト
  const pageOptions = useMemo(() =>
    pages
      .filter(p => p.id !== WORKSPACE_ID && p.type !== 'book')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [pages]
  );

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('入力エラー', 'タイトルを入力してください');
      return;
    }
    if (!notionPageId) {
      Alert.alert('入力エラー', '紐づけるノートを選択してください');
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      await addItem(user.uid, {
        title:         title.trim(),
        content:       content.trim(),
        dateKey:       localDateKey(),
        notionPageId,
        notionPagePath: selectedPage?.title ?? '',
        ...(categoryId ? { categoryId } : {}),
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setSaving(false);
    }
  };

  const renderPageItem = ({ item: p }: { item: NotionPage }) => {
    const indent = (() => {
      let depth = 0;
      let cur = pages.find(x => x.id === p.parentId);
      while (cur) { depth++; cur = cur.parentId ? pages.find(x => x.id === cur!.parentId) : undefined; }
      return depth;
    })();
    const isSelected = p.id === notionPageId;
    return (
      <TouchableOpacity
        style={[styles.modalPageItem, isSelected && styles.modalPageItemSelected,
          { paddingLeft: 16 + indent * 20 }]}
        onPress={() => { setNotionPageId(p.id); setPageModalOpen(false); }}
      >
        <PageIcon icon={p.icon} size={22} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.modalPageTitle, isSelected && { color: '#F59E0B', fontWeight: '700' }]}>
            {p.title || 'Untitled'}
          </Text>
          {p.parentId && p.parentId !== WORKSPACE_ID && (
            <Text style={styles.modalPageSub}>
              {pages.find(x => x.id === p.parentId)?.title ?? ''}
            </Text>
          )}
        </View>
        {isSelected && <Text style={{ color: '#F59E0B', fontSize: 18 }}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* ノート選択（必須） */}
        <Text style={styles.label}>紐づけるノート <Text style={styles.required}>*必須</Text></Text>
        <TouchableOpacity
          style={[styles.pageSelector, !notionPageId && styles.pageSelectorEmpty]}
          onPress={() => setPageModalOpen(true)}
        >
          {selectedPage ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <PageIcon icon={selectedPage.icon} size={22} />
              <Text style={styles.pageSelectorText}>{selectedPage.title}</Text>
            </View>
          ) : (
            <Text style={styles.pageSelectorPlaceholder}>ノートを選択してください</Text>
          )}
          <Text style={styles.pageChevron}>📂</Text>
        </TouchableOpacity>

        {/* タイトル */}
        <Text style={styles.label}>タイトル <Text style={styles.required}>*必須</Text></Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="学習した内容（例：React Hooks の基礎）"
          placeholderTextColor="#9ca3af"
          autoFocus
        />

        {/* メモ */}
        <Text style={styles.label}>メモ（任意）</Text>
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
            <Text style={styles.label}>カテゴリ（任意）</Text>
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
          style={[styles.saveBtn, (!notionPageId || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!notionPageId || saving}>
          {saving
            ? <ActivityIndicator color="#111827" />
            : <Text style={styles.saveBtnText}>📚 通常記録する</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* ノート選択フルスクリーンモーダル */}
      <Modal visible={pageModalOpen} animationType="slide">
        <RNSafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📂 ノートを選択</Text>
            <TouchableOpacity onPress={() => setPageModalOpen(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕ 閉じる</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={pageOptions}
            keyExtractor={p => p.id}
            renderItem={renderPageItem}
            contentContainerStyle={{ paddingBottom: 32 }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </RNSafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 4, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 16, marginBottom: 6 },
  required: { color: '#ef4444', fontWeight: '700' },
  input: {
    backgroundColor: '#ffffff', borderRadius: 8, padding: 12,
    color: '#111827', fontSize: 15, borderWidth: 1, borderColor: '#e5e7eb',
  },
  textarea: { minHeight: 100 },
  pageSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', borderRadius: 10, padding: 14,
    borderWidth: 2, borderColor: '#F59E0B',
  },
  pageSelectorEmpty: { borderColor: '#e5e7eb' },
  pageSelectorText: { color: '#111827', fontSize: 15, fontWeight: '600', flex: 1 },
  pageSelectorPlaceholder: { color: '#9ca3af', fontSize: 15, flex: 1 },
  pageChevron: { fontSize: 20, marginLeft: 8 },
  catScroll: { marginBottom: 4 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', marginRight: 8,
  },
  catChipActive: { backgroundColor: '#F59E0B33', borderColor: '#F59E0B' },
  catChipText: { color: '#6b7280', fontSize: 13 },
  catChipTextActive: { color: '#F59E0B', fontWeight: '600' },
  saveBtn: {
    marginTop: 24, backgroundColor: '#F59E0B', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#111827', fontWeight: 'bold', fontSize: 16 },
  // モーダル
  modalSafe: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  modalClose: { padding: 6 },
  modalCloseText: { color: '#6b7280', fontSize: 14 },
  modalPageItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, backgroundColor: '#ffffff',
  },
  modalPageItemSelected: { backgroundColor: '#fffbeb' },
  modalPageTitle: { fontSize: 15, color: '#111827', fontWeight: '500' },
  modalPageSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  separator: { height: 1, backgroundColor: '#f3f4f6' },
});
