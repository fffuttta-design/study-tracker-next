'use client';

import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { useDbRowStore } from '@/stores/notionDatabaseRowStore';

export default function NotionPlusSettingsPage() {
  const { user } = useAuthStore();
  const { add: addPage } = useNotionPageStore();

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/notion-plus" className="text-sm text-gray-400 hover:text-gray-600">← NotionPlus</Link>
        <h1 className="text-lg font-semibold text-gray-800">NotionPlus 設定</h1>
      </div>

      <div className="max-w-md space-y-4">
        <NotionImportSection uid={user?.uid ?? ''} addPage={addPage} />
      </div>
    </div>
  );
}

// ── 型定義 ────────────────────────────────────────────────────────────

type LogEntry =
  | { status: 'success'; title: string; icon: string; isDb: boolean }
  | { status: 'skip'; title: string; reason: string };

interface FetchNodeResult {
  notionId: string;
  title: string;
  icon: string;
  content: string;
  childPageIds: string[];
  childDbIds: string[];
  isDatabase?: boolean;
  rows?: Array<{ notionId: string; cells: Record<string, string | number | boolean | null>; pageContent: string; order: number }>;
}

interface QueueItem { notionId: string; parentNotionId: string | null; depth: number; }

// URLからNotionページIDを抽出（クライアント側）
function extractNotionPageId(url: string): string | null {
  const cleanUrl = url.split('?')[0].split('#')[0];
  const lastSegment = cleanUrl.split('/').pop() ?? '';
  const raw = lastSegment.replace(/-/g, '').match(/([a-f0-9]{32})$/i)?.[1];
  if (!raw) return null;
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
}

const IMPORT_DELAY_MS = 300; // Notion APIレート制限対策（300ms間隔）

// ── Notionインポートセクション ────────────────────────────────────────

