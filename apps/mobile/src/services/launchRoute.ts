import { NativeModules, DeviceEventEmitter } from 'react-native';

// ネイティブの LaunchRouteModule（専用アイコン起動時に最初に開く画面の橋渡し）
const { LaunchRoute } = NativeModules as {
  LaunchRoute?: { getInitialLaunchRoute: () => Promise<string | null> };
};

/** コールドスタート時、専用アイコン（activity-alias）起動なら開く画面名を返す（無ければ null） */
export async function getInitialLaunchRoute(): Promise<string | null> {
  try {
    if (!LaunchRoute?.getInitialLaunchRoute) return null;
    return await LaunchRoute.getInitialLaunchRoute();
  } catch {
    return null;
  }
}

/** 起動中に専用アイコンから再度呼ばれたら通知（解除関数を返す） */
export function onLaunchRoute(cb: (route: string) => void): () => void {
  const sub = DeviceEventEmitter.addListener('LaunchRouteReceived', cb);
  return () => sub.remove();
}
