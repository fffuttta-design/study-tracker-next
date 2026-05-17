'use client';

import { use, useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { NotionEditor } from '@/components/editor/NotionEditor';

export default function NotionPageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuthStore();
  const { pages, update } = useNotionPageStore();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const page = pages.find((p) => p.id === id);

  useEffect(() => {
    if (pages.length > 0 && !page) router.replace('/notion-plus');
  }, [page, pages.length, router]);

  const handleSave = useCallback(
    async (title: string, content: string) => {
      if (!user || !page) return;
      setSaving(true);
      try {
        await update(user.uid, page.id, { title, content });
      } finally {
        setSaving(false);
      }
    },
    [user, page, update]
  );

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 保存ステータス */}
      <div className="flex items-center justify-end border-b border-gray-100 px-6 py-2">
        <span className="text-xs text-gray-400">{saving ? '保存中...' : '自動保存'}</span>
      </div>
      <NotionEditor
        key={page.id}
        initialTitle={page.title}
        initialContent={page.content}
        onSave={handleSave}
      />
    </div>
  );
}
