import React, { createRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createRef<NavigationContainerRef<any>>();
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import HomeScreen from '../screens/Home/HomeScreen';
import LearningScreen from '../screens/Learning/LearningScreen';
import AddLearningScreen from '../screens/Learning/AddLearningScreen';
import NotionPlusScreen from '../screens/NotionPlus/NotionPlusScreen';
import NotionPageScreen from '../screens/NotionPlus/NotionPageScreen';

import SettingsScreen from '../screens/Settings/SettingsScreen';
import LoginScreen from '../screens/Settings/LoginScreen';
import { useAuthStore } from '../store/authStore';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    Home: '🏠',
    Learning: '📚',

    NotionPlus: '📝',
    Settings: '⚙️',
  };
  return <Text style={{ fontSize: 20, color }}>{icons[name] ?? '•'}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color }) => (
          <TabIcon name={route.name} color={color} />
        ),
        tabBarActiveTintColor: '#F59E0B',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e5e7eb' },
        tabBarLabelStyle: { fontSize: 11 },
      })}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'ホーム' }} />
      <Tab.Screen name="Learning" component={LearningScreen} options={{ title: '学習リスト' }} />

      <Tab.Screen name="NotionPlus" component={NotionPlusScreen} options={{ title: 'NotionPlus' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '設定' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuthStore();

  if (loading) return null;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="AddLearning"
              component={AddLearningScreen}
              options={{ headerShown: true, title: '学習アイテムを追加', headerStyle: { backgroundColor: '#f9fafb' }, headerTintColor: '#111827' }}
            />
            <Stack.Screen
              name="NotionPage"
              component={NotionPageScreen}
              options={{ headerShown: true, title: 'ページ', headerStyle: { backgroundColor: '#f9fafb' }, headerTintColor: '#111827' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
