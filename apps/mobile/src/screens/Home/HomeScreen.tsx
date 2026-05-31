import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { useAuthStore } from '../../store/authStore';
import { useLearningStore } from '../../store/learningStore';
import { LearningItem, hasDueReview, isFullyCompleted, localDateKey, REVIEW_STAGE_LABELS, isTipTapContent } from '../../types';
import { TipTapRenderer } from '../../components/TipTapRenderer';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { items, subscribeItems, subscribeCategories, completeReview } = useLearningStore();

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeItems(user.uid);
    const unsub2 = subscribeCategories(user.uid);
    return () => { unsub1(); unsub2(); };
  }, [user]);

  const today = localDateKey();

  const todayItems = useMemo(
    () => items.filter(i => i.dateKey === today),
    [items, today],
  );

  const dueItems = useMemo(
    () => items.filter(i => !isFullyCompleted(i) && hasDueReview(i)),
    [items],
  );

  const weekCount = useMemo(() =>
    items.filter(i => {
      const diff = (Date.now() - new Date(i.dateKey).getTime()) / 86400000;
      return diff >= 0 && diff < 7;
    }).length,
    [items],
  );

  const displayName = user?.displayName?.split(' ')[0] ?? 'ゲスト';

  // 今日の復習: 展開中カードID
  const [expandedDueId, setExpandedDueId] = useState<string | null>(null);

  const handleCompleteReview = async (item: LearningItem, stageIndex: number) => {
    if (!user) return;
    await completeReview(user.uid, item.id, stageIndex);
    // 全ステージ完了したら閉じる
    const updated = item.reviews.map(r =>
      r.stageIndex === stageIndex ? { ...r, completed: true } : r,
    );
    if (updated.every(r => r.completed)) setExpandedDueId(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>こんにちは、{displayName} さん 👋</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          <TouchableOpacity style={styles.recordBtn} onPress={() => navigation.navigate('AddLearning')}>
            <Text style={styles.recordBtnText}>＋ 記録</Text>
          </TouchableOpacity>
        </View>

        {/* 統計（今週 + 累計）*/}
        <View style={styles.statsRow}>
          <StatMini label="今週" value={weekCount} color="#10b981" />
          <StatMini label="累計" value={items.length} color="#6366f1" />
        </View>

        {/* 今日の登録 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>今日の登録</Text>
            <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.badgeText}>{todayItems.length}</Text>
            </View>
          </View>
          {todayItems.length === 0
            ? <Text style={styles.empty}>まだありません</Text>
            : todayItems.map(item => (
                <HomeItemChip
                  key={item.id}
                  item={item}
                  onPress={() => navigation.navigate('Learning', { itemId: item.id, initialTab: 'today' })}
                />
              ))
          }
        </View>

        {/* 今日の復習 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>今日の復習</Text>
            <View style={[styles.badge, { backgroundColor: dueItems.length > 0 ? '#ef4444' : '#d1d5db' }]}>
              <Text style={styles.badgeText}>{dueItems.length}</Text>
            </View>
          </View>
          {dueItems.length === 0
            ? <Text style={styles.empty}>なし 🎉</Text>
            : dueItems.map(item => (
                <DueItemCard
                  key={item.id}
                  item={item}
                  expanded={expandedDueId === item.id}
                  onToggle={() => setExpandedDueId(prev => prev === item.id ? null : item.id)}
                  onCompleteReview={handleCompleteReview}
                />
              ))
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 今日の登録チップ（シンプル、タップで遷移） ──────────────────────────────

function HomeItemChip({ item, onPress }: { item: LearningItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.chipTitle} numberOfLines={2}>
        {item.title || item.content.slice(0, 40)}
      </Text>
    </TouchableOpacity>
  );
}

// ── 今日の復習カード（タップでその場に展開） ────────────────────────────────

function DueItemCard({ item, expanded, onToggle, onCompleteReview }: {
  item: LearningItem;
  expanded: boolean;
  onToggle: () => void;
  onCompleteReview: (item: LearningItem, stageIndex: number) => void;
}) {
  const nextReview = item.reviews?.find(r => !r.completed);

  return (
    <View style={[styles.dueCard, expanded && styles.dueCardExpanded]}>
      {/* ヘッダー行（タップで開閉） */}
      <TouchableOpacity style={styles.dueCardHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.dueCardTitleRow}>
          <Text style={styles.dueCardTitle} numberOfLines={expanded ? undefined : 2}>
            {item.title || item.content.slice(0, 40)}
          </Text>
          <Text style={styles.dueCardChevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
        {!expanded && nextReview !== undefined && (
          <View style={styles.stageBadge}>
            <Text style={styles.stageBadgeText}>{REVIEW_STAGE_LABELS[nextReview.stageIndex]}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* 展開コンテンツ */}
      {expanded && (
        <>
          {/* 本文 */}
          {item.content ? (
            <View style={styles.dueCardContent}>
              {isTipTapContent(item.content) ? (
                <TipTapRenderer content={item.content} baseTextColor="#6b7280" />
              ) : (
                <Markdown style={markdownStyles}>{item.content}</Markdown>
              )}
            </View>
          ) : null}

          {/* 復習ステージボタン */}
          <View style={styles.reviewRow}>
            {(item.reviews ?? []).map((r, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.reviewDot,
                  r.completed
                    ? styles.reviewDotDone
                    : ((r.scheduledDate ?? '') <= localDateKey()
                        ? styles.reviewDotDue
                        : styles.reviewDotFuture),
                ]}
                onPress={() => !r.completed && onCompleteReview(item, r.stageIndex)}
                disabled={r.completed}
              >
                <Text style={styles.reviewDotText}>{REVIEW_STAGE_LABELS[i] ?? ''}</Text>
                {r.completed && <Text style={styles.reviewDotCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statMini, { borderLeftColor: color }]}>
      <Text style={styles.statMiniLabel}>{label}</Text>
      <Text style={[styles.statMiniValue, { color }]}>
        {value}<Text style={styles.statMiniUnit}> 件</Text>
      </Text>
    </View>
  );
}

const markdownStyles = {
  body:        { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  strong:      { fontWeight: '700' as const, color: '#374151' },
  em:          { fontStyle: 'italic' as const },
  code_inline: { backgroundColor: '#f3f4f6', borderRadius: 3, paddingHorizontal: 4, fontFamily: 'monospace', fontSize: 12 },
  code_block:  { backgroundColor: '#f3f4f6', borderRadius: 6, padding: 8, fontFamily: 'monospace', fontSize: 12 },
  bullet_list: { marginVertical: 2 },
  list_item:   { marginVertical: 1 },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  greeting: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  date: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  recordBtn: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  recordBtnText: { color: '#111827', fontWeight: '700', fontSize: 14 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statMini: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  statMiniLabel: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  statMiniValue: { fontSize: 22, fontWeight: 'bold' },
  statMiniUnit: { fontSize: 12, color: '#6b7280', fontWeight: 'normal' },

  // セクション
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#374151' },
  badge: { borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  empty: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 4 },

  // 今日の登録チップ
  chip: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipTitle: { fontSize: 12, color: '#111827', fontWeight: '500' },

  // 今日の復習カード
  dueCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    overflow: 'hidden',
  },
  dueCardExpanded: {
    borderColor: '#ef4444',
  },
  dueCardHeader: {
    padding: 10,
  },
  dueCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  dueCardTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' },
  dueCardChevron: { fontSize: 10, color: '#ef4444', marginTop: 2 },
  stageBadge: { backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  stageBadgeText: { fontSize: 10, color: '#ef4444', fontWeight: '600' },

  dueCardContent: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },

  reviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },
  reviewDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  reviewDotDone:   { backgroundColor: '#10b981' },
  reviewDotDue:    { backgroundColor: '#ef4444' },
  reviewDotFuture: { backgroundColor: '#d1d5db' },
  reviewDotText:   { fontSize: 11, color: '#fff', fontWeight: '600' },
  reviewDotCheck:  { fontSize: 10, color: '#fff' },
});
