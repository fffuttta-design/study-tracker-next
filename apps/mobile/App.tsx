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
 * auth() が呼ばれるとクラッシュする場合がある（EditorPreloader と同じ問題）。
 * 500ms の遅延を入れることで初期化競合を回避する。
 */
function AuthListener() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let unsubscribeFn: (() => void) | undefined;

    // ネイティブモジュールの初期化を待ってから Firebase Auth を開始
    const timer = setTimeout(() => {
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
        // 初期化エラー時はローディングを解除してログイン画面へ
        console.warn('[AuthListener] Firebase auth init error:', e);
        setLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
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
