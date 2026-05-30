'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { APP_VERSION } from '@/lib/version';
import { useElectronVersion } from '@/hooks/useElectronVersion';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore, REVIEW_STAGE_LABELS } from '@/stores/settingsStore';
import type { BackupStatus } from '@/app/(app)/layout';

// ── バージョン比較ユーティリティ ──────────────────────────────────────
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

// ── サイドバーメニュー定義 ────────────────────────────────────────────
type SectionId = 'general' | 'notification' | 'backup' | 'app' | 'account' | 'version';

interface MenuItem {
  id: SectionId;
  label: string;
  icon: string;
  electronOnly?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'general',      label: '一般',         icon: '⚙️' },
  { id: 'notification', label: '通知',         icon: '🔔', electronOnly: true },
  { id: 'backup',       label: 'バックアップ', icon: '💾', electronOnly: true },
  { id: 'app',          label: 'アプリ操作',   icon: '🖥️', electronOnly: true },
  { id: 'account',      label: 'アカウント',   icon: '👤' },
  { id: 'version',      label: 'バージョン',   icon: '🏷️' },
];

// ── メインページ ─────────────────────────────────────────────────────
export default function SettingsPage() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const visibleItems = MENU_ITEMS.filter((m) => !m.electronOnly || isElectron);
  const [activeId, setActiveId] = useState<SectionId>('general');

  return (
    <div className="flex h-full">
      {/* サイドバー */}
      <aside className="flex w-48 shrink-0 flex-col border-r border-gray-100 bg-gray-50 py-4">
        <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-gray-400">設定</p>
        <nav className="space-y-0.5 px-2">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeId === item.id
                  ? 'bg-white font-medium text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:bg-white hover:text-gray-800'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* コンテンツ */}
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {activeId === 'general'      && <GeneralSection />}
        {activeId === 'notification' && isElectron && <NotificationSection />}
        {activeId === 'backup'       && isElectron && <BackupSection />}
        {activeId === 'app'          && isElectron && <AppSection />}
        {activeId === 'account'      && <AccountSection />}
        {activeId === 'version'      && <VersionSection isElectron={isElectron} />}
      </main>
    </div>
  );
}

// ── 一般（復習間隔） ──────────────────────────────────────────────────
function GeneralSection() {
  const { reviewStageDays, setReviewStageDays, resetReviewStageDays } = useSettingsStore();
  return (
    <div className="max-w-md">
      <SectionHeader title="一般" description="復習スケジュールを設定します" />
      <Card title="復習間隔">
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
      </Card>
    </div>
  );
}

