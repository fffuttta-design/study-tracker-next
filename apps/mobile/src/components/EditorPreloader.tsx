/**
 * EditorPreloader — editor-mobile URL をバックグラウンドでプリロードする
 * HomeScreen に配置することで、ページを開く前にキャッシュを温める
 *
 * 注意: 起動直後は native モジュールの初期化と競合するため
 * 3秒の遅延後に WebView を生成する
 */
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

const EDITOR_URL = __DEV__
  ? 'http://10.0.2.2:3000/editor-mobile'
  : 'https://study-tracker-next-web.vercel.app/editor-mobile';

export function EditorPreloader() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // アプリ起動が安定してから WebView を生成（初回起動クラッシュ対策）
    const t = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    // pointerEvents は style ではなく prop で指定（RN の仕様）
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}>
      <WebView
        source={{ uri: EDITOR_URL }}
        style={{ width: 1, height: 1 }}
        scrollEnabled={false}
      />
    </View>
  );
}
