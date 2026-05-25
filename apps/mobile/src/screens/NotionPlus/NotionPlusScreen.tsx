import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useNotionStore } from '../../store/notionStore';
import { NotionPage } from '../../types';

export default function NotionPlusScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { pages, subscribePages, addPage, deletePage } = useNotionStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    if (!user) return;
    return subscribePages(user.uid);
  }, [user]);

  const rootPages = pages.filter(p => !p.parentId);

  const handleAdd = async () => {
    if (!newTitle.trim() || !user) return;
    const id = await addPage(user.uid, newTitle.trim());
    setNewTitle('');
    setShowAdd(false);
    navigation.navigate('NotionPage', { pageId: id, title: newTitle.trim() });
  };

  const handleDelete = (page: NotionPage) => {
    Alert.alert('削除', `「${page.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => user && deletePage(user.uid, page.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>📝 NotionPlus</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>＋ 新規</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rootPages}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <PageItem
            page={item}
            onPress={() => navigation.navigate('NotionPage', { pageId: item.id, title: item.title })}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>ノートがありません。「＋ 新規」から作成してください。</Text>
        }
      />

      {/* 新規ページモーダル */}
      <Modal visible={showAdd} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>新規ページ</Text>
            <TextInput
              style={styles.modalInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="ページタイトル"
              placeholderTextColor="#9ca3af"
              autoFocus
              onSubmitEditing={handleAdd}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowAdd(false); setNewTitle(''); }}>
                <Text style={styles.modalCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOk} onPress={handleAdd}>
                <Text style={styles.modalOkText}>作成</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PageItem({ page, onPress, onDelete }: { page: NotionPage; onPress: () => void; onDelete: () => void }) {
  return (
    <TouchableOpacity style={styles.pageItem} onPress={onPress}>
      {page.icon?.startsWith('http') ? (
        <Image source={{ uri: page.icon }} style={styles.pageIconImg} />
      ) : (
        <Text style={styles.pageIcon}>{page.icon ?? '📄'}</Text>
      )}
      <View style={styles.pageInfo}>
        <Text style={styles.pageTitle}>{page.title}</Text>
        {page.updatedAt && (
          <Text style={styles.pageDate}>更新: {page.updatedAt.slice(0, 10)}</Text>
        )}
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Text>🗑</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  addBtn: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#111827', fontWeight: '600', fontSize: 14 },
  list: { padding: 16, gap: 8 },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 40, fontSize: 14, lineHeight: 22 },
  pageItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 10, padding: 14, gap: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  pageIcon: { fontSize: 24 },
  pageIconImg: { width: 28, height: 28, borderRadius: 4 },
  pageInfo: { flex: 1 },
  pageTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  pageDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  deleteBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: '#00000055', alignItems: 'center', justifyContent: 'center' },
  modal: { backgroundColor: '#ffffff', borderRadius: 14, padding: 24, width: '85%', gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  modalInput: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, color: '#111827', fontSize: 15, borderWidth: 1, borderColor: '#e5e7eb' },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalOk: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#F59E0B', alignItems: 'center' },
  modalOkText: { color: '#111827', fontWeight: 'bold' },
});
