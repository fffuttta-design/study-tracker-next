import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useLearningStore } from '../../store/learningStore';
import { localDateKey } from '../../types';

export default function AddLearningScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { addItem, categories } = useLearningStore();

  const [title, setTitle]           = useState('');
  const [content, setContent]       = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [saving, setSaving]         = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('入力エラー', 'タイトルを入力してください');
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      await addItem(user.uid, {
        title: title.trim(),
        content: content.trim(),
        categoryId,
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
            : <Text style={styles.saveBtnText}>記録する</Text>
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
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    color: '#111827',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textarea: { minHeight: 100 },
  catScroll: { marginBottom: 4 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  catChipActive: { backgroundColor: '#F59E0B33', borderColor: '#F59E0B' },
  catChipText: { color: '#6b7280', fontSize: 13 },
  catChipTextActive: { color: '#F59E0B', fontWeight: '600' },
  saveBtn: {
    marginTop: 24,
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#111827', fontWeight: 'bold', fontSize: 16 },
});
