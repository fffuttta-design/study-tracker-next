import { NativeModules, DeviceEventEmitter } from 'react-native';

// ネイティブの SharedTextModule（共有/選択メニューから受け取ったテキストの橋渡し）
const { SharedText } = NativeModules as {
  SharedText?: { getInitialSharedText: () => Promise<string | null> };
};

/** コールドスタート時、起動インテントに含まれる共有テキストを取得（無ければ null） */
export async function getInitialSharedText(): Promise<string | null> {
  try {
    if (!SharedText?.getInitialSharedText) return null;
    return await SharedText.getInitialSharedText();
  } catch {
    return null;
  }
}

/** 起動中に届いた共有テキストを購読（解除関数を返す） */
export function onSharedText(cb: (text: string) => void): () => void {
  const sub = DeviceEventEmitter.addListener('SharedTextReceived', cb);
  return () => sub.remove();
}
