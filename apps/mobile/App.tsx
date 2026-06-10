import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import auth from '@react-native-firebase/auth';
import AppNavigator from './src/navigation';
import { useAuthStore } from './src/store/authStore';
import { checkForUpdate } from './src/services/updateService';
import { navigationRef } from './src/navigation';

/**
 * Firebase Auth リスナー
 *
 * Android コールドスタートでは Native モジュールの初期化が完了する前に
 * auth() が呼ばれるとクラッシュする場合がある。
 * 1000ms 待機 + 最大4回リトライ（700ms 間隔）で初期化完了を待つ。
 */
function AuthListener() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let unsubscribeFn: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const tryInit = (attempt = 0) => {
      try {
        unsubscribeFn = auth().onAuthStateChanged(user => {
          setUser(user);
          if (user) {
            setTimeout(() => {
              checkForUpdate(false, () => {
                navigationRef.current?.navigate('Main', { screen: 'Settings' });
              });
            }, 2000);
          }
        });
      } catch (e) {
        console.warn(`[AuthListener] Firebase auth init error (attempt ${attempt + 1}/4):`, e);
        if (attempt < 3) {
          retryTimer = setTimeout(() => tryInit(attempt + 1), 700);
        } else {
          // 4回失敗したらローディングを解除してログイン画面へ
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(() => tryInit(), 1000);

    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimer);
      unsubscribeFn?.();
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
