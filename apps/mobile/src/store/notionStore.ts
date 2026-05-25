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
  reorderPages: (uid: string, orderedIds: string[]) => Promise<void>;
}

export const useNotionStore = create<NotionState>(set => ({
  pages: [],
  loading: false,

  subscribePages: (uid: string) => {
    set({ loading: true });
    const unsub = firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .orderBy('order')   // Webと共通フィールド名
      .onSnapshot(snap => {
        const pages: NotionPage[] = snap.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<NotionPage, 'id'>),
        }));
        set({ pages, loading: false });
      }, err => {
        // orderBy に必要なインデックスがない場合はフォールバック
        console.warn('[notion] orderBy failed, fallback:', err.message);
        firestore()
          .collection(COLLECTIONS.notionPages(uid))
          .onSnapshot(snap => {
            const pages: NotionPage[] = snap.docs
              .map(d => ({ id: d.id, ...(d.data() as Omit<NotionPage, 'id'>) }))
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            set({ pages, loading: false });
          });
      });
    return unsub;
  },

  addPage: async (uid, title, parentId) => {
    const snap = await firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .orderBy('order', 'desc')
      .limit(1)
      .get();
    const maxOrder = snap.empty ? 0 : (snap.docs[0].data().order ?? 0);
    const ref = await firestore()
      .collection(COLLECTIONS.notionPages(uid))
      .add({
        title,
        content: '',
        icon: '📄',
        parentId: parentId ?? null,
        order: maxOrder + 1,
        updatedAt: new Date().toISOString(),
        isFavorite: false,
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

  reorderPages: async (uid, orderedIds) => {
    const batch = firestore().batch();
    orderedIds.forEach((id, index) => {
      const ref = firestore().collection(COLLECTIONS.notionPages(uid)).doc(id);
      batch.update(ref, { order: index });
    });
    await batch.commit();
  },
}));
