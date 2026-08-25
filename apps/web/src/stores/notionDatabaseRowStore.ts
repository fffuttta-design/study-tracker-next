import { create } from 'zustand';
import { type DbRow, createDbRow } from '@study-tracker/core';
import { subscribeWhere, upsertDoc, deleteDocById } from '@study-tracker/firebase';

const COL = 'notionDatabaseRows';

// 🔥 DBを開くたびに購読を張り直すと、そのDBの行を毎回サーバーから読み直す。
//    行が3千件あるDBでは「1回開く＝3千読取」＝無料枠(5万/日)の約6%。
//    2026-08-21には1時間で約45,000読取（＝丸読み13回ぶん）まで膨らみ、枠が切れて
//    アプリが夕方まで開けなくなった。
// ∴ databaseId ごとにリスナーは1本だけ持ち、画面を離れてもすぐには切らず
//    _KEEP_ALIVE_MS のあいだ生かしておく（行き来しても読み直さない）。
//    リスナーを生かしておくこと自体に読取は発生しない（変わった行だけが届く）。
const _KEEP_ALIVE_MS = 30 * 60 * 1000;

interface Entry {
  unsub?: () => void;
  refs: number;
  rows: DbRow[];
  timer?: ReturnType<typeof setTimeout>;
}
const _listeners = new Map<string, Entry>();

// いま画面に出しているDB。複数のDB（ページ内インラインDB等）を同時に購読しても
// `rows` が取り合いにならないよう、最後に開いたDBの行だけを `rows` に出す。
let _activeId: string | null = null;

interface DbRowState {
  rows: DbRow[];
  rowsByDb: Record<string, DbRow[]>;
  subscribeRows: (uid: string, databaseId: string) => () => void;
  addRow: (uid: string, databaseId: string) => Promise<DbRow>;
  updateRow: (uid: string, id: string, cells: DbRow['cells']) => Promise<void>;
  updateRowContent: (uid: string, id: string, pageContent: string) => Promise<void>;
  importRow: (uid: string, row: DbRow) => Promise<void>;
  removeRow: (uid: string, id: string) => Promise<void>;
}

export const useDbRowStore = create<DbRowState>((set, get) => ({
  rows: [],
  rowsByDb: {},

  subscribeRows: (uid, databaseId) => {
    const key = `${uid}/${databaseId}`;
    let entry = _listeners.get(key);

    if (entry) {
      // 生きているリスナーを使い回す（＝サーバーを読まない）。
      if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
      entry.refs += 1;
    } else {
      const created: Entry = { refs: 1, rows: [] };
      _listeners.set(key, created);
      entry = created;
      created.unsub = subscribeWhere<DbRow>(uid, COL, 'databaseId', databaseId, (rows) => {
        const sorted = rows.slice().sort((a, b) => a.order - b.order);
        created.rows = sorted;
        set((s) => ({
          rowsByDb: { ...s.rowsByDb, [databaseId]: sorted },
          rows: _activeId === databaseId ? sorted : s.rows,
        }));
      });
    }

    _activeId = databaseId;
    // 使い回したときは既に持っている行をその場で出す（開き直しで一瞬空にならない）。
    const known = entry.rows;
    set((s) => ({ rows: known, rowsByDb: { ...s.rowsByDb, [databaseId]: known } }));

    let released = false;
    return () => {
      if (released) return;      // 同じ解除を2回呼ばれても数を狂わせない
      released = true;
      const cur = _listeners.get(key);
      if (!cur) return;
      cur.refs -= 1;
      if (cur.refs > 0) return;
      cur.timer = setTimeout(() => {
        if (cur.refs > 0) return;   // 猶予のあいだに開き直されていたら切らない
        cur.unsub?.();
        _listeners.delete(key);
      }, _KEEP_ALIVE_MS);
    };
  },

  addRow: async (uid, databaseId) => {
    const order = get().rows.length;
    const row = createDbRow(databaseId, order);
    await upsertDoc(uid, COL, row.id, row as unknown as Record<string, unknown>);
    return row;
  },

  updateRow: async (uid, id, cells) => {
    await upsertDoc(uid, COL, id, { cells, updatedAt: new Date().toISOString() });
  },

  updateRowContent: async (uid, id, pageContent) => {
    await upsertDoc(uid, COL, id, { pageContent, updatedAt: new Date().toISOString() });
  },

  importRow: async (uid, row) => {
    await upsertDoc(uid, COL, row.id, row as unknown as Record<string, unknown>);
  },

  removeRow: async (uid, id) => {
    await deleteDocById(uid, COL, id);
  },
}));
