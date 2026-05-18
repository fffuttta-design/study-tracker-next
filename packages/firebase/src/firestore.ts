import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
  type Firestore,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseApp } from './config';

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
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
