import { Platform, PermissionsAndroid } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';

/**
 * 毎朝の「今日の復習」通知の受け口。
 *
 * 送り主は VPS 常駐の `study-review-notifier`
 * （`C:\dev\CompanyOps\Application\study-review-notifier`）。
 * サーバーは `users/{uid}/pushTokens/{token}` の中から `device === 'android_phone'`
 * のトークンだけに送るので、ここでその形で登録しておく。
 *
 * ⚠ サブコレクションに置くのがキモ。ユーザーの単一ドキュメントに書くと、
 *   本体側の setDoc（丸ごと上書き）で消える。
 */

/** サーバー側の宛先フィルタと一致させる。変えるなら notifier.py の DEVICE も変える */
const DEVICE = 'android_phone';

/** Android 13+ の通知許可を求める（12以下は不要＝そのまま許可扱い） */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (res !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }
    // Firebase 側の許可状態も確認（iOS 対応と、OS設定で切られていた場合の検出）
    const status = await messaging().requestPermission();
    return (
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch (e) {
    console.warn('[push] 通知許可の取得に失敗:', e);
    return false;
  }
}

/**
 * この端末のトークンを Firestore に登録する。
 * トークンは端末ごとに変わりうるので、起動のたびに呼んで上書きしておく。
 * 解除関数（トークン更新の購読解除）を返す。
 */
export async function registerPushToken(uid: string): Promise<() => void> {
  const save = async (token: string) => {
    try {
      await firestore()
        .doc(`users/${uid}/pushTokens/${token}`)
        .set(
          {
            token,
            device: DEVICE,
            platform: Platform.OS,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
    } catch (e) {
      console.warn('[push] トークン保存に失敗:', e);
    }
  };

  try {
    const token = await messaging().getToken();
    if (token) await save(token);
  } catch (e) {
    console.warn('[push] トークン取得に失敗:', e);
  }

  // 端末がトークンを振り直したら追従する（古いトークンは送信失敗時にサーバーが掃除する）
  return messaging().onTokenRefresh(save);
}

/**
 * 通知をタップしてアプリが開かれたときに呼ばれる。
 * `data.route === 'review'` なら学習リストの「復習」タブを開く。
 *
 * - アプリが裏で生きていた場合 → onNotificationOpenedApp
 * - アプリが死んでいた場合     → getInitialNotification（起動時に1回だけ取れる）
 */
export function setupNotificationTap(open: (route: string) => void): () => void {
  messaging()
    .getInitialNotification()
    .then(msg => {
      const route = msg?.data?.route;
      if (typeof route === 'string') open(route);
    })
    .catch(() => {});

  return messaging().onNotificationOpenedApp(msg => {
    const route = msg?.data?.route;
    if (typeof route === 'string') open(route);
  });
}
