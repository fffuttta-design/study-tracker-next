'use client';

import React, { useState, useEffect } from 'react';
import { APP_VERSION } from '@/lib/version';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore, REVIEW_STAGE_LABELS } from '@/stores/settingsStore';
import type { BackupStatus } from '@/app/(app)/layout';

// window.electronAPI の型は layout.tsx で一元定義済み

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const {
    reviewStageDays, setReviewStageDays, resetReviewStageDays,
    reviewNotificationTime, setReviewNotificationTime,
  } = useSettingsStore();

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  return (
    <div className="px-6 py-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-800">設定</h1>

      <div className="max-w-md space-y-4">
        {/* 復習間隔 */}
        <Section title="復習間隔">
          <p className="mb-3 text-xs text-gray-400">
            学習アイテムを追加したときの復習スケジュールを変更できます
          </p>
          <div className="space-y-2">
            {REVIEW_STAGE_LABELS.map((label, i) => (
              <ReviewStageRow
                key={label}
                stageLabel={label}
                stageIndex={i + 1}
                days={reviewStageDays[i]}
                onChange={(days) => {
                  const next = [...reviewStageDays];
                  next[i] = days;
                  setReviewStageDays(next);
                }}
              />
            ))}
          </div>
          <button
            onClick={resetReviewStageDays}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 hover:underline"
          >
            デフォルトに戻す
          </button>
        </Section>

        {/* アカウント */}
        <Section title="アカウント">
          <div className="flex items-center gap-3 py-1">
            {user?.photoURL && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" className="h-10 w-10 rounded-full" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-800">{user?.displayName}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="mt-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-500 hover:bg-red-50"
          >
            ログアウト
          </button>
        </Section>

        {/* 復習通知（Electronのみ） */}
        {isElectron && (
          <Section title="復習通知">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm text-gray-700">通知時刻</p>
                <p className="text-xs text-gray-400">毎日この時刻に復習待ちを通知</p>
              </div>
              <input
                type="time"
                value={reviewNotificationTime}
                onChange={(e) => setReviewNotificationTime(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </Section>
        )}

        {/* バックアップ（Electronのみ） */}
        {isElectron && <BackupSection />}

        {/* アプリ操作 */}
        {isElectron && (
          <Section title="アプリ操作">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm text-gray-700">アプリを再起動</p>
                <p className="text-xs text-gray-400">設定を反映させたいときに使用</p>
              </div>
              <button
                onClick={() => window.electronAPI?.relaunch?.()}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800"
              >
                再起動
              </button>
            </div>
          </Section>
        )}

        {/* アプリ情報 */}
        <Section title="アプリ情報">
          <InfoRow label="バージョン" value={APP_VERSION} />
          <InfoRow label="Firebase プロジェクト" value="time-tracker-app-72eba" />
        </Section>
      </div>
    </div>
  );
}

// ── バックアップセクション ─────────────────────────────────────────

function BackupSection() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [drivePath, setDrivePath] = useState<string | null>(null);

  // 起動時にバックアップ情報を取得
  useEffect(() => {
    window.electronAPI?.getBackupInfo?.().then((info) => {
      if (info) {
        setStatus(info);
        setDrivePath(info.driveBackupPath ?? null);
      }
    });

    // バックアップ完了イベントを購読
    window.electronAPI?.onBackupComplete?.((info) => {
      setRunning(false);
      setStatus((prev) => prev ? { ...prev, lastBackup: info } : null);
      setToast(info.success
        ? { ok: true,  msg: 'バックアップ完了！' }
        : { ok: false, msg: `バックアップ失敗: ${info.error ?? '不明'}` }
      );
      setTimeout(() => setToast(null), 4000);
    });
  }, []);

  const handleNow = () => {
    setRunning(true);
    window.electronAPI?.triggerBackup?.();
  };

  const handleTimeChange = (time: string) => {
    window.electronAPI?.setBackupTime?.(time);
    // ローカル表示も更新
    if (status) {
      const [h, m] = time.split(':').map(Number);
      setStatus({ ...status, backupHour: h ?? 3, backupMinute: m ?? 0 });
    }
  };

  const handleSelectDriveFolder = async () => {
    const selected = await window.electronAPI?.selectDriveFolder?.();
    if (selected) setDrivePath(selected);
  };

  const handleClearDrivePath = () => {
    window.electronAPI?.setDriveBackupPath?.(null);
    setDrivePath(null);
  };

  const backupTimeValue = status
    ? `${String(status.backupHour).padStart(2, '0')}:${String(status.backupMinute).padStart(2, '0')}`
    : '03:00';

  const lastBackupText = (() => {
    if (!status?.lastBackup) return 'まだ実行されていません';
    const d = new Date(status.lastBackup.time);
    const fmt = d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return status.lastBackup.success ? `✅ ${fmt}` : `❌ ${fmt}（失敗）`;
  })();

  return (
    <Section title="自動バックアップ">
      {/* 自動実行時刻 */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-sm text-gray-700">自動バックアップ時刻</p>
          <p className="text-xs text-gray-400">毎日この時刻に全データを保存</p>
        </div>
        <input
          type="time"
          value={backupTimeValue}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {/* ローカル保存先 */}
      {status?.backupDir && (
        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-400">ローカル保存先</p>
          <p className="mt-0.5 break-all font-mono text-xs text-gray-600">{status.backupDir}</p>
        </div>
      )}

      {/* Google Drive 保存先 */}
      <div className="mt-2">
        <p className="mb-1 text-xs text-gray-500">Google Drive バックアップ先</p>
        {drivePath ? (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="break-all font-mono text-xs text-blue-700">{drivePath}</p>
              <p className="mt-0.5 text-xs text-blue-400">バックアップ時に自動コピーされます</p>
            </div>
            <button
              onClick={handleClearDrivePath}
              className="shrink-0 text-xs text-gray-400 hover:text-red-400"
            >
              削除
            </button>
          </div>
        ) : (
          <button
            onClick={handleSelectDriveFolder}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-500"
          >
            <span>＋</span>
            <span>Google Driveのフォルダを選択</span>
          </button>
        )}
      </div>

      {/* 最後のバックアップ */}
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">前回のバックアップ</p>
          <p className="text-xs font-medium text-gray-600">{lastBackupText}</p>
        </div>
        <button
          onClick={handleNow}
          disabled={running}
          className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50"
        >
          {running ? '実行中...' : '今すぐバックアップ'}
        </button>
      </div>

      {/* トースト */}
      {toast && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        最新30件を自動保持。古いものは自動削除されます。
      </p>
    </Section>
  );
}

// ── 共通コンポーネント ─────────────────────────────────────────────

function ReviewStageRow({ stageLabel, stageIndex, days, onChange }: {
  stageLabel: string;
  stageIndex: number;
  days: number;
  onChange: (days: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(days));

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n > 0) onChange(n);
    else setDraft(String(days));
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600">
          {stageIndex}
        </span>
        <span className="text-sm text-gray-700">{stageLabel}</span>
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(String(days)); setEditing(false); } }}
            className="w-14 rounded border border-brand-400 px-2 py-0.5 text-right text-sm outline-none"
            type="number"
            min="1"
          />
          <span className="text-xs text-gray-400">日後</span>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(String(days)); setEditing(true); }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-sm text-gray-500 hover:bg-white hover:text-brand-600"
        >
          <span className="font-medium">{days}</span>
          <span className="text-xs text-gray-400">日後</span>
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm text-gray-400">{value}</span>
    </div>
  );
}
