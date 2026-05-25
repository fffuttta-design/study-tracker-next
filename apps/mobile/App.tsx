import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import auth from '@react-native-firebase/auth';
import AppNavigator from './src/navigation';
import { useAuthStore } from './src/store/authStore';
import { checkForUpdate } from './src/services/updateService';
import { navigationRef } from './src/navigation';

function AuthListener() {
  const { setUser } = useAuthStore();

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(user => {
      setUser(user);
      if (user) {
        setTimeout(() => {
          checkForUpdate(false, () => {
            navigationRef.current?.navigate('Main', { screen: 'Settings' });
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
