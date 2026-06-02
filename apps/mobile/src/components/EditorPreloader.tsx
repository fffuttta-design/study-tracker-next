/**
 * EditorPreloader — editor-mobile URL をバックグラウンドでプリロードする
 * HomeScreen に配置することで、ページを開く前にキャッシュを温める
 */
import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

const EDITOR_URL = __DEV__
  ? 'http://10.0.2.2:3000/editor-mobile'
  : 'https://study-tracker-next-web.vercel.app/editor-mobile';

export function EditorPreloader() {
  return (
    <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <WebView
        source={{ uri: EDITOR_URL }}
        style={{ width: 1, height: 1 }}
        scrollEnabled={false}
        // メッセージ等は無視（表示用途ではないため）
      />
    </View>
  );
}
