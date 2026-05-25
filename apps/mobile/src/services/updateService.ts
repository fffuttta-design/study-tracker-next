/**
 * updateService.ts
 * Google Drive から version.json を取得してアプリの自動更新を行う
 *
 * Drive フォルダ構成:
 *   StudyTracker/android/
 *     ├── version.json  { version, buildNumber, builtAt }
 *     └── study-tracker.apk
 *
 * 設定方法:
 *   1. Drive の android フォルダを開く
 *   2. version.json と study-tracker.apk それぞれの「共有」→「リンクをコピー」
 *   3. URL の /d/ 以降 /view まで の文字列が FILE_ID
 *      例: https://drive.google.com/file/d/XXXXXXXX/view
 *                                             ^^^^^^^^ ← これ
 *   4. 下の DRIVE_VERSION_JSON_ID と DRIVE_APK_ID に設定
 */

import { Alert, Platform, Linking } from 'react-native';
import RNFS from 'react-native-fs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// ── Drive ファイル ID ─────────────────────────────────────────
export const DRIVE_VERSION_JSON_ID = '1wp26QdeMtaQgTd-EemgyDDFTa_-t0ezP';
export const DRIVE_APK_ID          = '14x0svZmqUzGy8r9FztUUGylIz72CxKdM';

// ── 現在のビルド番号（ビルド時に自動更新）─────────────────────
export const CURRENT_BUILD_NUMBER = 21;
export const CURRENT_VERSION      = '1.0.1';

// ─────────────────────────────────────────────────────────────

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

async function getAccessToken(): Promise<string | null> {
  try {
    // getTokens() はトークンを自動リフレッシュする
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (e) {
    console.warn('[update] getAccessToken failed:', e);
    return null;
  }
}

async function fetchVersionJson(accessToken: string): Promise<
  { ok: true; data: { version: string; buildNumber: number; builtAt: string } } |
  { ok: false; status: number }
> {
  try {
    const res = await fetch(
      `${DRIVE_API_BASE}/${DRIVE_VERSION_JSON_ID}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      console.warn(`[update] version.json fetch failed: HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, data: await res.json() };
  } catch (e) {
    console.warn('[update] fetchVersionJson error:', e);
    return { ok: false, status: 0 };
  }
}

async function downloadApk(
  accessToken: string,
  onProgress?: (pct: number) => void,
): Promise<string | null> {
  if (!DRIVE_APK_ID) return null;

  const destPath = `${RNFS.CachesDirectoryPath}/updates/study-tracker.apk`;
  await RNFS.mkdir(`${RNFS.CachesDirectoryPath}/updates`).catch(() => {});

  try {
    const { promise } = RNFS.downloadFile({
      fromUrl: `${DRIVE_API_BASE}/${DRIVE_APK_ID}?alt=media`,
      toFile: destPath,
      headers: { Authorization: `Bearer ${accessToken}` },
      progress: onProgress
        ? (res) => onProgress(Math.round((res.bytesWritten / res.contentLength) * 100))
        : undefined,
    });
    const result = await promise;
    console.log('[update] download statusCode:', result.statusCode);
    if (result.statusCode === 200) return destPath;
    return null;
  } catch (e) {
    console.warn('[update] downloadApk error:', e);
    return null;
  }
}

function installApk(): void {
  if (Platform.OS !== 'android') return;
  // FileProvider content URI → Android インストール Intent
  const contentUri = 'content://com.studytracker.fileprovider/apk_cache/study-tracker.apk';
  Linking.openURL(contentUri).catch(e => {
    console.warn('[update] installApk failed:', e);
    Alert.alert('インストールエラー', `APKを開けませんでした: ${e.message}`);
  });
}

/**
 * 手動ダウンロード＆インストール（設定画面から呼ぶ）
 * onProgress: 0-100 のダウンロード進捗コールバック
 */
export async function downloadAndInstall(
  onProgress?: (pct: number) => void,
): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    Alert.alert('エラー', 'Googleログインが必要です');
    return;
  }
  const apkPath = await downloadApk(accessToken, onProgress);
  if (!apkPath) {
    Alert.alert('エラー', 'ダウンロードに失敗しました。\nログアウトして再ログインすると解決する場合があります。');
    return;
  }
  installApk();
}

/**
 * アップデート確認メイン関数
 * @param manual true の場合、最新版でも「最新です」と表示する
 */
export async function checkForUpdate(manual = false): Promise<void> {
  if (!DRIVE_VERSION_JSON_ID || !DRIVE_APK_ID) return;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    if (manual) Alert.alert('エラー', 'Googleログインが必要です');
    return;
  }

  const result = await fetchVersionJson(accessToken);
  if (!result.ok) {
    if (manual) {
      const msg = result.status === 403
        ? 'Driveへのアクセス権限がありません。\n一度ログアウトして再ログインしてください。'
        : result.status === 401
        ? 'トークンが無効です。再ログインしてください。'
        : `バージョン情報を取得できませんでした (HTTP ${result.status || 'network error'})`;
      Alert.alert('エラー', msg);
    }
    return;
  }

  const remote = result.data;

  if (remote.buildNumber <= CURRENT_BUILD_NUMBER) {
    if (manual) Alert.alert('✅ 最新版です', `v${CURRENT_VERSION} (build ${CURRENT_BUILD_NUMBER})\nすでに最新バージョンです`);
    return;
  }

  console.log(`[update] 新バージョン検知: build ${CURRENT_BUILD_NUMBER} → ${remote.buildNumber}`);

  Alert.alert(
    'アップデートがあります 🎉',
    `現在: v${CURRENT_VERSION} (build ${CURRENT_BUILD_NUMBER})\n最新: v${remote.version} (build ${remote.buildNumber})\n\n今すぐ更新しますか？`,
    [
      { text: '後で', style: 'cancel' },
      {
        text: '今すぐ更新',
        onPress: async () => {
          Alert.alert('ダウンロード中...', 'しばらくお待ちください');
          const apkPath = await downloadApk(accessToken);
          if (!apkPath) {
            Alert.alert('エラー', 'ダウンロードに失敗しました。\nログアウトして再ログインすると解決する場合があります。');
            return;
          }
          installApk();
        },
      },
    ],
  );
}
