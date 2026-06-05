import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
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
  REVIEW_STAGE_LABELS,
} from '../../types';
import { ContentRenderer } from '../../components/ContentRenderer';

type Tab = 'today' | 'review' | 'all';

// ステージごとの色（Web版と同じ）
const STAGE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'] as const;
const STAGE_BG     = ['#fef2f2', '#fffbeb', '#f0fdf4', '#eff6ff', '#faf5ff'] as const;

export default function LearningScreen({ navigation, route }: any) {
  const { user } = useAuthStore();
  const { items, categories, completeReview, deleteItem } = useLearningStore();

  const params = route?.params as { itemId?: string; initialTab?: Tab } | undefined;
  const [tab, setTab] = useState<Tab>(params?.initialTab ?? 'today');
  const [focusedItemId, setFocusedItemId] = useState<string | undefined>(params?.itemId);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!params?.initialTab) return;
    setTab(params.initialTab);
    setFocusedItemId(params.itemId);
  }, [params?.itemId, params?.initialTab]);

  const today = localDateKey();

  // today / all タブ用フラットリスト
  const filtered = useMemo(() => {
    switch (tab) {
      case 'today':  return items.filter(i => i.dateKey === today);
      case 'all':    return items;
      default:       return [];
    }
  }, [items, tab, today]);

  // review タブ用セクションリスト（ステージごとにグループ化）
  const reviewSections = useMemo(() => {
    const dueItems = items.filter(i => !!i.notionPageId && !isFullyCompleted(i) && hasDueReview(i));
    return REVIEW_STAGE_LABELS.map((label, i) => ({
      key:        String(i),
      label,
      stageIndex: i,
      color:      STAGE_COLORS[i],
      bg:         STAGE_BG[i],
      data:       dueItems.filter(item => {
        const next = item.reviews?.find(r => !r.completed);
        return next?.stageIndex === i;
      }),
    })).filter(s => s.data.length > 0);
  }, [items]);

  const reviewCount = useMemo(
    () => items.filter(i => !!i.notionPageId && !isFullyCompleted(i) && hasDueReview(i)).length,
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('AddLearning', { quick: true })}>
            <Text style={styles.quickBtnText}>⚡</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddLearning')}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        </View>
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

      {/* リスト: review タブはセクション分け、他はフラット */}
      {tab === 'review' ? (
        <SectionList
          sections={reviewSections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: section.bg, borderLeftColor: section.color }]}>
              <Text style={[styles.sectionTitle, { color: section.color }]}>{section.label}</Text>
              <Text style={[styles.sectionCount, { color: section.color }]}>{section.data.length}件</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <LearningItemCard
              item={item}
              categoryName={getCategoryName(item.categoryId)}
              onCompleteReview={handleCompleteReview}
              onDelete={() => handleDelete(item)}
              initialExpanded={item.id === focusedItemId}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>復習の必要なアイテムはありません 🎉</Text>
          }
          stickySectionHeadersEnabled={false}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <LearningItemCard
              item={item}
              categoryName={getCategoryName(item.categoryId)}
              onCompleteReview={handleCompleteReview}
              onDelete={() => handleDelete(item)}
              initialExpanded={item.id === focusedItemId}
            />
          )}
          onLayout={() => {
            if (!focusedItemId) return;
            const idx = filtered.findIndex(i => i.id === focusedItemId);
            if (idx >= 0) flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.1 });
          }}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
            }, 300);
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'today' ? '今日の記録はまだありません' : 'アイテムがありません'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function LearningItemCard({
  item, categoryName, onCompleteReview, onDelete, initialExpanded,
}: {
  item: LearningItem;
  categoryName?: string;
  onCompleteReview: (item: LearningItem, stageIndex: number) => void;
  onDelete: () => void;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const completed = isFullyCompleted(item);
  const due = hasDueReview(item);
  const nextReview = item.reviews?.find(r => !r.completed);

  return (
    <TouchableOpacity
      style={[styles.card, completed && styles.cardCompleted]}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
    >
      {/* タイトル行：タイトル ＋ ゴミ箱を同じ行に中央揃え */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, completed && styles.cardTitleDone]} numberOfLines={expanded ? undefined : 2}>
            {item.title}
          </Text>
          {/* バッジをタイトル下に小さく表示 */}
          <View style={styles.cardMeta}>
            {categoryName && <Text style={styles.category}>{categoryName}</Text>}
            {due && !completed && <View style={styles.dueBadge}><Text style={styles.dueText}>要復習</Text></View>}
            {completed && <View style={styles.doneBadge}><Text style={styles.doneText}>完了</Text></View>}
          </View>
        </View>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <>
          {item.content ? (
            <ContentRenderer content={item.content} baseTextColor="#6b7280" />
          ) : null}
          {/* 復習完了ボタン（次の未完了ステージ） */}
          {due && !completed && nextReview && (
            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => onCompleteReview(item, nextReview.stageIndex)}
              activeOpacity={0.8}
            >
              <Text style={styles.completeBtnText}>✓ 復習完了</Text>
              <Text style={styles.completeBtnStage}>{REVIEW_STAGE_LABELS[nextReview.stageIndex]}</Text>
            </TouchableOpacity>
          )}
          {/* 復習ステージ進捗 */}
          <View style={styles.reviewRow}>
            {(item.reviews ?? []).map((r, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.reviewDot,
                  r.completed ? styles.reviewDotDone : ((r.scheduledDate ?? '') <= localDateKey() ? styles.reviewDotDue : styles.reviewDotFuture),
                ]}
                onPress={() => !r.completed && onCompleteReview(item, r.stageIndex)}
                disabled={r.completed}>
                <Text style={styles.reviewDotText}>{REVIEW_STAGE_LABELS[i] ?? ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  quickBtn: { backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#F59E0B' },
  quickBtnText: { color: '#92400e', fontWeight: '700', fontSize: 14 },
  addBtn: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#111827', fontWeight: '600', fontSize: 14 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#e5e7eb' },
  tabActive: { backgroundColor: '#F59E0B' },
  tabText: { color: '#6b7280', fontSize: 13 },
  tabTextActive: { color: '#111827', fontWeight: '600' },
  list: { padding: 16, paddingTop: 8, gap: 10 },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 40, fontSize: 14 },
  // セクションヘッダー
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 6, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700' },
  sectionCount: { fontSize: 12, fontWeight: '600' },
  // カード
  card: { backgroundColor: '#ffffff', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#e5e7eb', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardCompleted: { opacity: 0.6, borderLeftColor: '#10b981' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleBlock: { flex: 1, marginRight: 8 },
  cardMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  category: { fontSize: 11, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dueBadge: { backgroundColor: '#fef2f2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  dueText: { fontSize: 11, color: '#ef4444', fontWeight: '600' },
  doneBadge: { backgroundColor: '#f0fdf4', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  doneText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 16 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#9ca3af' },
  reviewRow: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  reviewDot: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  reviewDotDone: { backgroundColor: '#10b981' },
  reviewDotDue: { backgroundColor: '#ef4444' },
  reviewDotFuture: { backgroundColor: '#d1d5db' },
  reviewDotText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  completeBtn: { margin: 8, marginBottom: 4, backgroundColor: '#10b981', borderRadius: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  completeBtnStage: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
});
