'use client';

import { useMemo } from 'react';

// 登録時の祝賀演出（🎉＋紙吹雪＋ポップアニメ）。学習リストへの記録登録で使う。
// ライブラリ不要・インラインkeyframesで完結。message/sub は文言の差し替え用。

const CONFETTI_COLORS = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6', '#ef4444', '#eab308'];

export function RegisterCelebration({
  message = '登録しました！',
  sub = '学習リストに追加されました',
}: {
  message?: string;
  sub?: string;
}) {
  // 紙吹雪の粒（マウント時に1回だけ生成）
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        duration: 1.1 + Math.random() * 0.9,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 7 + Math.random() * 9,
        round: i % 2 === 0,
      })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes ccd-confetti-fall {
          0%   { transform: translateY(-30px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(105vh) rotate(900deg); opacity: 0; }
        }
        @keyframes ccd-celebrate-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          55%  { transform: scale(1.12); opacity: 1; }
          75%  { transform: scale(0.96); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* 紙吹雪 */}
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animation: `ccd-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}

      {/* 中央メッセージ */}
      <div
        className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-brand-500 via-pink-500 to-purple-500 px-16 py-12 text-white shadow-2xl ring-4 ring-white/30"
        style={{ animation: 'ccd-celebrate-pop 0.45s ease-out' }}
      >
        <span className="animate-bounce text-7xl drop-shadow-lg">🎉</span>
        <p className="text-3xl font-extrabold tracking-tight drop-shadow">{message}</p>
        <p className="text-sm opacity-80">{sub}</p>
      </div>
    </div>
  );
}
