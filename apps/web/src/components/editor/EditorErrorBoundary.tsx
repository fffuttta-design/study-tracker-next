'use client';

// エディタ内で予期しない例外（壊れた貼り付けデータなど）が起きても、
// アプリ全体が真っ白（「Application error」）になるのを防ぐための安全網。
// ここで受け止めて、その場で「読み込み直す」ボタンを出して復帰できるようにする。

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // リセット時に呼ぶ（親側でエディタを作り直したい場合に使う）
  onReset?: () => void;
}
interface State {
  hasError: boolean;
  message: string;
}

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    // 開発時のみ詳細をコンソールへ。本番でも握りつぶさず記録は残す。
    console.error('[EditorErrorBoundary]', error);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-3xl">⚠️</div>
          <p className="text-sm font-semibold text-gray-700">
            エディタの表示中に問題が発生しました
          </p>
          <p className="max-w-md text-xs text-gray-400">
            貼り付けたデータが原因の可能性があります。下のボタンで読み込み直すと、
            直前までの保存内容から復帰できます。
          </p>
          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              エディタを読み込み直す
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
            >
              ページ全体を再読み込み
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
