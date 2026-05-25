import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useLearningStore } from '../../store/learningStore';
import {
  LearningItem,
  hasDueReview,
  isFullyCompleted,
  localDateKey,
  importanceColor,
  importanceLabel,
  REVIEW_STAGE_LABELS,
} from '../../types';

type Tab = 'today' | 'review' | 'all';

export default function LearningScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { items, categories, completeReview, deleteItem } = useLearningStore();
  const [tab, setTab] = useState<Tab>('today');

  const today = localDateKey();

  const filtered = useMemo(() => {
    switch (tab) {
      case 'today':  return items.filter(i => i.dateKey === today);
      case 'review': return items.filter(i => !isFullyCompleted(i) && hasDueReview(i));
      case 'all':    return items;
    }
  }, [items, tab, today]);

  const reviewCount = useMemo(
    () => items.filter(i => !isFullyCompleted(i) && hasDueReview(i)).length,
    [items],
  );

  const getCategoryName = (id?: string) => {
    if (!id) return undefined;
    return categories.find(c => c.id === id)?.name;
  };

  const handleCompleteReview = async (item: LearningItem, stageIndex: number) => {
    if (!user) return;
    await completeReview(user.uid, item.id, stageIndex);
  };

  const handleDelete = (item: LearningItem) => {
    Alert.alert('削除', `「${item.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => user && deleteItem(user.uid, item.id),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.title}>学習リスト</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddLearning')}>
          <Text style={styles.addBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>

      {/* タブ */}
      <View style={styles.tabs}>
        {(['today', 'review', 'all'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'today' ? '今日' : t === 'review' ? `復習 ${reviewCount > 0 ? `(${reviewCount})` : ''}` : 'すべて'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* リスト */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <LearningItemCard
            item={item}
            categoryName={getCategoryName(item.categoryId)}
            onCompleteReview={handleCompleteReview}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === 'today' ? '今日の記録はまだありません' : tab === 'review' ? '復習の必要なアイテムはありません 🎉' : 'アイテムがありません'}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function LearningItemCard({
  item, categoryName, onCompleteReview, onDelete,
}: {
  item: LearningItem;
  categoryName?: string;
  onCompleteReview: (item: LearningItem, stageIndex: number) => void;
  onDelete: () => void;
}) {
  const completed = isFullyCompleted(item);
  const due = hasDueReview(item);

  // 次の未完了ステージ
  const nextReview = item.reviews.find(r => !r.completed);

  return (
    <View style={[styles.card, completed && styles.cardCompleted]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          {item.importance && (
            <View style={[styles.importanceBadge, { backgroundColor: importanceColor(item.importance) + '33', borderColor: importanceColor(item.importance) }]}>
              <Text style={[styles.importanceText, { color: importanceColor(item.importance) }]}>
                {importanceLabel(item.importance)}
              </Text>
            </View>
          )}
          {categoryName && (
            <Text style={styles.category}>{categoryName}</Text>
          )}
          {due && !completed && (
            <View style={styles.dueBadge}>
              <Text style={styles.dueText}>要復習</Text>
            </View>
          )}
          {completed && (
            <View style={styles.doneBadge}>
              <Text style={styles.doneText}>完了</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.cardTitle, completed && styles.cardTitleDone]}>{item.title}</Text>
      {item.content ? <Text style={styles.cardContent} numberOfLines={2}>{item.content}</Text> : null}

      {/* 復習ステージ */}
      <View style={styles.reviewRow}>
        {item.reviews.map((r, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.reviewDot,
              r.completed ? styles.reviewDotDone : (r.scheduledDate <= localDateKey() ? styles.reviewDotDue : styles.reviewDotFuture),
            ]}
            onPress={() => !r.completed && onCompleteReview(item, r.stageIndex)}
            disabled={r.completed}>
            <Text style={styles.reviewDotText}>{REVIEW_STAGE_LABELS[i]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  addBtn: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#111827', fontWeight: '600', fontSize: 14 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#e5e7eb' },
  tabActive: { backgroundColor: '#F59E0B' },
  tabText: { color: '#6b7280', fontSize: 13 },
  tabTextActive: { color: '#111827', fontWeight: '600' },
  list: { padding: 16, paddingTop: 8, gap: 10 },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 40, fontSize: 14 },
  card: { backgroundColor: '#ffffff', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#e5e7eb', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardCompleted: { opacity: 0.6, borderLeftColor: '#10b981' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  importanceBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  importanceText: { fontSize: 11, fontWeight: '600' },
  category: { fontSize: 11, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dueBadge: { backgroundColor: '#fef2f2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  dueText: { fontSize: 11, color: '#ef4444', fontWeight: '600' },
  doneBadge: { backgroundColor: '#f0fdf4', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  doneText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 16 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#9ca3af' },
  cardContent: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  reviewRow: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  reviewDot: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  reviewDotDone: { backgroundColor: '#10b981' },
  reviewDotDue: { backgroundColor: '#ef4444' },
  reviewDotFuture: { backgroundColor: '#d1d5db' },
  reviewDotText: { fontSize: 10, color: '#fff', fontWeight: '600' },
});
