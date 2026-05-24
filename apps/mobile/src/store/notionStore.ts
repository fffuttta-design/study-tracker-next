import { create } from 'zustand';
import firestore from '@react-native-firebase/firestore';
import { COLLECTIONS } from '../firebase/config';
import { NotionPage } from '../types';

interface NotionState {
  pages: NotionPage[];
  loading: boolean;
  subscribePages: (uid: string) => () => void;
  addPage: (uid: string, title: string, parentId?: string) => Promise<string>;
  updatePage: (uid: string, pageId: string, data: Partial<NotionPage>) => Promise<void>;
  deletePage: (uid: string, pageId: string) => Promise<void>;
}

export const useNotionStore = create<NotionState>(set => ({
  pages: [],
  loading: false,

  subscribePages: (uid: string) => {
    set({ loading: true });
    const unsub = firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .orderBy('sortOrder')
      .onSnapshot(snap => {
        const pages: NotionPage[] = snap.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<NotionPage, 'id'>),
        }));
        set({ pages, loading: false });
      });
    return unsub;
  },

  addPage: async (uid, title, parentId) => {
    const snap = await firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .orderBy('sortOrder', 'desc')
      .limit(1)
      .get();
    const maxOrder = snap.empty ? 0 : (snap.docs[0].data().sortOrder ?? 0);
    const ref = await firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .add({
        title,
        content: '',
        parentId: parentId ?? null,
        sortOrder: maxOrder + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    return ref.id;
  },

  updatePage: async (uid, pageId, data) => {
    await firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .doc(pageId)
      .update({ ...data, updatedAt: new Date().toISOString() });
  },

  deletePage: async (uid, pageId) => {
    await firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .doc(pageId)
      .delete();
  },
}));
