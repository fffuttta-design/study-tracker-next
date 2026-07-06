'use client';

// Chrome拡張「StudyTracker クリッパー」の保存先ページ。
// 拡張から ?title=...&content=...&url=... 付きで小さなポップアップで開かれ、
// 既にログイン済みのWebセッションを使って「特急メモ」(learningItems) に1件記録する。
// 認証は AuthProvider（ルート）で初期化済みなので、このページ単体で user を読める。

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useLearningStore } from '@/stores/learningStore';
import { localDateKey } from '@study-tracker/core';
import { RegisterCelebration } from '@/components/RegisterCelebration';

// Electron（特急メモ ポップアップ）から中身を差し替えるための橋渡し。
// 拡張機能（通常ブラウザ）では electronAPI が無いので undefined になるだけ。
type ClipElectronAPI = {
  onClipReset?: (cb: () => void) => void;
  onClipFill?: (cb: (data: { title?: string; content?: string }) => void) => void;
  readClipboard?: () => Promise<string>;
};
function getClipAPI(): ClipElectronAPI | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { electronAPI?: ClipElectronAPI }).electronAPI;
}

function ClipInner() {
  const params = useSearchParams();
  const { user, loading, signIn } = useAuthStore();
  const add = useLearningStore((s) => s.add);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // URLパラメータから初期値を流し込む（初回のみ）
  // 本文には「選択テキスト＋元ページのリンク（該当箇所リンク）」を入れて、保存内容に必ず残す。
  useEffect(() => {
    const sel = (params.get('content') ?? params.get('text') ?? '').trim();
    const u = params.get('url') ?? '';
    setTitle(params.get('title')?.slice(0, 300) ?? '');
    setContent([sel, u].filter(Boolean).join('\n\n'));
    setSourceUrl(u);
  // params は初回で確定。以後ユーザー編集を優先するので依存に入れない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Electron ポップアップは窓を使い回すため、開くたびに main から
  // 「リセット」「選択テキストの流し込み」を IPC で受け取る。
  useEffect(() => {
    const api = getClipAPI();
    if (!api?.onClipReset || !api?.onClipFill) return;
    api.onClipReset(() => {
      setTitle('');
      setContent('');
      setSourceUrl('');
      setSaving(false);
      setSaved(false);
    });
    api.onClipFill((data) => {
      setTitle((data.title ?? '').slice(0, 300));
      setContent(data.content ?? '');
      setSaved(false);
      setSaving(false);
    });
  }, []);

  // 背面で選択して Ctrl+C した文字を、現在のクリップボードから本文に取り込む。
  const handlePasteFromClipboard = async () => {
    const api = getClipAPI();
    if (!api?.readClipboard) return;
    const text = (await api.readClipboard()).trim();
    if (!text) return;
    setContent((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text));
    if (!title.trim()) {
      const firstLine = text.split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? '';
      if (firstLine) setTitle(firstLine.slice(0, 300));
    }
  };
  const isElectron = !!getClipAPI()?.readClipboard;

  const handleSave = async () => {
    if (!user || saving) return;
    // タイトル未入力なら本文1行目をタイトルに流用（ホットキーで本文だけ書いた時用）
    const firstLine = content.split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? '';
    const t = (title.trim() || firstLine || sourceUrl || 'クリップ').slice(0, 300);
    setSaving(true);
    try {
      await add(user.uid, {
        dateKey: localDateKey(),
        title: t,
        content: content.trim(),
        url: sourceUrl || undefined,
        sortOrder: Date.now(),
      });
      setSaved(true);
      // お祝いアニメ（アプリ内と同じ RegisterCelebration）を見せてから自動で閉じる
      setTimeout(() => { window.close(); }, 1800);
    } catch {
      setSaving(false);
    }
  };

  // 保存完了：アプリ内と同じお祝いアニメ（🎉＋紙吹雪＋ポップ）
  if (saved) {
    return (
      <div className="min-h-screen bg-white">
        <RegisterCelebration message="登録しました！" sub="特急メモに追加しました" />
      </div>
    );
  }

  // 認証チェック中
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // 未ログイン → その場でGoogleログイン
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center">
        <div className="text-4xl">⚡</div>
        <p className="text-sm font-semibold text-gray-700">StudyTracker にログインすると記録できます</p>
        <button
          onClick={() => signIn()}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Google でログイン
        </button>
        <p className="max-w-xs text-[11px] text-gray-400">ログイン後、このまま記録画面になります</p>
      </div>
    );
  }

  // 記録フォーム
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ヘッダー全体をドラッグ領域にして枠なし窓を移動できるようにする（Electron のみ有効／ブラウザでは無視） */}
      <div
        className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">⚡ StudyTracker に記録</span>
        <button
          onClick={() => window.close()}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="閉じる"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >✕</button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-gray-400">タイトル</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-400"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="flex items-center justify-between text-[11px] font-semibold text-gray-400">
            <span>内容（選択テキスト＋元ページのリンク）</span>
            {isElectron && (
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-500 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
                title="背面で選択して Ctrl+C したテキストを取り込みます"
              >📋 コピーした文字を取り込む</button>
            )}
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="メモ・選択したテキスト"
            className="min-h-[140px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-800 outline-none focus:border-brand-400"
          />
        </label>

        {sourceUrl && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-gray-400">元ページ</span>
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-blue-500 underline">{sourceUrl}</a>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? '保存中…' : '⚡ 特急で保存'}
        </button>
      </div>
    </div>
  );
}

export default function ClipPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>}>
      <ClipInner />
    </Suspense>
  );
}
