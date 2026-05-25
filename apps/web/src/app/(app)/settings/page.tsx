'use client';

import React, { useState } from 'react';
import { APP_VERSION } from '@/lib/version';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore, REVIEW_STAGE_LABELS } from '@/stores/settingsStore';

declare global {
  interface Window {
    electronAPI?: { platform: string; relaunch?: () => void };
  }
}

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const { reviewStageDays, setReviewStageDays, resetReviewStageDays } = useSettingsStore();

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

        {/* アプリ操作 */}
        {typeof window !== 'undefined' && window.electronAPI && (
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
