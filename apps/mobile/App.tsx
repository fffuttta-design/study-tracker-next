import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import AppNavigator from './src/navigation';
import { useAuthStore } from './src/store/authStore';
import { checkForUpdate } from './src/services/updateService';

function AuthListener() {
  const { setUser } = useAuthStore();

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(user => {
      setUser(user);
      // ログイン済みの場合、起動後2秒で更新チェック
      if (user) {
        setTimeout(() => checkForUpdate(), 2000);
      }
    });
    return unsubscribe;
  }, []);

  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <AuthListener />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
