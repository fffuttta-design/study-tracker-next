/**
 * updateService.ts
 * バージョン確認: GitHub raw（CDNキャッシュバスター付き）
 * APK ダウンロード: GitHub Releases 直リンク（認証不要）
 * 現在バージョン取得: react-native-device-info（マニフェスト読み取り）
 *
 * ※ たくはるファイナンスの update_checker.dart と同じ方式
 */

import { Alert, Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import RNFS from 'react-native-fs';
import DeviceInfo from 'react-native-device-info';

// 「後で」を押したビルド番号を保存し、同一バージョンでは自動アラートを再表示しない
const PREFS_PATH = `${RNFS.DocumentDirectoryPath}/update_prefs.json`;

// フォールバック定数（build-and-sync.mjs が自動更新する。react-native-device-info 失敗時のみ使用）
export const FALLBACK_BUILD_NUMBER = 265;
export const FALLBACK_VERSION      = '1.0.245';

async function getDismissedBuild(): Promise<number> {
  try {
    const content = await RNFS.readFile(PREFS_PATH, 'utf8');
    return JSON.parse(content).dismissedBuild ?? 0;
  } catch {
    return 0;
  }
}

async function saveDismissedBuild(buildNumber: number): Promise<void> {
  try {
    await RNFS.writeFile(PREFS_PATH, JSON.stringify({ dismissedBuild: buildNumber }), 'utf8');
  } catch {}
}

// GitHub raw URL（たくはる式・キャッシュバスター付き）
const GITHUB_VERSION_URL =
  'https://raw.githubusercontent.com/fffuttta-design/study-tracker-next/master/apps/mobile/version.json';

/** マニフェストから現在インストール済みのバージョンを取得 */
async function getCurrentBuildInfo(): Promise<{ version: string; buildNumber: number }> {
  try {
    const version = DeviceInfo.getVersion();           // versionName（例: "1.0.197"）
    const buildStr = DeviceInfo.getBuildNumber();      // versionCode を文字列で（例: "217"）
    const buildNumber = parseInt(buildStr, 10);
    if (!isNaN(buildNumber) && buildNumber > 1) {
      return { version, buildNumber };
    }
  } catch {}
  // フォールバック（manifest が未更新 = 旧APKの初回起動）
  return { version: FALLBACK_VERSION, buildNumber: FALLBACK_BUILD_NUMBER };
}

async function fetchVersionJson(): Promise<
  { ok: true; data: { version: string; buildNumber: number; builtAt: string; downloadUrl: string } } |
  { ok: false; status: number; error?: string }
> {
  try {
    // キャッシュバスターで GitHub CDN のキャッシュを回避
    const url = `${GITHUB_VERSION_URL}?t=${Date.now()}`;
    const res = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message };
  }
}

async function downloadApk(
  downloadUrl: string,
  onProgress?: (pct: number) => void,
): Promise<string | null> {
  const cacheDir = RNBlobUtil.fs.dirs.CacheDir;

  try {
    const files = await RNBlobUtil.fs.ls(cacheDir);
    await Promise.all(
      files
        .filter((f: string) => f.startsWith('study-tracker'))
        .map((f: string) => RNBlobUtil.fs.unlink(`${cacheDir}/${f}`).catch(() => {}))
    );
  } catch {}

  const destPath = `${cacheDir}/study-tracker-${Date.now()}.apk`;

  try {
    await RNBlobUtil.config({ path: destPath })
      .fetch('GET', downloadUrl, {
        'Accept': 'application/octet-stream',
        'User-Agent': 'StudyTracker-Android/1.0',
      })
      .progress({ count: 100 }, (received, total) => {
        if (total > 0) {
          onProgress?.(Math.round((Number(received) / Number(total)) * 100));
        }
      });

    const stat = await RNBlobUtil.fs.stat(destPath);
    if (stat.size < 1024 * 1024) {
      console.warn('[update] downloaded file too small, likely not an APK:', stat.size);
      await RNBlobUtil.fs.unlink(destPath).catch(() => {});
      return null;
    }

    return destPath;
  } catch (e) {
    console.warn('[update] downloadApk error:', e);
    return null;
  }
}

async function installApk(apkPath: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await RNBlobUtil.android.actionViewIntent(
    apkPath,
    'application/vnd.android.package-archive',
  );
}

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
  const current = await getCurrentBuildInfo();

  if (remote.buildNumber <= current.buildNumber) {
    if (manual) Alert.alert('✅ 最新版です', `v${current.version} (build ${current.buildNumber})\nすでに最新バージョンです`);
    return;
  }

  if (!remote.downloadUrl) {
    if (manual) Alert.alert('エラー', 'ダウンロードURLが取得できませんでした');
    return;
  }

  if (!manual) {
    const dismissed = await getDismissedBuild();
    if (dismissed >= remote.buildNumber) return;
  }

  const doDownload = async (onProgress?: (pct: number) => void) => {
    const apkPath = await downloadApk(remote.downloadUrl, onProgress);
    if (!apkPath) {
      Alert.alert('エラー', 'ダウンロードに失敗しました。');
      return;
    }
    await installApk(apkPath);
  };

  Alert.alert(
    'アップデートがあります 🎉',
    `現在: v${current.version}\n最新: v${remote.version}\n\n${manual ? '今すぐ更新しますか？' : '設定画面からアップデートできます'}`,
    [
      {
        text: '後で',
        style: 'cancel',
        onPress: manual ? undefined : () => { saveDismissedBuild(remote.buildNumber); },
      },
      {
        text: manual ? '今すぐ更新' : '設定画面へ',
        onPress: () => onConfirmed?.(doDownload),
      },
    ],
  );
}

export async function downloadAndInstall(onProgress?: (pct: number) => void): Promise<void> {
  const result = await fetchVersionJson();
  if (!result.ok || !result.data.downloadUrl) {
    Alert.alert('エラー', 'ダウンロードURLが取得できませんでした');
    return;
  }
  const apkPath = await downloadApk(result.data.downloadUrl, onProgress);
  if (!apkPath) {
    Alert.alert('エラー', 'ダウンロードに失敗しました。');
    return;
  }
  await installApk(apkPath);
}

/** 現在インストール済みバージョンを返す（設定画面表示用） */
export async function getCurrentVersion(): Promise<{ version: string; buildNumber: number }> {
  return getCurrentBuildInfo();
}
