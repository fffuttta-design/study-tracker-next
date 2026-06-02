import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const EDITOR_URL = __DEV__
  ? 'http://10.0.2.2:3000/editor-mobile'
  : 'https://study-tracker-next-web.vercel.app/editor-mobile';

interface Props {
  content: string;
  title: string;
  onSave: (content: string, title: string) => void;
  style?: object;
}

export function TipTapWebEditor({ content, title, onSave, style }: Props) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  const sendInit = (c: string, t: string) => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'init', content: c, title: t }));
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        readyRef.current = true;
        sendInit(content, title);
      } else if (data.type === 'change') {
        onSave(data.content ?? '', data.title ?? '');
      }
    } catch {
      // 無視
    }
  };

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: EDITOR_URL }}
      onMessage={handleMessage}
      style={[styles.webview, style]}
      keyboardDisplayRequiresUserAction={false}
      scrollEnabled={true}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#ffffff' },
});
