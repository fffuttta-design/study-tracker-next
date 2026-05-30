import firebaseApp from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// React Native Firebase は google-services.json から自動設定されるため
// 追加の initializeApp 呼び出しは不要

export { firebaseApp, auth, firestore };

// ─── Firestore コレクション名（Web と共通）─────────────────
export const COLLECTIONS = {
  users: 'users',
  learningItems: (uid: string) => `users/${uid}/learningItems`,
  categories: (uid: string) => `users/${uid}/learningCategories`,
  notionPages: (uid: string) => `users/${uid}/notionPages`,
  dailyMemos: (uid: string) => `users/${uid}/dailyMemos`,
} as const;
