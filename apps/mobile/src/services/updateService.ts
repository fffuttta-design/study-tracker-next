/**
 * updateService.ts
 * バージョン確認: GitHub API（CDN なし・常に最新）
 * APK ダウンロード: GitHub Releases（認証不要・URL固定）
 */

import { Alert, Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';

const GITHUB_VERSION_URL =
  'https://api.github.com/repos/fffuttta-design/study-tracker-next/contents/apps/mobile/version.json';

export const CURRENT_BUILD_NUMBER = 71;
export const CURRENT_VERSION      = '1.0.51';

async function fetchVersionJson(): Promise<
  { ok: true; data: { version: string; buildNumber: number; builtAt: string; apkUrl: string } } |
  { ok: false; status: number; error?: string }
> {
  try {
    const res = await fetch(GITHUB_VERSION_URL, {
      headers: { 'Accept': 'application/vnd.github.raw+json' },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const raw = await res.text();
    const data = typeof raw === 'object' ? raw : JSON.parse(raw);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message };
  }
}

async function downloadApk(
  apkUrl: string,
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
      .fetch('GET', apkUrl, {
        'Accept': 'application/octet-stream',
        'User-Agent': 'StudyTracker-Android/1.0',
      })
      .progress((received, total) => {
        if (total > 0) {
          onProgress?.(Math.round((Number(received) / Number(total)) * 100));
        }
      });

    // ファイルサイズ確認（HTMLが返ってきた場合を検出）
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

  if (remote.buildNumber <= CURRENT_BUILD_NUMBER) {
    if (manual) Alert.alert('✅ 最新版です', `v${CURRENT_VERSION} (build ${CURRENT_BUILD_NUMBER})\nすでに最新バージョンです`);
    return;
  }

  if (!remote.apkUrl) {
    if (manual) Alert.alert('エラー', 'ダウンロードURLが取得できませんでした');
    return;
  }

  const doDownload = async (onProgress?: (pct: number) => void) => {
    const apkPath = await downloadApk(remote.apkUrl, onProgress);
    if (!apkPath) {
      Alert.alert('エラー', 'ダウンロードに失敗しました。');
      return;
    }
    await installApk(apkPath);
  };

  Alert.alert(
    'アップデートがあります 🎉',
    `現在: v${CURRENT_VERSION}\n最新: v${remote.version}\n\n${manual ? '今すぐ更新しますか？' : '設定画面からアップデートできます'}`,
    [
      { text: '後で', style: 'cancel' },
      {
        text: manual ? '今すぐ更新' : '設定画面へ',
        onPress: () => onConfirmed?.(doDownload),
      },
    ],
  );
}

export async function downloadAndInstall(onProgress?: (pct: number) => void): Promise<void> {
  const result = await fetchVersionJson();
  if (!result.ok || !result.data.apkUrl) {
    Alert.alert('エラー', 'ダウンロードURLが取得できませんでした');
    return;
  }
  const apkPath = await downloadApk(result.data.apkUrl, onProgress);
  if (!apkPath) {
    Alert.alert('エラー', 'ダウンロードに失敗しました。');
    return;
  }
  await installApk(apkPath);
}
