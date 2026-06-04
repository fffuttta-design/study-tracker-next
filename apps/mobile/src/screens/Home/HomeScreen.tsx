import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useLearningStore } from '../../store/learningStore';
import { useNotionStore } from '../../store/notionStore';
import { EditorPreloader } from '../../components/EditorPreloader';
import { LearningItem, hasDueReview, isFullyCompleted, localDateKey, REVIEW_STAGE_LABELS, toggleTipTapTask } from '../../types';

const STAGE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'] as const;
const STAGE_BG     = ['#fef2f2', '#fffbeb', '#f0fdf4', '#eff6ff', '#faf5ff'] as const;
import { ContentRenderer } from '../../components/ContentRenderer';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { items, subscribeItems, subscribeCategories, completeReview, updateItemContent, addItem } = useLearningStore();
  const { subscribePages: subscribeNotionPages } = useNotionStore();

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeItems(user.uid);
    const unsub2 = subscribeCategories(user.uid);
    // HomeScreenで常時購読することでタブ切替時のフラッシュを防ぐ
    const unsub3 = subscribeNotionPages(user.uid);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [user]);

  const today = localDateKey();

  const todayItems  = useMemo(() => items.filter(i => i.dateKey === today), [items, today]);
  // 消化済み（通常記録）と特急メモを分離
  const digestedItems = useMemo(() => todayItems.filter(i => !!i.notionPageId), [todayItems]);
  const inboxItems    = useMemo(() => todayItems.filter(i => !i.notionPageId),  [todayItems]);

  const dueItems = useMemo(
    () => items.filter(i => !isFullyCompleted(i) && hasDueReview(i)),
    [items],
  );

  // ステージごとにグループ化
  const dueGroups = useMemo(
    () => REVIEW_STAGE_LABELS.map((label, i) => ({
      label,
      stageIndex: i,
      color: STAGE_COLORS[i],
      bg:    STAGE_BG[i],
      items: dueItems.filter(item => {
        const next = item.reviews?.find(r => !r.completed);
        return next?.stageIndex === i;
      }),
    })).filter(g => g.items.length > 0),
    [dueItems],
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
  // ⚡ 特急クイック入力
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickContent, setQuickContent] = useState('');

  const handleQuickSave = async () => {
    if (!quickTitle.trim() || !user) return;
    try {
      await addItem(user.uid, { title: quickTitle.trim(), content: quickContent.trim(), dateKey: localDateKey() });
      setQuickTitle('');
      setQuickContent('');
      setQuickOpen(false);
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    }
  };

  const handleToggleTask = async (item: LearningItem, taskIndex: number) => {
    if (!user) return;
    const newContent = toggleTipTapTask(item.content, taskIndex);
    await updateItemContent(user.uid, item.id, newContent);
  };

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
      {/* editor-mobile URLをバックグラウンドでプリロード */}
      <EditorPreloader />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>こんにちは、{displayName} さん 👋</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => setQuickOpen(true)}>
              <Text style={styles.quickBtnText}>⚡ 特急</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.recordBtn} onPress={() => navigation.navigate('AddLearning')}>
              <Text style={styles.recordBtnText}>＋ 記録</Text>
            </TouchableOpacity>
          </View>

          {/* ⚡ 特急クイック入力モーダル */}
          <Modal visible={quickOpen} transparent animationType="fade">
            <View style={styles.quickOverlay}>
              <View style={styles.quickModal}>
                <Text style={styles.quickLabel}>⚡ 特急メモ</Text>
                <TextInput
                  style={styles.quickInput}
                  value={quickTitle}
                  onChangeText={setQuickTitle}
                  placeholder="タイトルを入力..."
                  placeholderTextColor="#9ca3af"
                  autoFocus
                />
                <TextInput
                  style={[styles.quickInput, { minHeight: 72, marginTop: 8 }]}
                  value={quickContent}
                  onChangeText={setQuickContent}
                  placeholder="内容・メモ（任意）"
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                />
                <View style={styles.quickBtns}>
                  <TouchableOpacity style={styles.quickCancel} onPress={() => { setQuickOpen(false); setQuickTitle(''); }}>
                    <Text style={styles.quickCancelText}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickSave} onPress={handleQuickSave}>
                    <Text style={styles.quickSaveText}>記録</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>

        {/* 統計（今週 + 累計）*/}
        <View style={styles.statsRow}>
          <StatMini label="今週" value={weekCount} color="#10b981" />
          <StatMini label="累計" value={items.length} color="#6366f1" />
        </View>

        {/* ⚡ 特急メモ（未消化） */}
        {inboxItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>⚡ 特急メモ（未消化）</Text>
              <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.badgeText}>{inboxItems.length}</Text>
              </View>
            </View>
            {inboxItems.map(item => (
              <HomeItemChip
                key={item.id}
                item={item}
                onPress={() => navigation.navigate('Learning', { itemId: item.id, initialTab: 'today' })}
              />
            ))}
          </View>
        )}

        {/* 今日の登録（消化済み・通常記録のみ） */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>今日の登録</Text>
            <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.badgeText}>{digestedItems.length}</Text>
            </View>
          </View>
          {digestedItems.length === 0
            ? <Text style={styles.empty}>まだありません</Text>
            : digestedItems.map(item => (
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
          {dueGroups.length === 0
            ? <Text style={styles.empty}>なし 🎉</Text>
            : dueGroups.map(group => (
                <View key={group.stageIndex}>
                  {/* ステージヘッダー */}
                  <View style={[styles.stageHeader, { backgroundColor: group.bg, borderLeftColor: group.color }]}>
                    <Text style={[styles.stageLabel, { color: group.color }]}>{group.label}</Text>
                    <Text style={[styles.stageCount, { color: group.color }]}>{group.items.length}件</Text>
                  </View>
                  {group.items.map(item => (
                    <DueItemCard
                      key={item.id}
                      item={item}
                      stageColor={group.color}
                      stageBg={group.bg}
                      expanded={expandedDueId === item.id}
                      onToggle={() => setExpandedDueId(prev => prev === item.id ? null : item.id)}
                      onCompleteReview={handleCompleteReview}
                      onToggleTask={(taskIndex) => handleToggleTask(item, taskIndex)}
                    />
                  ))}
                </View>
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

function DueItemCard({ item, stageColor, stageBg, expanded, onToggle, onCompleteReview, onToggleTask }: {
  item: LearningItem;
  stageColor?: string;
  stageBg?: string;
  expanded: boolean;
  onToggle: () => void;
  onCompleteReview: (item: LearningItem, stageIndex: number) => void;
  onToggleTask?: (taskIndex: number) => void;
}) {
  const nextReview = item.reviews?.find(r => !r.completed);
  const borderColor = stageColor ?? '#fecaca';
  const bgColor     = stageBg    ?? '#fef2f2';

  return (
    <View style={[styles.dueCard, { backgroundColor: bgColor, borderColor }, expanded && { borderColor }]}>
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
              <ContentRenderer
                content={item.content}
                baseTextColor="#374151"
                onToggleTask={onToggleTask}
              />
            </View>
          ) : null}

          {/* 大きな復習完了ボタン（次の未完了ステージを1タップで完了） */}
          {nextReview && (
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
              <View
                key={i}
                style={[
                  styles.reviewDot,
                  r.completed
                    ? styles.reviewDotDone
                    : ((r.scheduledDate ?? '') <= localDateKey()
                        ? styles.reviewDotDue
                        : styles.reviewDotFuture),
                ]}
              >
                <Text style={styles.reviewDotText}>{REVIEW_STAGE_LABELS[i] ?? ''}</Text>
                {r.completed && <Text style={styles.reviewDotCheck}> ✓</Text>}
              </View>
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


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  greeting: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  date: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  quickBtn: { backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#F59E0B' },
  quickBtnText: { color: '#92400e', fontWeight: '700', fontSize: 14 },
  recordBtn: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  recordBtnText: { color: '#111827', fontWeight: '700', fontSize: 14 },
  // 特急モーダル
  quickOverlay: { flex: 1, backgroundColor: '#00000055', justifyContent: 'center', padding: 24 },
  quickModal: { backgroundColor: '#fff', borderRadius: 14, padding: 20, gap: 12 },
  quickLabel: { fontSize: 16, fontWeight: 'bold', color: '#92400e' },
  quickInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 15, color: '#111827' },
  quickBtns: { flexDirection: 'row', gap: 10 },
  quickCancel: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' },
  quickCancelText: { color: '#374151', fontWeight: '600' },
  quickSave: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#F59E0B', alignItems: 'center' },
  quickSaveText: { color: '#111827', fontWeight: 'bold' },

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

  // 復習ステージヘッダー
  stageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 6, marginTop: 4 },
  stageLabel:  { fontSize: 12, fontWeight: '700' },
  stageCount:  { fontSize: 11, fontWeight: '600' },

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

  // 大きな復習完了ボタン
  completeBtn: {
    margin: 10,
    marginBottom: 6,
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  completeBtnStage: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

  // 復習ステージ進捗（非タップ・視覚表示のみ）
  reviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 4,
  },
  reviewDot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reviewDotDone:   { backgroundColor: '#10b981' },
  reviewDotDue:    { backgroundColor: '#ef4444' },
  reviewDotFuture: { backgroundColor: '#d1d5db' },
  reviewDotText:   { fontSize: 11, color: '#fff', fontWeight: '600' },
  reviewDotCheck:  { fontSize: 10, color: '#fff' },
});
