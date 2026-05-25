/**
 * updateService.ts
 * バージョン確認: GitHub raw（認証不要・即時反映）
 * APK ダウンロード: Google Drive API（OAuth トークン使用）
 */

import { Alert, Platform, Linking } from 'react-native';
import RNFS from 'react-native-fs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// ── version.json: GitHub API（CDN なし・常に最新）───────────────
const GITHUB_VERSION_URL =
  'https://api.github.com/repos/fffuttta-design/study-tracker-next/contents/apps/mobile/version.json';

// ── APK: Drive ファイル ID ────────────────────────────────────────
export const DRIVE_APK_ID = '14x0svZmqUzGy8r9FztUUGylIz72CxKdM';

// ── 現在のビルド番号（ビルド時に自動更新）─────────────────────────
export const CURRENT_BUILD_NUMBER = 37;
export const CURRENT_VERSION      = '1.0.17';

// ─────────────────────────────────────────────────────────────────

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

async function getAccessToken(): Promise<string | null> {
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (e) {
    console.warn('[update] getAccessToken failed:', e);
    return null;
  }
}

async function fetchVersionJson(): Promise<
  { ok: true; data: { version: string; buildNumber: number; builtAt: string } } |
  { ok: false; status: number; error?: string }
> {
  try {
    const res = await fetch(GITHUB_VERSION_URL, {
      headers: { 'Accept': 'application/vnd.github.raw+json' },
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const raw = await res.text();
    const data = typeof raw === 'object' ? raw : JSON.parse(raw);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message };
  }
}

async function downloadApk(
  accessToken: string,
  onProgress?: (pct: number) => void,
): Promise<string | null> {
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
    if (result.statusCode === 200) return destPath;
    return null;
  } catch (e) {
    console.warn('[update] downloadApk error:', e);
    return null;
  }
}

function installApk(): void {
  if (Platform.OS !== 'android') return;
  const contentUri = 'content://com.studytracker.fileprovider/apk_cache/study-tracker.apk';
  Linking.openURL(contentUri).catch(e => {
    Alert.alert('インストールエラー', `APKを開けませんでした: ${e.message}`);
  });
}

/**
 * アップデート確認。更新ありでユーザーが「今すぐ更新」を押したら
 * onConfirmed(progress callback) を呼ぶ。進捗表示は呼び出し元に委譲。
 */
export async function checkForUpdate(
  manual = false,
  onConfirmed?: (onProgress: (pct: number) => void) => void,
): Promise<void> {
  const result = await fetchVersionJson();

  if (!result.ok) {
    if (manual) {
      const msg = result.status === 0
        ? 'ネットワークエラーです。\n通信状況を確認してください。'
        : `バージョン情報を取得できませんでした (HTTP ${result.status})`;
      Alert.alert('エラー', msg);
    }
    return;
  }

  const remote = result.data;

  if (remote.buildNumber <= CURRENT_BUILD_NUMBER) {
    if (manual) Alert.alert('✅ 最新版です', `v${CURRENT_VERSION} (build ${CURRENT_BUILD_NUMBER})\nすでに最新バージョンです`);
    return;
  }

  Alert.alert(
    'アップデートがあります 🎉',
    `現在: v${CURRENT_VERSION} (build ${CURRENT_BUILD_NUMBER})\n最新: v${remote.version} (build ${remote.buildNumber})\n\n今すぐ更新しますか？`,
    [
      { text: '後で', style: 'cancel' },
      {
        text: '今すぐ更新',
        onPress: () => {
          if (onConfirmed) {
            // 呼び出し元（Settings画面）が進捗表示しながらダウンロード
            onConfirmed(async (onProgress) => {
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
            });
          }
        },
      },
    ],
  );
}

export async function downloadAndInstall(onProgress?: (pct: number) => void): Promise<void> {
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
