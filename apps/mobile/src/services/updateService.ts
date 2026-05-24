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

import { Alert, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { NativeModules, Linking } from 'react-native';

// ── Drive ファイル ID ─────────────────────────────────────────
// TODO: Drive で共有して取得した ID を設定してください
export const DRIVE_VERSION_JSON_ID = '';
export const DRIVE_APK_ID          = '';

// ── 現在のビルド番号（ビルド時に自動更新）─────────────────────
export const CURRENT_BUILD_NUMBER = 1;
export const CURRENT_VERSION      = '1.0.0';

// ─────────────────────────────────────────────────────────────

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

async function getAccessToken(): Promise<string | null> {
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch {
    return null;
  }
}

async function fetchVersionJson(accessToken: string): Promise<{ version: string; buildNumber: number; builtAt: string } | null> {
  if (!DRIVE_VERSION_JSON_ID) return null;
  try {
    const res = await fetch(
      `${DRIVE_API_BASE}/${DRIVE_VERSION_JSON_ID}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function downloadApk(accessToken: string): Promise<string | null> {
  if (!DRIVE_APK_ID) return null;

  const destPath = `${RNFS.CachesDirectoryPath}/updates/study-tracker.apk`;

  // キャッシュディレクトリ作成
  await RNFS.mkdir(`${RNFS.CachesDirectoryPath}/updates`).catch(() => {});

  try {
    const { promise } = RNFS.downloadFile({
      fromUrl: `${DRIVE_API_BASE}/${DRIVE_APK_ID}?alt=media`,
      toFile: destPath,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = await promise;
    if (result.statusCode === 200) return destPath;
    return null;
  } catch {
    return null;
  }
}

async function installApk(apkPath: string): Promise<void> {
  // Android の IntentSender 経由でインストール
  // react-native-fs の getReadableUri を利用
  if (Platform.OS !== 'android') return;

  try {
    const { RNFSManager } = NativeModules;

    // FileProvider URI を使ってインストール Intent を発行
    // package名は AndroidManifest の applicationId と一致させる
    const contentUri = await RNFS.readFile(apkPath, 'base64'); // 型チェック回避用に一旦読む
    // Intent: ACTION_VIEW で APK を開く（FileProvider 経由）
    await Linking.openURL(`content://com.studytracker.fileprovider/apk_cache/study-tracker.apk`);
  } catch (e) {
    console.warn('[update] APK install failed:', e);
  }
}

/**
 * 起動時に呼ぶメイン関数
 */
export async function checkForUpdate(): Promise<void> {
  // Drive ID が未設定なら何もしない
  if (!DRIVE_VERSION_JSON_ID || !DRIVE_APK_ID) return;

  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const remote = await fetchVersionJson(accessToken);
  if (!remote) return;

  if (remote.buildNumber <= CURRENT_BUILD_NUMBER) return;

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
            Alert.alert('エラー', 'ダウンロードに失敗しました');
            return;
          }
          await installApk(apkPath);
        },
      },
    ],
  );
}
