import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  query,
  where,
  type Firestore,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseApp } from './config';

// 永続ローカルキャッシュ（IndexedDB）を有効化した Firestore を一度だけ生成して使い回す。
// これにより、アプリ再起動・再読込のたびに全ドキュメントをサーバーから読み直すのをやめ、
// 2回目以降はキャッシュから即返し＋変更分だけ同期する＝Firestore 読み取り回数を大幅に削減する
// （無料枠の読み取り上限に到達しにくくする）。デスクトップは別ウィンドウを複数開くため
// persistentMultipleTabManager で複数タブ間のキャッシュ競合を防ぐ。
let _db: Firestore | null = null;

export function getDb(): Firestore {
  if (_db) return _db;
  const app = getFirebaseApp();
  try {
    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // 既に初期化済み／IndexedDB 不可（プライベートモード等）のときは従来どおりにフォールバック。
    _db = getFirestore(app);
  }
  return _db;
}

// 旧Flutter版と同じパス: users/{uid}/...
export const userCol = (uid: string) =>
  collection(getDb(), 'users', uid, 'data');

export const subCol = (uid: string, name: string) =>
  collection(getDb(), 'users', uid, name);

export async function fetchAll<T>(
  uid: string,
  colName: string
): Promise<T[]> {
  const snap = await getDocs(subCol(uid, colName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export function subscribeCol<T>(
  uid: string,
  colName: string,
  onData: (items: T[]) => void
) {
  return onSnapshot(subCol(uid, colName), (snap: QuerySnapshot<DocumentData>) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
  });
}

function stripUndefined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

export async function upsertDoc(
  uid: string,
  colName: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await setDoc(doc(getDb(), 'users', uid, colName, id), stripUndefined(data), { merge: true });
}

export async function deleteDocById(
  uid: string,
  colName: string,
  id: string
): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, colName, id));
}

// ── 単一ドキュメント（Firestoreの課金は「読んだ件数」なので、ここが読み取り削減の要） ──
// コレクション全体を購読すると件数ぶんの読み取りが発生する。一覧に必要な情報を1件に
// まとめておけば、何ページあっても読み取りは1回で済む。

/** 1件だけ取得する。無ければ null。 */
export async function fetchDoc<T>(
  uid: string,
  colName: string,
  id: string,
): Promise<T | null> {
  const snap = await getDoc(doc(getDb(), 'users', uid, colName, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
}

/** 1件だけ購読する。存在しないときは null を返す。 */
export function subscribeDoc<T>(
  uid: string,
  colName: string,
  id: string,
  onData: (item: T | null) => void,
) {
  return onSnapshot(doc(getDb(), 'users', uid, colName, id), (snap) => {
    onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null);
  });
}

/**
 * 1件の中に持っているマップ（例 `items` の中のページID）から、指定のキーだけを消す。
 * ⚠ マップ全体を書き直すと、別の端末が同時に足したページを消してしまう。
 *   キー単位で消すことで、他の端末の変更を巻き込まない。
 */
export async function deleteMapKeys(
  uid: string,
  colName: string,
  id: string,
  mapField: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const ref = doc(getDb(), 'users', uid, colName, id);
  const patch: Record<string, unknown> = {};
  for (const k of keys) patch[k] = deleteField();
  await setDoc(ref, { [mapField]: patch }, { merge: true });
}

export async function fetchWhere<T>(
  uid: string,
  colName: string,
  field: string,
  value: unknown,
): Promise<T[]> {
  const q = query(subCol(uid, colName), where(field, '==', value));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export function subscribeWhere<T>(
  uid: string,
  colName: string,
  field: string,
  value: unknown,
  onData: (items: T[]) => void
): () => void {
  const q = query(subCol(uid, colName), where(field, '==', value));
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
  });
}

// 複数ドキュメントを一括削除（500件チャンク）
export async function batchDelete(
  uid: string,
  colName: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 500) {
    chunks.push(ids.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(db, 'users', uid, colName, id));
    }
    await batch.commit();
  }
}

// 500件チャンク分割バッチ（旧Flutter版と同じ制約）
export async function batchUpsert(
  uid: string,
  colName: string,
  items: Array<{ id: string } & Record<string, unknown>>
): Promise<void> {
  const db = getDb();
  const chunks = [];
  for (let i = 0; i < items.length; i += 500) {
    chunks.push(items.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, 'users', uid, colName, item.id);
      batch.set(ref, item, { merge: true });
    }
    await batch.commit();
  }
}
