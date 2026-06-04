import { v4 as uuidv4 } from 'uuid';

export type DbPropertyType = 'title' | 'text' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'url';

export interface DbSelectOption {
  id: string;
  name: string;
  color: string;
}

export interface DbProperty {
  id: string;
  name: string;
  type: DbPropertyType;
  options?: DbSelectOption[];
  width?: number;
}

export type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface DbSchema {
  properties: DbProperty[];
  aggregations?: Record<string, AggregationType>;
}

export interface DbRow {
  id: string;
  databaseId: string;
  cells: Record<string, string | number | boolean | null>;
  pageContent?: string; // 行のページ本文（TipTap JSON）
  order: number;
  createdAt: string;
  updatedAt: string;
}

export function createDbSchema(): DbSchema {
  return { properties: [{ id: 'title', name: '名前', type: 'title' }] };
}

export function parseDbSchema(content: string): DbSchema {
  try {
    const p = JSON.parse(content) as DbSchema;
    if (p.properties?.length) return p;
  } catch {}
  return createDbSchema();
}

export function createDbRow(databaseId: string, order: number): DbRow {
  return {
    id: uuidv4(),
    databaseId,
    cells: {},
    order,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
