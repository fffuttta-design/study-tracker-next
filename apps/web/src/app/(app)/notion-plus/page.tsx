'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore, WORKSPACE_ID } from '@/stores/notionPageStore';

export default function NotionPlusPage() {
  const { user } = useAuthStore();
  const { loading, ensureWorkspace } = useNotionPageStore();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    ensureWorkspace(user.uid).then(() => {
      router.replace(`/notion-plus/${WORKSPACE_ID}`);
    });
  }, [loading, user, ensureWorkspace, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}
