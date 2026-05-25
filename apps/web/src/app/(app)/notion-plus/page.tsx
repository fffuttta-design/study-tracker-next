'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { ensureWorkspace } = useNotionPageStore();
  const router = useRouter();

  // loading を待たない（ensureWorkspace は getState() で直接チェックするため不要）
  useEffect(() => {
    if (!user) return;
    ensureWorkspace(user.uid)
      .catch(() => {})
      .finally(() => {
        router.replace(`/notion-plus/${WORKSPACE_ID}`);
      });
  }, [user, ensureWorkspace, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}
