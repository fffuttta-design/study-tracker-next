'use client';

import { useAuthStore } from '@/stores/authStore';

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();

  return (
    <div className="px-6 py-6">
      <h1 className="mb-6 text-lg font-semibold text-gray-800">設定</h1>

      <div className="max-w-md space-y-4">
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
          <InfoRow label="バージョン" value="0.0.1" />
          <InfoRow label="Firebase プロジェクト" value="time-tracker-app-72eba" />
        </Section>
      </div>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm text-gray-400">{value}</span>
    </div>
  );
}
