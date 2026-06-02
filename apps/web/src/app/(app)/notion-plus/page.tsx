'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';
import { useSettingsStore } from '@/stores/settingsStore';

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { pages, loading, add } = useNotionPageStore();
  const router = useRouter();
  const lastViewedPageId = useSettingsStore((s) => s.lastViewedNotionPageId);

  const rootPages = pages
    .filter((p) => !p.parentId && p.id !== WORKSPACE_ID)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  useEffect(() => {
    if (loading) return;

    // 前回表示していたページへ遷移
    if (lastViewedPageId && pages.find((p) => p.id === lastViewedPageId)) {
      router.replace(`/notion-plus/${lastViewedPageId}`);
      return;
    }

    // フォールバック: 最初のルートページへ遷移
    if (rootPages.length > 0) {
      router.replace(`/notion-plus/${rootPages[0].id}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lastViewedPageId, rootPages.length]);

  // ページが1件もない場合の空状態
  if (!loading && rootPages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">まだページがありません</p>
        <button
          onClick={async () => {
            if (!user) return;
            const page = await add(user.uid);
            router.push(`/notion-plus/${page.id}`);
          }}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          ＋ 最初のページを作成
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}
