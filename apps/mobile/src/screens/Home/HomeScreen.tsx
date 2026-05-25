import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useLearningStore } from '../../store/learningStore';
import { LearningItem, hasDueReview, isFullyCompleted, localDateKey, REVIEW_STAGE_LABELS } from '../../types';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { items, subscribeItems, subscribeCategories } = useLearningStore();

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

        {/* 2カラム: 今日の登録 | 今日の復習 */}
        <View style={styles.twoCol}>
          {/* 今日の登録 */}
          <View style={styles.col}>
            <View style={styles.colHeader}>
              <Text style={styles.colTitle}>今日の登録</Text>
              <View style={[styles.colBadge, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.colBadgeText}>{todayItems.length}</Text>
              </View>
            </View>
            {todayItems.length === 0
              ? <Text style={styles.colEmpty}>まだありません</Text>
              : todayItems.map(item => (
                  <HomeItemChip
                    key={item.id}
                    item={item}
                    onPress={() => navigation.navigate('Learning')}
                  />
                ))
            }
          </View>

          <View style={styles.colDivider} />

          {/* 今日の復習 */}
          <View style={styles.col}>
            <View style={styles.colHeader}>
              <Text style={styles.colTitle}>今日の復習</Text>
              <View style={[styles.colBadge, { backgroundColor: dueItems.length > 0 ? '#ef4444' : '#d1d5db' }]}>
                <Text style={styles.colBadgeText}>{dueItems.length}</Text>
              </View>
            </View>
            {dueItems.length === 0
              ? <Text style={styles.colEmpty}>なし 🎉</Text>
              : dueItems.map(item => (
                  <HomeItemChip
                    key={item.id}
                    item={item}
                    isDue
                    onPress={() => navigation.navigate('Learning')}
                  />
                ))
            }
          </View>
        </View>

        {/* 統計（今週 + 累計） */}
        <View style={styles.statsRow}>
          <StatMini label="今週" value={weekCount} color="#10b981" />
          <StatMini label="累計" value={items.length} color="#6366f1" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeItemChip({ item, isDue, onPress }: {
  item: LearningItem;
  isDue?: boolean;
  onPress: () => void;
}) {
  const nextReview = isDue ? item.reviews.find(r => !r.completed) : undefined;
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.chipTitle} numberOfLines={2}>
        {item.title || item.content.slice(0, 40)}
      </Text>
      {nextReview !== undefined && (
        <View style={styles.chipStageBadge}>
          <Text style={styles.chipStageBadgeText}>{REVIEW_STAGE_LABELS[nextReview.stageIndex]}</Text>
        </View>
      )}
    </TouchableOpacity>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  greeting: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  date: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  recordBtn: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  recordBtnText: { color: '#111827', fontWeight: '700', fontSize: 14 },

  twoCol: {
    flexDirection: 'row',
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
  col: { flex: 1 },
  colDivider: { width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 12 },
  colHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  colTitle: { fontSize: 13, fontWeight: '600', color: '#374151' },
  colBadge: { borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  colBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  colEmpty: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8 },

  chip: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipTitle: { fontSize: 12, color: '#111827', fontWeight: '500', marginBottom: 2 },
  chipStageBadge: { backgroundColor: '#fef2f2', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 },
  chipStageBadgeText: { fontSize: 10, color: '#ef4444', fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 12 },
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
});
