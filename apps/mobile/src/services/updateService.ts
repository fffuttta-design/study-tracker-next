/**
 * updateService.ts
 * バージョン確認: GitHub (認証不要・確実)
 * APK ダウンロード: Google Drive API (OAuth トークン使用)
 */

import { Alert, Platform, Linking } from 'react-native';
import RNFS from 'react-native-fs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// ── Drive ファイル ID ─────────────────────────────────────────────
export const DRIVE_VERSION_JSON_ID = '1wp26QdeMtaQgTd-EemgyDDFTa_-t0ezP';
export const DRIVE_APK_ID          = '14x0svZmqUzGy8r9FztUUGylIz72CxKdM';

// ── 現在のビルド番号（ビルド時に自動更新）─────────────────────────
export const CURRENT_BUILD_NUMBER = 28;
export const CURRENT_VERSION      = '1.0.8';

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

async function fetchVersionJson(accessToken: string): Promise<
  { ok: true; data: { version: string; buildNumber: number; builtAt: string } } |
  { ok: false; status: number; error?: string }
> {
  try {
    const res = await fetch(
      `${DRIVE_API_BASE}/${DRIVE_VERSION_JSON_ID}?alt=media&_t=${Date.now()}`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Cache-Control': 'no-cache' } },
    );
    if (!res.ok) {
      console.warn(`[update] version.json fetch failed: HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }
    // レスポンスを dynamic で受けて手動パース（型ミスマッチ対策）
    const raw = await res.text();
    const data = typeof raw === 'object' ? raw : JSON.parse(raw);
    return { ok: true, data };
  } catch (e: any) {
    console.warn('[update] fetchVersionJson error:', e);
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
  const contentUri = 'content://com.studytracker.fileprovider/apk_cache/study-tracker.apk';
  Linking.openURL(contentUri).catch(e => {
    console.warn('[update] installApk failed:', e);
    Alert.alert('インストールエラー', `APKを開けませんでした: ${e.message}`);
  });
}

/**
 * アップデート確認メイン関数
 * @param manual true の場合、最新版でも「最新です」と表示する
 */
export async function checkForUpdate(manual = false): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    if (manual) Alert.alert('エラー', 'Googleログインが必要です');
    return;
  }

  const result = await fetchVersionJson(accessToken);

  if (!result.ok) {
    if (manual) {
      const msg = result.status === 403 || result.status === 401
        ? 'Drive へのアクセス権限がありません。\n一度ログアウトして再ログインしてください。'
        : result.status === 0
        ? `ネットワークエラーです。\n(${result.error ?? 'unknown'})`
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

  console.log(`[update] 新バージョン検知: build ${CURRENT_BUILD_NUMBER} → ${remote.buildNumber}`);

  Alert.alert(
    'アップデートがあります 🎉',
    `現在: v${CURRENT_VERSION} (build ${CURRENT_BUILD_NUMBER})\n最新: v${remote.version} (build ${remote.buildNumber})\n\n今すぐ更新しますか？`,
    [
      { text: '後で', style: 'cancel' },
      {
        text: '今すぐ更新',
        onPress: async () => {
          const accessToken = await getAccessToken();
          if (!accessToken) {
            Alert.alert('エラー', 'Googleログインが必要です');
            return;
          }
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
