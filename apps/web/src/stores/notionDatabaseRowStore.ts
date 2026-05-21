import { create } from 'zustand';
import { type DbRow, createDbRow } from '@study-tracker/core';
import { subscribeWhere, upsertDoc, deleteDocById } from '@study-tracker/firebase';

const COL = 'notionDatabaseRows';

interface DbRowState {
  rows: DbRow[];
  subscribeRows: (uid: string, databaseId: string) => () => void;
  addRow: (uid: string, databaseId: string) => Promise<DbRow>;
  updateRow: (uid: string, id: string, cells: DbRow['cells']) => Promise<void>;
  updateRowContent: (uid: string, id: string, pageContent: string) => Promise<void>;
  importRow: (uid: string, row: DbRow) => Promise<void>;
  removeRow: (uid: string, id: string) => Promise<void>;
}

export const useDbRowStore = create<DbRowState>((set, get) => ({
  rows: [],

  subscribeRows: (uid, databaseId) => {
    return subscribeWhere<DbRow>(uid, COL, 'databaseId', databaseId, (rows) => {
      set({ rows: rows.sort((a, b) => a.order - b.order) });
    });
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
