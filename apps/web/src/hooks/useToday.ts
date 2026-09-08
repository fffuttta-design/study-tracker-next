'use client';

import { useEffect, useState } from 'react';
import { localDateKey } from '@study-tracker/core';

/**
 * 今日の日付。日をまたいだら勝手に切り替わる。
 *
 * 🔥 これが無いと、窓を開きっぱなしにした翌日も「昨日」を表示したまま止まる。
 *    2026-09-08、前日から開いていた窓が 9月7日 のまま残っていて、
 *    その日の学習リストが2つ並んでいるように見えた（本人指摘）。
 *    このアプリはトレイ常駐で何日も開きっぱなしになるので、
 *    起動時に1回 new Date() するだけでは足りない。
 */
export function useToday(): Date {
  const [today, setToday] = useState<Date>(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const now = new Date();
      // 同じ日なら参照を変えない（無駄な再描画をしない）
      setToday((prev) => (localDateKey(prev) === localDateKey(now) ? prev : now));

      // 次の 0:00（+1秒の余裕）に起こす
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      if (timer) clearTimeout(timer);
      timer = setTimeout(sync, next.getTime() - now.getTime());
    };

    sync();

    // PCのスリープ復帰や、裏に回っていた間の取りこぼしを拾う
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return today;
}