function NotionImportSection({ uid, addPage }: {
  uid: string;
  addPage: (uid: string, params?: { parentId?: string; order?: number; type?: 'page' | 'database'; notionId?: string }) => Promise<{ id: string; notionId?: string }>;
}) {
  const { pages, update, batchUpdate } = useNotionPageStore();
  const { importRow } = useDbRowStore();
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<'idle' | 'importing' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, skipped: 0, queueSize: 0 });
  const [error, setError] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logOpen) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length, logOpen]);

  const addLog = (entry: LogEntry) => setLog((prev) => [...prev, entry]);

  const doImport = async () => {
    if (!uid || !url.trim()) return;

    const rootNotionId = extractNotionPageId(url.trim());
    if (!rootNotionId) {
      setError('有効なNotionページURLではありません');
      return;
    }

    setError('');
    setStep('importing');
    setProgress({ done: 0, skipped: 0, queueSize: 1 });
    setLog([]);

    // 既存ページの notionId → internalId マップ（重複インポート防止）
    const existingNotionIdMap = new Map<string, string>();
    for (const page of pages) {
      if ((page as { notionId?: string }).notionId) {
        existingNotionIdMap.set((page as { notionId?: string }).notionId!, page.id);
      }
    }

    // クライアント側DFSキュー
    const queue: QueueItem[] = [{ notionId: rootNotionId, parentNotionId: null, depth: 0 }];
    const idMap = new Map<string, string>(); // notionId → internalId
    const allImported: Array<{ notionId: string; content: string }> = [];

    try {
      while (queue.length > 0) {
        const item = queue.shift()!;
        setProgress((prev) => ({ ...prev, queueSize: queue.length }));

        // 階層制限
        if (item.depth > 8) {
          addLog({ status: 'skip', title: '(depth limit)', reason: '階層が深すぎるためスキップ (depth > 8)' });
          setProgress((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
          continue;
        }

        // 1ページ分をサーバーから取得
        let res: Response;
        try {
          res = await fetch('/api/notion-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch-node', notionId: item.notionId }),
          });
        } catch (e) {
          addLog({ status: 'skip', title: item.notionId, reason: `通信エラー: ${String(e)}` });
          setProgress((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
          continue;
        }

        // レート制限時は3秒待ってリトライ
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 3000));
          queue.unshift(item);
          continue;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          addLog({ status: 'skip', title: item.notionId, reason: err.error ?? `HTTP ${res.status}` });
          setProgress((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
          continue;
        }

        const page = await res.json() as FetchNodeResult;

        // Firestoreに保存（upsert）
        const existingId = existingNotionIdMap.get(page.notionId);
        const parentId = item.parentNotionId ? idMap.get(item.parentNotionId) : undefined;
        let internalId: string;

        if (existingId) {
          internalId = existingId;
          await update(uid, internalId, {
            title: page.title, icon: page.icon, content: page.content,
            ...(parentId ? { parentId } : {}),
          });
        } else {
          const created = await addPage(uid, {
            ...(parentId ? { parentId } : {}),
            ...(page.isDatabase ? { type: 'database' } : {}),
            notionId: page.notionId,
          });
          internalId = created.id;
          await update(uid, internalId, { title: page.title, icon: page.icon, content: page.content });
        }

        idMap.set(page.notionId, internalId);
        allImported.push({ notionId: page.notionId, content: page.content });

        // DBの行データ保存
        if (page.isDatabase && page.rows) {
          for (const row of page.rows) {
            await importRow(uid, {
              id: uuidv4(), databaseId: internalId,
              cells: row.cells, pageContent: row.pageContent, order: row.order,
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
          }
        }

        addLog({ status: 'success', title: page.title || 'Untitled', icon: page.icon || '📄', isDb: !!page.isDatabase });
        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));

        // 子ページ・子DBをキュー先頭に追加（DFS順を維持）
        const childItems: QueueItem[] = [
          ...page.childPageIds.map((id) => ({ notionId: id, parentNotionId: page.notionId, depth: item.depth + 1 })),
          ...page.childDbIds.map((id) => ({ notionId: id, parentNotionId: page.notionId, depth: item.depth + 1 })),
        ];
        queue.unshift(...childItems);

        // Notion APIレート制限対策
        if (queue.length > 0) {
          await new Promise((r) => setTimeout(r, IMPORT_DELAY_MS));
        }
      }

      // リンクプレースホルダー置換（一括バッチ書き込み）
      const replacements: Array<{ id: string; content: string }> = [];
      for (const p of allImported) {
        const internalId = idMap.get(p.notionId);
        if (!internalId) continue;
        let content = p.content;
        let changed = false;
        for (const [notionId, pageId] of idMap.entries()) {
          if (content.includes(`notion-child://${notionId}`)) {
            content = content.replaceAll(`notion-child://${notionId}`, `/notion-plus/${pageId}`);
            changed = true;
          }
          if (content.includes(`notion-child-db://${notionId}`)) {
            content = content.replaceAll(`notion-child-db://${notionId}`, pageId);
            changed = true;
          }
        }
        if (changed) replacements.push({ id: internalId, content });
      }
      if (replacements.length > 0) await batchUpdate(uid, replacements);

      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`インポート中にエラーが発生しました: ${msg}`);
      setStep('idle');
    }
  };

  const reset = () => { setStep('idle'); setUrl(''); setError(''); setLog([]); };

  const successCount = log.filter((e) => e.status === 'success').length;
  const skipCount = log.filter((e) => e.status === 'skip').length;

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
        <div className="py-2">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-700">
              {progress.done === 0
                ? '最初のページを取得中...'
                : `${progress.done} ページ完了${progress.queueSize > 0 ? `（残り約 ${progress.queueSize} 件）` : ''}${progress.skipped > 0 ? ` / ${progress.skipped} スキップ` : ''}`}
            </p>
          </div>
          <ImportLog log={log} open={logOpen} onToggle={() => setLogOpen((v) => !v)} logEndRef={logEndRef} />
        </div>
      )}

      {step === 'done' && (
        <div className="py-2">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-medium text-gray-700">インポート完了</p>
              <p className="text-xs text-gray-400">
                {successCount} ページ成功
                {skipCount > 0 && <span className="ml-2 text-yellow-500">⚠️ {skipCount} スキップ</span>}
              </p>
            </div>
          </div>
          <ImportLog log={log} open={logOpen} onToggle={() => setLogOpen((v) => !v)} logEndRef={logEndRef} />
          <button onClick={reset} className="mt-3 text-xs text-brand-500 hover:underline">
            別のページをインポート
          </button>
        </div>
      )}
    </Section>
  );
}

function LogIcon({ icon }: { icon: string }) {
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className="h-4 w-4 shrink-0 rounded object-cover" style={{ aspectRatio: '1/1' }} />;
  }
  return <span className="shrink-0 leading-none">{icon}</span>;
}

function ImportLog({ log, open, onToggle, logEndRef }: {
  log: LogEntry[];
  open: boolean;
  onToggle: () => void;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (log.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-100"
      >
        <span className="font-medium">📋 詳細ログ（{log.length} 件）</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto border-t border-gray-100 px-3 py-1">
          {log.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              {entry.status === 'success' ? (
                <>
                  <span className="mt-px shrink-0 text-green-500">✅</span>
                  <span className="flex items-center gap-1 text-xs text-gray-600">
                    <LogIcon icon={entry.icon} />
                    {entry.title}
                    {entry.isDb && <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] text-blue-500">DB</span>}
                  </span>
                </>
              ) : (
                <>
                  <span className="mt-px shrink-0 text-yellow-500">⚠️</span>
                  <span className="text-xs text-gray-500">
                    {entry.title}
                    <span className="ml-1 text-gray-400">— {entry.reason}</span>
                  </span>
                </>
              )}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
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