// ── 通知（Electron のみ） ─────────────────────────────────────────────
function NotificationSection() {
  const { reviewNotificationTime, setReviewNotificationTime } = useSettingsStore();
  return (
    <div className="max-w-md">
      <SectionHeader title="通知" description="デスクトップ通知の設定" />
      <Card title="復習通知">
        <Row
          label="通知時刻"
          description="毎日この時刻に復習待ちを通知"
          right={
            <input
              type="time"
              value={reviewNotificationTime}
              onChange={(e) => setReviewNotificationTime(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-brand-400"
            />
          }
        />
      </Card>
    </div>
  );
}

// ── バックアップ（Electron のみ） ─────────────────────────────────────
function BackupSection() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [drivePath, setDrivePath] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.getBackupInfo?.().then((info) => {
      if (info) { setStatus(info); setDrivePath(info.driveBackupPath ?? null); }
    });
    window.electronAPI?.onBackupComplete?.((info) => {
      setRunning(false);
      setStatus((prev) => prev ? { ...prev, lastBackup: info } : null);
      setToast(info.success
        ? { ok: true, msg: 'バックアップ完了！' }
        : { ok: false, msg: `バックアップ失敗: ${info.error ?? '不明'}` }
      );
      setTimeout(() => setToast(null), 4000);
    });
  }, []);

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
    <div className="max-w-md">
      <SectionHeader title="バックアップ" description="データの自動保存設定" />
      <Card title="自動バックアップ">
        <Row
          label="自動バックアップ時刻"
          description="毎日この時刻に全データを保存"
          right={
            <input
              type="time"
              value={backupTimeValue}
              onChange={(e) => {
                window.electronAPI?.setBackupTime?.(e.target.value);
                if (status) {
                  const [h, m] = e.target.value.split(':').map(Number);
                  setStatus({ ...status, backupHour: h ?? 3, backupMinute: m ?? 0 });
                }
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-brand-400"
            />
          }
        />

        {status?.backupDir && (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-400">ローカル保存先</p>
            <p className="mt-0.5 break-all font-mono text-xs text-gray-600">{status.backupDir}</p>
          </div>
        )}

        <div className="mt-3">
          <p className="mb-1 text-xs text-gray-500">Google Drive バックアップ先</p>
          {drivePath ? (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="break-all font-mono text-xs text-blue-700">{drivePath}</p>
                <p className="mt-0.5 text-xs text-blue-400">バックアップ時に自動コピーされます</p>
              </div>
              <button
                onClick={() => { window.electronAPI?.setDriveBackupPath?.(null); setDrivePath(null); }}
                className="shrink-0 text-xs text-gray-400 hover:text-red-400"
              >削除</button>
            </div>
          ) : (
            <button
              onClick={async () => {
                const selected = await window.electronAPI?.selectDriveFolder?.();
                if (selected) setDrivePath(selected);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-500"
            >
              <span>＋</span><span>Google Driveのフォルダを選択</span>
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">前回のバックアップ</p>
            <p className="text-xs font-medium text-gray-600">{lastBackupText}</p>
          </div>
          <button
            onClick={() => { setRunning(true); window.electronAPI?.triggerBackup?.(); }}
            disabled={running}
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-100 disabled:opacity-50"
          >
            {running ? '実行中...' : '今すぐバックアップ'}
          </button>
        </div>

        {toast && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {toast.msg}
          </div>
        )}
        <p className="mt-3 text-xs text-gray-400">最新30件を自動保持。古いものは自動削除されます。</p>
      </Card>
    </div>
  );
}

// ── アプリ操作（Electron のみ） ────────────────────────────────────────
function AppSection() {
  const [autoLaunch, setAutoLaunchState] = useState<boolean | null>(null);
  useEffect(() => {
    window.electronAPI?.getAutoLaunch?.().then((v) => setAutoLaunchState(v ?? false));
  }, []);

  return (
    <div className="max-w-md">
      <SectionHeader title="アプリ操作" description="デスクトップアプリの動作設定" />
      <Card title="起動・再起動">
        <Row
          label="PC起動時に自動起動"
          description="Windowsログイン時にトレイへ常駐"
          right={
            <Toggle
              enabled={autoLaunch ?? false}
              disabled={autoLaunch === null}
              onChange={(v) => { window.electronAPI?.setAutoLaunch?.(v); setAutoLaunchState(v); }}
            />
          }
        />
        <Row
          label="アプリを再起動"
          description="設定を反映させたいときに使用"
          right={
            <button
              onClick={() => window.electronAPI?.relaunch?.()}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              再起動
            </button>
          }
        />
      </Card>
    </div>
  );
}

// ── アカウント ───────────────────────────────────────────────────────
function AccountSection() {
  const { user, signOut } = useAuthStore();
  return (
    <div className="max-w-md">
      <SectionHeader title="アカウント" description="ログイン情報の管理" />
      <Card title="ログイン中のアカウント">
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
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            onClick={() => signOut()}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-500 hover:bg-red-50"
          >
            ログアウト
          </button>
        </div>
      </Card>
    </div>
  );
}

// ── バージョン情報（Web + Electron 共通・自動チェック付き） ────────────
const GITHUB_VERSION_URL =
  'https://raw.githubusercontent.com/fffuttta-design/study-tracker-next/master/electron/build-info.json';

type VersionInfo = { version: string; buildNumber: number };
type CheckStatus = 'idle' | 'checking' | 'latest' | 'available' | 'error';

function VersionSection({ isElectron }: { isElectron: boolean }) {
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle');
  const [latest, setLatest] = useState<VersionInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Electron ではシェルの実際のバージョンを使う（Vercel デプロイ版と一致させる）
  const shellVersion = useElectronVersion();
  const [displayVersion, setDisplayVersion] = useState<string>(shellVersion);

  const checkVersion = useCallback(async () => {
    setCheckStatus('checking');
    setErrorMsg('');
    try {
      if (isElectron) {
        // Electron: ローカルの version.json と比較
        const result = await window.electronAPI?.checkForUpdate?.();
        if (!result) { setCheckStatus('error'); setErrorMsg('チェックできませんでした'); return; }
        // メインプロセスの build-info.json から正確な現在版数を取得（Vercelキャッシュに依存しない）
        if (result.current?.version) setDisplayVersion(`v${result.current.version}`);
        if (result.hasUpdate && result.latest) {
          setLatest(result.latest);
          setCheckStatus('available');
        } else {
          setCheckStatus('latest');
        }
      } else {
        // Web: GitHub の build-info.json と比較
        const res = await fetch(`${GITHUB_VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: VersionInfo = await res.json();
        setLatest(data);
        const isNewer = compareVersions(data.version, APP_VERSION) > 0;
        setCheckStatus(isNewer ? 'available' : 'latest');
      }
    } catch (e) {
      setCheckStatus('error');
      setErrorMsg(e instanceof Error ? e.message : '不明なエラー');
    }
  }, [isElectron]);

  // shellVersion が確定したら displayVersion を同期（チェック実行前の初期値を正確にする）
  useEffect(() => { setDisplayVersion(shellVersion); }, [shellVersion]);
  // マウント時に自動チェック
  useEffect(() => { checkVersion(); }, [checkVersion]);

  return (
    <div className="max-w-md">
      <SectionHeader title="バージョン情報" description="アプリのバージョンとアップデート確認" />
      <Card title="現在のバージョン">
        <div className="space-y-1 pb-2">
          <InfoRow label="バージョン" value={displayVersion} />
          <InfoRow label="Firebase プロジェクト" value="time-tracker-app-72eba" />
          <InfoRow label="プラットフォーム" value={isElectron ? 'Windows デスクトップ' : 'Web'} />
        </div>
      </Card>

      <Card title="アップデート確認" className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-700">最新バージョンをチェック</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {isElectron ? 'Google Drive の version.json と比較します' : 'GitHub の最新リリースと比較します'}
            </p>

            {/* ステータス表示 */}
            <div className="mt-2">
              {checkStatus === 'checking' && (
                <p className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
                  確認中...
                </p>
              )}
              {checkStatus === 'latest' && (
                <p className="text-xs text-green-600">✅ 最新版です（{displayVersion}）</p>
              )}
              {checkStatus === 'available' && latest && (
                <div className="rounded-lg bg-brand-50 px-3 py-2">
                  <p className="text-xs font-medium text-brand-700">
                    🎉 新しいバージョンがあります
                  </p>
                  <p className="mt-0.5 text-xs text-brand-600">
                    v{latest.version} (build {latest.buildNumber})
                  </p>
                  {!isElectron && (
                    <p className="mt-1 text-xs text-brand-500">
                      ページをリロードすると最新版に更新されます
                    </p>
                  )}
                </div>
              )}
              {checkStatus === 'error' && (
                <p className="text-xs text-red-500">⚠️ チェック失敗: {errorMsg || 'ネットワークを確認してください'}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            {checkStatus === 'available' && isElectron && latest && (
              <button
                onClick={() => window.electronAPI?.applyUpdate?.({
                  sourcePath:  (latest as any).sourcePath,
                  version:     latest.version,
                  buildNumber: latest.buildNumber,
                })}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                今すぐ更新
              </button>
            )}
            {checkStatus === 'available' && !isElectron && (
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                リロード
              </button>
            )}
            <button
              onClick={checkVersion}
              disabled={checkStatus === 'checking'}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              再確認
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── 共通コンポーネント ─────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-base font-semibold text-gray-800">{title}</h1>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-100 bg-white p-5 ${className}`}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, description, right }: { label: string; description?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm text-gray-700">{label}</p>
        {description && <p className="text-xs text-gray-400">{description}</p>}
      </div>
      {right}
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

function Toggle({ enabled, disabled, onChange }: { enabled: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={`relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 ${enabled ? 'bg-brand-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function ReviewStageRow({ stageLabel, stageIndex, days, onChange }: {
  stageLabel: string; stageIndex: number; days: number; onChange: (days: number) => void;
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
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600">{stageIndex}</span>
        <span className="text-sm text-gray-700">{stageLabel}</span>
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(String(days)); setEditing(false); } }}
            className="w-14 rounded border border-brand-400 px-2 py-0.5 text-right text-sm outline-none"
            type="number" min="1"
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
