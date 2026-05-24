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
import { hasDueReview, isFullyCompleted, localDateKey } from '../../types';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { items, subscribeItems, subscribeCategories } = useLearningStore();

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeItems(user.uid);
    const unsub2 = subscribeCategories(user.uid);
    return () => { unsub1(); unsub2(); };
  }, [user]);

  const stats = useMemo(() => {
    const today = localDateKey();
    const todayItems = items.filter(i => i.dateKey === today);
    const dueReviews = items.filter(i => !isFullyCompleted(i) && hasDueReview(i));
    const thisWeek = items.filter(i => {
      const d = new Date(i.dateKey);
      const now = new Date();
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff < 7;
    });
    return {
      todayCount: todayItems.length,
      dueCount: dueReviews.length,
      weekCount: thisWeek.length,
      totalCount: items.length,
    };
  }, [items]);

  const displayName = user?.displayName?.split(' ')[0] ?? 'ゲスト';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.greeting}>こんにちは、{displayName} さん 👋</Text>
          <Text style={styles.date}>{localDateKey()}</Text>
        </View>

        {/* 統計カード */}
        <View style={styles.statsGrid}>
          <StatCard
            label="今日の記録"
            value={stats.todayCount}
            unit="件"
            color="#F59E0B"
            onPress={() => navigation.navigate('Learning')}
          />
          <StatCard
            label="要復習"
            value={stats.dueCount}
            unit="件"
            color="#ef4444"
            onPress={() => navigation.navigate('Learning')}
          />
          <StatCard
            label="今週の記録"
            value={stats.weekCount}
            unit="件"
            color="#10b981"
          />
          <StatCard
            label="累計記録"
            value={stats.totalCount}
            unit="件"
            color="#6366f1"
          />
        </View>

        {/* クイックアクション */}
        <Text style={styles.sectionTitle}>クイックアクション</Text>
        <View style={styles.actions}>
          <ActionBtn
            emoji="➕"
            label="今日の学習を記録"
            onPress={() => navigation.navigate('AddLearning')}
          />
          <ActionBtn
            emoji="🔁"
            label={`復習する（${stats.dueCount}件）`}
            onPress={() => navigation.navigate('Learning')}
            badge={stats.dueCount}
          />
          <ActionBtn
            emoji="📝"
            label="ノートを開く"
            onPress={() => navigation.navigate('NotionPlus')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label, value, unit, color, onPress,
}: {
  label: string; value: number; unit: string; color: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: color }]} onPress={onPress} disabled={!onPress}>
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={styles.cardValueRow}>
        <Text style={[styles.cardValue, { color }]}>{value}</Text>
        <Text style={styles.cardUnit}>{unit}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ActionBtn({
  emoji, label, onPress, badge,
}: {
  emoji: string; label: string; onPress: () => void; badge?: number;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
      <Text style={styles.actionEmoji}>{emoji}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
      {!!badge && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#111827' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#f9fafb' },
  date: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
  },
  cardLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  cardValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  cardValue: { fontSize: 28, fontWeight: 'bold' },
  cardUnit: { fontSize: 13, color: '#9ca3af' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#d1d5db', marginBottom: 12 },
  actions: { gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 16,
    gap: 12,
  },
  actionEmoji: { fontSize: 22 },
  actionLabel: { flex: 1, fontSize: 15, color: '#f9fafb' },
  badge: { backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
});
