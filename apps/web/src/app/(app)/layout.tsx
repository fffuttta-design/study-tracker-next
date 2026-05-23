'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useLearningStore } from '@/stores/learningStore';
import { useNotionPageStore } from '@/stores/notionPageStore';
import { useImprovementTaskStore } from '@/stores/improvementTaskStore';
import { useGoalStore } from '@/stores/goalStore';
import { Sidebar } from '@/components/layout/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const router = useRouter();
  const subscribeCategories = useCategoryStore((s) => s.subscribe);
  const subscribeItems = useLearningStore((s) => s.subscribe);
  const subscribePages = useNotionPageStore((s) => s.subscribe);
  const subscribeTasks = useImprovementTaskStore((s) => s.subscribe);
  const subscribeGoals = useGoalStore((s) => s.subscribe);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeCategories(user.uid);
    const unsub2 = subscribeItems(user.uid);
    const unsub3 = subscribePages(user.uid);
    const unsub4 = subscribeTasks(user.uid);
    const unsub5 = subscribeGoals(user.uid);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, [user, subscribeCategories, subscribeItems, subscribePages, subscribeTasks, subscribeGoals]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
