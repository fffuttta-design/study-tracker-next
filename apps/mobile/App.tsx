import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import auth from '@react-native-firebase/auth';
import AppNavigator from './src/navigation';
import { useAuthStore } from './src/store/authStore';
import { useLearningStore } from './src/store/learningStore';
import { useNotionStore } from './src/store/notionStore';
import { checkForUpdate } from './src/services/updateService';
import { navigationRef } from './src/navigation';

/**
 * Firebase Auth リスナー
 *
 * Android コールドスタートでは Native モジュールの初期化が完了する前に
 * auth() が呼ばれるとクラッシュする場合がある。
 * 500ms 待機 + 最大4回リトライ（700ms 間隔）で初期化完了を待つ。
 *
 * 速度最適化: onAuthStateChanged でユーザー確定直後に Firestore 購読を開始し、
 * ナビゲーション変更・HomeScreen マウントを待たずにデータ取得を先行させる。
 */
function AuthListener() {
  const { setUser, setLoading } = useAuthStore();
  const subscribeItems      = useLearningStore(s => s.subscribeItems);
  const subscribeCategories = useLearningStore(s => s.subscribeCategories);
  const subscribePages      = useNotionStore(s => s.subscribePages);

  useEffect(() => {
    let unsubscribeFn: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let firestoreUnsubs: (() => void)[] = [];

    const tryInit = (attempt = 0) => {
      try {
        unsubscribeFn = auth().onAuthStateChanged(user => {
          // 前回のFirestoreリスナーをクリア（サインアウト→再ログイン対応）
          firestoreUnsubs.forEach(u => u());
          firestoreUnsubs = [];

          if (user) {
            // Firestoreをナビゲーション変更より先に購読開始して先行取得
            firestoreUnsubs = [
              subscribeItems(user.uid),
              subscribeCategories(user.uid),
              subscribePages(user.uid),
            ];
            setTimeout(() => {
              checkForUpdate(false, () => {
                navigationRef.current?.navigate('Main', { screen: 'Settings' });
              });
            }, 2000);
          }
          setUser(user);
        });
      } catch (e) {
        console.warn(`[AuthListener] Firebase auth init error (attempt ${attempt + 1}/4):`, e);
        if (attempt < 3) {
          retryTimer = setTimeout(() => tryInit(attempt + 1), 700);
        } else {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(() => tryInit(), 500);

    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimer);
      unsubscribeFn?.();
      firestoreUnsubs.forEach(u => u());
    };
  }, []);

  return null;
}


export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
        <AuthListener />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
