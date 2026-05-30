import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useDailyMemoStore } from '../../store/dailyMemoStore';
import { isTipTapContent, extractTextFromTipTap, localDateKey } from '../../types';
import { TipTapRenderer } from '../../components/TipTapRenderer';

// ── ユーティリティ ────────────────────────────────────────────────────

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${weekdays[d.getDay()]}）`;
}

// ── 日付セクション ────────────────────────────────────────────────────

interface DateSectionProps {
  date: string;
  isToday: boolean;
  rawContent: string;
  onSave: (date: string, content: string) => Promise<void>;
}

function DateSection({ date, isToday, rawContent, onSave }: DateSectionProps) {
  const isTipTap = isTipTapContent(rawContent);

  // 初期テキストは一度だけ設定（リアルタイム更新中に上書きしない）
  const initialText = useRef(
    isTipTapContent(rawContent) ? extractTextFromTipTap(rawContent) : rawContent,
  ).current;

  const [text, setText] = useState(initialText);
  // 今日 or 空セクションは最初から編集モード
  const [editing, setEditing] = useState(isToday || !rawContent);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    (val: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      onSave(date, val);
      dirty.current = false;
    },
    [date, onSave],
  );

  const handleChange = (val: string) => {
    setText(val);
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flush(val), 1500);
  };

  const handleBlur = () => {
    if (!dirty.current) return;
    flush(text);
  };

  return (
    <View style={s.section}>
      {/* 日付ヘッダー */}
      <View style={[s.header, isToday && s.headerToday]}>
        <Text style={[s.dateText, isToday && s.dateTextToday]}>
          {formatDateHeading(date)}
        </Text>
        {isToday && (
          <View style={s.todayBadge}>
            <Text style={s.todayBadgeText}>今日</Text>
          </View>
        )}
        {!isToday && !editing && rawContent && (
          <TouchableOpacity onPress={() => setEditing(true)} style={s.editBtn}>
            <Text style={s.editBtnText}>編集</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* コンテンツ */}
      {editing ? (
        <TextInput
          style={s.input}
          value={text}
          onChangeText={handleChange}
          onBlur={handleBlur}
          multiline
          placeholder={isToday ? '今日の学習メモを書く...' : 'メモを書く...'}
          placeholderTextColor="#d1d5db"
          textAlignVertical="top"
          autoFocus={isToday && !rawContent}
        />
      ) : rawContent ? (
        <TouchableOpacity
          onPress={() => setEditing(true)}
          activeOpacity={0.8}
          style={s.viewArea}>
          {isTipTap ? (
            <TipTapRenderer content={rawContent} baseTextColor="#374151" />
          ) : (
            <Text style={s.contentText}>{text}</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── メイン画面 ────────────────────────────────────────────────────────

export default function QuickMemoScreen() {
  const { user } = useAuthStore();
  const { memos, loading, subscribe, update } = useDailyMemoStore();

  const today = localDateKey();

  useEffect(() => {
    if (!user) return;
    const unsub = subscribe(user.uid);
    return unsub;
  }, [user]);

  // 表示する日付一覧（今日 + 内容のある日、新しい順）
  const allDates = useMemo(() => {
    const withContent = memos
      .filter(m => m.content && m.content.trim().length > 0)
      .map(m => m.id);
    const set = new Set([today, ...withContent]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [memos, today]);

  const handleSave = useCallback(
    async (date: string, content: string) => {
      if (!user) return;
      await update(user.uid, date, content);
    },
    [user, update],
  );

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator color="#F59E0B" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ヘッダー */}
        <View style={s.pageHeader}>
          <Text style={s.pageTitle}>📓 学習メモ</Text>
        </View>

        {/* ノート本体 */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled">
          {allDates.map(date => {
            const memo = memos.find(m => m.id === date);
            return (
              <DateSection
                key={date}
                date={date}
                isToday={date === today}
                rawContent={memo?.content ?? ''}
                onSave={handleSave}
              />
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── スタイル ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  pageTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  section: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fafafa',
  },
  headerToday: {
    backgroundColor: '#fffbeb',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  dateTextToday: {
    color: '#d97706',
  },
  todayBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  editBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  editBtnText: {
    fontSize: 11,
    color: '#6b7280',
  },
  input: {
    minHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
    lineHeight: 22,
  },
  viewArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  contentText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
});
