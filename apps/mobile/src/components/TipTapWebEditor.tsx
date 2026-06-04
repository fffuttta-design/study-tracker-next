import React, { useRef, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const EDITOR_URL = __DEV__
  ? 'http://10.0.2.2:3000/editor-mobile'
  : 'https://study-tracker-next-web.vercel.app/editor-mobile';

interface PageMeta { title: string; icon: string; }

interface Props {
  content: string;
  title: string;
  readOnly?: boolean;
  pagesMap?: Record<string, PageMeta>;  // pageId → 最新タイトル/アイコン
  onSave?: (content: string, title: string) => void;
  onNavigate?: (href: string) => void;
  style?: object;
}

export function TipTapWebEditor({ content, title, readOnly = false, pagesMap, onSave, onNavigate, style }: Props) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [contentReady, setContentReady] = useState(false);

  // injectJavaScript でコンテンツを渡す（postMessage より確実）
  const injectContent = (c: string, t: string, ro: boolean) => {
    const script = `
      (function() {
        window.__rnContent = ${JSON.stringify(c)};
        window.__rnTitle = ${JSON.stringify(t)};
        window.__rnReadOnly = ${JSON.stringify(ro)};
        window.__pagesMap = ${JSON.stringify(pagesMap ?? {})};
        if (typeof window.__applyEditorContent === 'function') {
          window.__applyEditorContent(window.__rnContent, window.__rnTitle, window.__rnReadOnly);
        }
        true;
      })();
    `;
    webViewRef.current?.injectJavaScript(script);
  };

  const handleLoadEnd = () => {
    // ロード完了後すぐ注入（__rnContentにセットし、エディタ初期化後に自動適用される）
    injectContent(content, title, readOnly);
    // TipTapの初期化が間に合わなかった場合の保険（短め）
    setTimeout(() => injectContent(content, title, readOnly), 300);
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
      } else if (data.type === 'contentReady') {
        setContentReady(true);
      } else if (data.type === 'navigate' && onNavigate) {
        onNavigate(data.href ?? '');
      }
    } catch {
      // 無視
    }
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ uri: EDITOR_URL }}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        style={[styles.webview, { opacity: contentReady ? 1 : 0 }]}
        keyboardDisplayRequiresUserAction={false}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
      />
      {!contentReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#F59E0B" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#ffffff' },
  webview:        { flex: 1, backgroundColor: '#ffffff' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
