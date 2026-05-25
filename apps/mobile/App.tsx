import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import auth from '@react-native-firebase/auth';
import AppNavigator from './src/navigation';
import { useAuthStore } from './src/store/authStore';
import { checkForUpdate, downloadAndInstall } from './src/services/updateService';

function AuthListener() {
  const { setUser } = useAuthStore();

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(user => {
      setUser(user);
      if (user) {
        setTimeout(() => {
          checkForUpdate(false, async (onProgress) => {
            await downloadAndInstall(onProgress);
          });
        }, 2000);
      }
    });
    return unsubscribe;
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
