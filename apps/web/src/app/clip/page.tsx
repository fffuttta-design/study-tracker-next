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
  useEffect(() => {
    setTitle(params.get('title')?.slice(0, 300) ?? '');
    setContent(params.get('content') ?? params.get('text') ?? '');
    setSourceUrl(params.get('url') ?? '');
  // params は初回で確定。以後ユーザー編集を優先するので依存に入れない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!user || saving) return;
    const t = (title.trim() || sourceUrl || 'クリップ').slice(0, 300);
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
      // 少し見せてから自動で閉じる（拡張のポップアップウィンドウ）
      setTimeout(() => { window.close(); }, 1100);
    } catch {
      setSaving(false);
    }
  };

  // 保存完了
  if (saved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <div className="text-5xl">✅</div>
        <p className="text-lg font-bold text-gray-800">特急メモに記録しました</p>
        <p className="text-xs text-gray-400">この画面は自動で閉じます</p>
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
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-bold text-gray-800">⚡ StudyTracker に記録</span>
        <button onClick={() => window.close()} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="閉じる">✕</button>
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
          <span className="text-[11px] font-semibold text-gray-400">内容（選択テキスト）</span>
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
