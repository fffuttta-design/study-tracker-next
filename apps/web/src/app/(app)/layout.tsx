'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { useImprovementTaskStore } from '@/stores/improvementTaskStore';
import { useGoalStore } from '@/stores/goalStore';
import { useMemoStore } from '@/stores/memoStore';
import { useDailyMemoStore } from '@/stores/dailyMemoStore';
import { Sidebar } from '@/components/layout/Sidebar';
import { hasDueReview } from '@study-tracker/core';
import { fetchAll } from '@study-tracker/firebase';
import { useSettingsStore } from '@/stores/settingsStore';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      relaunch?: () => void;
      focusWindow?: () => void;
      setReviewCount?: (count: number) => void;
      setNotificationTime?: (time: string) => void;
      // バックアップ
      onBackupRequest?:  (cb: () => void) => void;
      sendBackupData?:   (json: string) => void;
      onBackupComplete?: (cb: (info: BackupInfo) => void) => void;
      triggerBackup?:      () => void;
      getBackupInfo?:      () => Promise<BackupStatus>;
      setBackupTime?:      (time: string) => void;
      // Google Drive バックアップ
      getDriveBackupPath?: () => Promise<string | null>;
      setDriveBackupPath?: (path: string | null) => void;
      selectDriveFolder?:  () => Promise<string | null>;
      // 自動起動
      getAutoLaunch?:      () => Promise<boolean>;
      setAutoLaunch?:      (enable: boolean) => void;
      // アップデート
      checkForUpdate?:     () => Promise<{ hasUpdate: boolean; current?: { version: string; buildNumber: number }; latest?: { version: string; buildNumber: number }; reason?: string }>;
      applyUpdate?:        () => void;
    };
  }
}

export interface BackupInfo {
  time: string;
  path: string | null;
  success: boolean;
  error?: string;
}

export interface BackupStatus {
  lastBackup: BackupInfo | null;
  backupDir: string;
  backupHour: number;
  backupMinute: number;
  driveBackupPath: string | null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const router = useRouter();
  const subscribeCategories = useCategoryStore((s) => s.subscribe);
  const subscribeItems = useLearningStore((s) => s.subscribe);
  const subscribePages = useNotionPageStore((s) => s.subscribe);
  const subscribeTasks = useImprovementTaskStore((s) => s.subscribe);
  const subscribeGoals = useGoalStore((s) => s.subscribe);
  const subscribeMemos = useMemoStore((s) => s.subscribe);
  const subscribeDailyMemos = useDailyMemoStore((s) => s.subscribe);
  const items = useLearningStore((s) => s.items);
  const reviewNotificationTime = useSettingsStore((s) => s.reviewNotificationTime);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const unsub1 = subscribeCategories(uid);
    const unsub2 = subscribeItems(uid);
    const unsub3 = subscribePages(uid);
    const unsub4 = subscribeTasks(uid);
    const unsub5 = subscribeGoals(uid);
    const unsub6 = subscribeMemos(uid);
    const unsub7 = subscribeDailyMemos(uid);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  // subscribe 関数は Zustand の安定した参照のため deps 不要。uid が変わった時だけ再登録する
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Electron に復習件数・通知時刻を送信
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    // notionPageId なし（特急メモ）は復習件数に含めない
    window.electronAPI?.setReviewCount?.(items.filter(i => !!i.notionPageId && hasDueReview(i)).length);
  }, [items, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.electronAPI?.setNotificationTime?.(reviewNotificationTime);
  }, [reviewNotificationTime]);

  // Electron バックアップリクエストを受信してデータを返す
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onBackupRequest) return;

    window.electronAPI.onBackupRequest(async () => {
      try {
        const uid = useAuthStore.getState().user?.uid ?? null;

        // notionDatabaseRows は subscribeWhere（DB単位）なので Firestore から全件取得
        const notionDatabaseRows = uid
          ? await fetchAll(uid, 'notionDatabaseRows')
          : [];

        // settingsStore は localStorage 永続化なので getState() で取得
        const s = useSettingsStore.getState();
        const settings = {
          reviewStageDays:          s.reviewStageDays,
          notionPlusLayout:         s.notionPlusLayout,
          notionPlusParaLineHeight:  s.notionPlusParaLineHeight,
          notionPlusSoftLineHeight:  s.notionPlusSoftLineHeight,
          notionPlusBlockOffsets:   s.notionPlusBlockOffsets,
          reviewNotificationTime:   s.reviewNotificationTime,
        };

        const json = JSON.stringify({
          exportedAt: new Date().toISOString(),
          version: 2,
          uid,
          data: {
            learningItems:      useLearningStore.getState().items,
            categories:         useCategoryStore.getState().categories,
            notionPages:        useNotionPageStore.getState().pages,
            improvementTasks:   useImprovementTaskStore.getState().tasks,
            goals:              useGoalStore.getState().goals,
            memos:              useMemoStore.getState().memos,
            notionDatabaseRows, // 全DB行（Firestoreから直接取得）
          },
          settings, // ユーザー設定（localStorage）
        }, null, 2);

        window.electronAPI?.sendBackupData?.(json);
      } catch (e) {
        console.error('[backup] データ収集失敗:', e);
      }
    });
  // 初回マウント時のみ登録
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
