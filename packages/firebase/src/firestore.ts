import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
  getDocsFromCache,
  getCountFromServer,
  orderBy,
  limit,
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

// 🔥 全件バックアップ用。素の fetchAll は毎回サーバーから全件読む＝行3,340件のコレクションでは
// 1回で無料枠(5万/日)の約7%が飛ぶ。毎晩3時のバックアップがこれをやっていた。
// ∴ まず永続ローカルキャッシュ（IndexedDB）から読み、「サーバーと同じ中身か」を2読取だけで
//    確かめてから使う。確認は2点：
//   ① 件数（getCountFromServer=1読取）… 追加・削除を検知する
//   ② いちばん新しい updatedAt（orderBy+limit(1)=1読取）… どこかの1件が書き換わったのを検知する
// どちらかがズレていたら諦めてサーバーから全件読む（＝バックアップの中身は必ず最新になる）。
export async function fetchAllVerified<T>(
  uid: string,
  colName: string,
  updatedField = 'updatedAt'
): Promise<T[]> {
  const col = subCol(uid, colName);
  const toItems = (snap: QuerySnapshot<DocumentData>) =>
    snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  try {
    const cached = await getDocsFromCache(col);
    if (!cached.empty) {
      const serverCount = (await getCountFromServer(col)).data().count;
      if (serverCount === cached.size) {
        const newest = await getDocs(query(col, orderBy(updatedField, 'desc'), limit(1)));
        const serverNewest = newest.docs[0]?.get(updatedField) ?? null;
        let cacheNewest: unknown = null;
        cached.docs.forEach((d) => {
          const v = d.get(updatedField);
          if (v != null && (cacheNewest == null || v > cacheNewest)) cacheNewest = v;
        });
        if (serverNewest != null && serverNewest === cacheNewest) return toItems(cached);
      }
    }
  } catch {
    // キャッシュ不可（プライベートモード等）や索引が無いときは黙ってサーバー読みへ落とす。
  }
  return toItems(await getDocs(col));
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
