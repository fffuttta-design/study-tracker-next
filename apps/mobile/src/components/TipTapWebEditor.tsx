import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const EDITOR_URL = __DEV__
  ? 'http://10.0.2.2:3000/editor-mobile'
  : 'https://study-tracker-next-web.vercel.app/editor-mobile';

interface Props {
  content: string;
  title: string;
  readOnly?: boolean;
  onSave?: (content: string, title: string) => void;
  style?: object;
}

export function TipTapWebEditor({ content, title, readOnly = false, onSave, style }: Props) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  // injectJavaScript でコンテンツを渡す（postMessage より確実）
  const injectContent = (c: string, t: string, ro: boolean) => {
    const script = `
      (function() {
        window.__rnContent = ${JSON.stringify(c)};
        window.__rnTitle = ${JSON.stringify(t)};
        window.__rnReadOnly = ${JSON.stringify(ro)};
        if (typeof window.__applyEditorContent === 'function') {
          window.__applyEditorContent(window.__rnContent, window.__rnTitle, window.__rnReadOnly);
        }
        true;
      })();
    `;
    webViewRef.current?.injectJavaScript(script);
  };

  const handleLoadEnd = () => {
    console.log('[TipTapWebEditor] onLoadEnd fired, content length:', content?.length ?? 0);
    // ページロード完了後にコンテンツを注入（500ms待機してエディタ初期化を待つ）
    setTimeout(() => {
      console.log('[TipTapWebEditor] injectContent called');
      injectContent(content, title, readOnly);
    }, 500);
    // 念のため1.5秒後にも再試行
    setTimeout(() => injectContent(content, title, readOnly), 1500);
  };

  // readOnly が変わったときも注入で通知
  const prevReadOnlyRef = useRef(readOnly);
  if (prevReadOnlyRef.current !== readOnly) {
    prevReadOnlyRef.current = readOnly;
    if (readyRef.current) {
      setTimeout(() => injectContent(content, title, readOnly), 0);
    }
  }

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        readyRef.current = true;
        injectContent(content, title, readOnly);
      } else if (data.type === 'change' && !readOnly && onSave) {
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
      onLoadEnd={handleLoadEnd}
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
