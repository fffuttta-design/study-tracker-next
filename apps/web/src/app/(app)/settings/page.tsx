'use client';

import { useState } from 'react';
import { APP_VERSION } from '@/lib/version';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore, REVIEW_STAGE_LABELS } from '@/stores/settingsStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { useDbRowStore } from '@/stores/notionDatabaseRowStore';

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const { reviewStageDays, setReviewStageDays, resetReviewStageDays } = useSettingsStore();
  const { add: addPage } = useNotionPageStore();

  return (
    <div className="px-6 py-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-800">設定</h1>

      <div className="max-w-md space-y-4">
        {/* Notionインポート */}
        <NotionImportSection uid={user?.uid ?? ''} addPage={addPage} />

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

// ── Notionインポートセクション ────────────────────────────────────────

interface ImportPage {
  notionId: string;
  title: string;
  icon: string;
  parentNotionId: string | null;
  content: string;
  type?: 'page' | 'database';
  rows?: Array<{
    notionId: string;
    cells: Record<string, string | number | boolean | null>;
    pageContent: string;
    order: number;
  }>;
}

function NotionImportSection({ uid, addPage }: {
  uid: string;
  addPage: (uid: string, params?: { parentId?: string; order?: number; type?: 'page' | 'database' }) => Promise<{ id: string; title: string; content: string; icon: string; isFavorite: boolean; order: number; updatedAt: string }>;
}) {
  const { update, batchUpdate } = useNotionPageStore();
  const { importRow } = useDbRowStore();
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<'idle' | 'importing' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');

  const doImport = async () => {
    if (!uid || !url.trim()) return;
    setError('');
    setStep('importing');
    setProgress({ done: 0, total: 0 });

    try {
      const res = await fetch('/api/notion-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import-url', url: url.trim() }),
      });
      if (!res.ok || !res.body) {
        setError(`サーバーエラー（${res.status}）`);
        setStep('idle');
        return;
      }

      // ストリームを1行ずつ読み取りながらリアルタイム処理
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const idMap = new Map<string, string>();
      const allPages: ImportPage[] = []; // リンク置換フェーズ用

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; data?: ImportPage; message?: string; total?: number };
          try { event = JSON.parse(line); } catch { continue; }

          if (event.type === 'error') {
            setError(event.message ?? 'エラーが発生しました');
            setStep('idle');
            return;
          }

          if (event.type === 'page' && event.data) {
            const p = event.data;
            allPages.push(p);
            setProgress((prev) => ({ done: prev.done, total: prev.total + 1 }));

            // 受け取り次第すぐFirestoreに保存
            const parentId = p.parentNotionId ? idMap.get(p.parentNotionId) : undefined;
            const created = await addPage(uid, {
              ...(parentId ? { parentId } : {}),
              ...(p.type === 'database' ? { type: 'database' } : {}),
            });
            await update(uid, created.id, { title: p.title, icon: p.icon, content: p.content });
            idMap.set(p.notionId, created.id);

            if (p.type === 'database' && p.rows) {
              for (const row of p.rows) {
                await importRow(uid, {
                  id: uuidv4(),
                  databaseId: created.id,
                  cells: row.cells,
                  pageContent: row.pageContent,
                  order: row.order,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              }
            }

            setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
          }
        }
      }

      // リンクのプレースホルダー置換（全ページ収集後）
      // 先にすべての置換を計算（同期処理）し、一括バッチ書き込み
      const replacements: Array<{ id: string; content: string }> = [];
      for (const p of allPages) {
        const internalId = idMap.get(p.notionId);
        if (!internalId) continue;
        let content = p.content;
        let changed = false;
        for (const [notionId, pageId] of idMap.entries()) {
          const pagePlaceholder = `notion-child://${notionId}`;
          if (content.includes(pagePlaceholder)) {
            content = content.replaceAll(pagePlaceholder, `/notion-plus/${pageId}`);
            changed = true;
          }
          const dbPlaceholder = `notion-child-db://${notionId}`;
          if (content.includes(dbPlaceholder)) {
            content = content.replaceAll(dbPlaceholder, pageId);
            changed = true;
          }
        }
        if (changed) replacements.push({ id: internalId, content });
      }
      // 500件チャンク分割バッチ書き込み（1回のコミットで完結）
      if (replacements.length > 0) {
        await batchUpdate(uid, replacements);
      }

      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`インポート中にエラーが発生しました: ${msg}`);
      setStep('idle');
    }
  };

  const reset = () => { setStep('idle'); setUrl(''); setError(''); };

  return (
    <Section title="Notionインポート">
      {step === 'idle' && (
        <>
          <p className="mb-3 text-xs text-gray-400">
            取り込みたいNotionページのURLを貼り付けてください。<br />
            そのページ以下の子ページもすべて階層を維持したまま取り込まれます。
          </p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doImport()}
            placeholder="https://www.notion.so/..."
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          <button
            onClick={doImport}
            disabled={!url.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40"
          >
            インポート
          </button>
        </>
      )}

      {step === 'importing' && (
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-700">
            {progress.total === 0
              ? 'ページを取得中...'
              : `インポート中... ${progress.done} / ${progress.total} ページ`}
          </p>
          {progress.total > 0 && (
            <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-gray-400">
            ページを受け取り次第順番に保存しています
          </p>
        </div>
      )}

      {step === 'done' && (
        <div className="py-4 text-center">
          <p className="mb-2 text-2xl">✅</p>
          <p className="text-sm text-gray-700">
            {progress.total} ページをインポートしました
          </p>
          <button onClick={reset} className="mt-3 text-xs text-brand-500 hover:underline">
            別のページをインポート
          </button>
        </div>
      )}
    </Section>
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
