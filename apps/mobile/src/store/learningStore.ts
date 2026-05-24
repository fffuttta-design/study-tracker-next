import { create } from 'zustand';
import firestore from '@react-native-firebase/firestore';
import { COLLECTIONS } from '../firebase/config';
import {
  LearningItem,
  LearningCategory,
  localDateKey,
  createReviews,
} from '../types';

interface LearningState {
  items: LearningItem[];
  categories: LearningCategory[];
  loading: boolean;
  error: string | null;
  // actions
  subscribeItems: (uid: string) => () => void;
  subscribeCategories: (uid: string) => () => void;
  addItem: (uid: string, item: Omit<LearningItem, 'id' | 'reviews' | 'sortOrder' | 'createdAt'>) => Promise<void>;
  completeReview: (uid: string, itemId: string, stageIndex: number) => Promise<void>;
  deleteItem: (uid: string, itemId: string) => Promise<void>;
}

export const useLearningStore = create<LearningState>(set => ({
  items: [],
  categories: [],
  loading: false,
  error: null,

  subscribeItems: (uid: string) => {
    set({ loading: true });
    const unsub = firestore()
      .collection(COLLECTIONS.learningItems(uid))
      .orderBy('dateKey', 'desc')
      .onSnapshot(
        snap => {
          const items: LearningItem[] = snap.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<LearningItem, 'id'>),
          }));
          set({ items, loading: false });
        },
        err => set({ error: err.message, loading: false }),
      );
    return unsub;
  },

  subscribeCategories: (uid: string) => {
    const unsub = firestore()
      .collection(COLLECTIONS.categories(uid))
      .orderBy('sortOrder')
      .onSnapshot(snap => {
        const categories: LearningCategory[] = snap.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<LearningCategory, 'id'>),
        }));
        set({ categories });
      });
    return unsub;
  },

  addItem: async (uid, itemData) => {
    const dateKey = itemData.dateKey || localDateKey();
    const reviews = createReviews(dateKey);
    const snap = await firestore()
      .collection(COLLECTIONS.learningItems(uid))
      .orderBy('sortOrder', 'desc')
      .limit(1)
      .get();
    const maxOrder = snap.empty ? 0 : (snap.docs[0].data().sortOrder ?? 0);
    await firestore()
      .collection(COLLECTIONS.learningItems(uid))
      .add({
        ...itemData,
        dateKey,
        reviews,
        sortOrder: maxOrder + 1,
        createdAt: new Date().toISOString(),
      });
  },

  completeReview: async (uid, itemId, stageIndex) => {
    const ref = firestore()
      .collection(COLLECTIONS.learningItems(uid))
      .doc(itemId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const item = snap.data() as Omit<LearningItem, 'id'>;
    const reviews = item.reviews.map(r =>
      r.stageIndex === stageIndex ? { ...r, completed: true } : r,
    );
    await ref.update({ reviews });
  },

  deleteItem: async (uid, itemId) => {
    await firestore()
      .collection(COLLECTIONS.learningItems(uid))
      .doc(itemId)
      .delete();
  },
}));
