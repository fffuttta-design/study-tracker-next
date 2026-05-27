'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, ensureWorkspace } = useNotionPageStore();
  const router = useRouter();
  const didEnsureRef = useRef(false);
  const didNavigateRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (didNavigateRef.current) return;

    // ワークスペースが pages に入ったら即座に遷移（リアクティブ）
    const ws = pages.find((p) => p.id === WORKSPACE_ID);
    if (ws) {
      didNavigateRef.current = true;
      // router.replace が Electron 環境で失敗することがあるため window.location も併用
      try {
        router.replace(`/notion-plus/${WORKSPACE_ID}`);
      } catch {
        // fallback
      }
      // Electron では window.location による遷移が確実
      if (typeof window !== 'undefined' && window.electronAPI) {
        window.location.href = `/notion-plus/${WORKSPACE_ID}`;
      }
      return;
    }

    // Firestore データ読み込み完了待ち
    if (loading) return;

    // データ読込済みでワークスペースがない → 一度だけ作成してFirestore更新を待つ
    if (!didEnsureRef.current) {
      didEnsureRef.current = true;
      ensureWorkspace(user.uid).catch(() => {});
      // 作成後は Firestore の onSnapshot が pages を更新 → 上の ws チェックで遷移する
    }
  }, [pages, loading, user, router, ensureWorkspace]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}
