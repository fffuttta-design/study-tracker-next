import React, { useEffect, useState } from 'react';
import { StatusBar, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import auth from '@react-native-firebase/auth';
import AppNavigator from './src/navigation';
import { useAuthStore } from './src/store/authStore';
import { useLearningStore } from './src/store/learningStore';
import { useNotionStore } from './src/store/notionStore';
import { checkForUpdate } from './src/services/updateService';
import { navigationRef } from './src/navigation';
import { getInitialSharedText, onSharedText } from './src/services/sharedText';
import { localDateKey } from './src/types';

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


/**
 * 共有(ACTION_SEND)・テキスト選択メニュー(PROCESS_TEXT)から飛んできたテキストを
 * 特急メモ（notionPageId 未設定・復習スケジュールなし）として保存する。
 * 先頭の非空行＝タイトル / 残り＝本文。未ログイン中は保持し、ログイン後に保存。
 */
function SharedTextCapture() {
  const user = useAuthStore(s => s.user);
  const addItem = useLearningStore(s => s.addItem);
  const [pending, setPending] = useState<string | null>(null);

  // コールドスタート分の取得 ＋ 起動中の受信を購読
  useEffect(() => {
    let mounted = true;
    getInitialSharedText().then(t => { if (mounted && t) setPending(t); });
    const off = onSharedText(t => setPending(t));
    return () => { mounted = false; off(); };
  }, []);

  // pending と user が揃ったら保存
  useEffect(() => {
    if (!pending || !user) return; // 未ログインなら保持したまま、ログイン後に再実行

    const text = pending.replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++; // 先頭の空行を飛ばす
    const title = (lines[i] ?? '').trim().slice(0, 300);
    const content = lines.slice(i + 1).join('\n').replace(/^\n+/, '').trim();
    const finalTitle = (title || content.slice(0, 300) || 'メモ').slice(0, 300);

    setPending(null); // 二重保存防止
    addItem(user.uid, { title: finalTitle, content, dateKey: localDateKey() }, true)
      .then(() => Alert.alert('⚡ 特急メモに追加しました', finalTitle))
      .catch(() => Alert.alert('保存に失敗しました', 'もう一度お試しください'));
  }, [pending, user, addItem]);

  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
        <AuthListener />
        <SharedTextCapture />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
