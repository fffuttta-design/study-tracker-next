# StudyTracker クリッパー拡張 — 開発ガイド（CLAUDE.md）

> このフォルダは StudyTracker-Next 用の Chrome 拡張（MV3）。
> 「見ているWebページ／選択テキストを StudyTracker の特急メモにサッと記録」するクリッパー。
> 役割分担：このファイル＝守ること（How）、`StudyTrackerクリッパー仕様書.md`＝何を作るか（What）。

## アーキテクチャ要点（地雷含む）

- **認証は拡張に持たせない**。記録は StudyTracker Web の `/clip` ページ（`apps/web/src/app/clip/page.tsx`）で行い、
  **ブラウザに既にあるログイン済みFirebaseセッション**を使う。だから拡張側に Google Cloud / OAuth 設定は一切不要。
  - → もし将来「ワンクリックで画面を出さず直接保存」にしたくなったら、拡張に Firebase Auth を載せる必要があり、
    その時だけ Google Cloud で「Chrome拡張」種別のOAuthクライアントID登録（拡張ID固定＝manifestに`key`）が要る。
- 保存先URLは `background.js` の `CLIP_URL`（本番 Vercel `https://study-tracker-next-web.vercel.app/clip`）。
  **Webの`/clip`が本番に出ていないと拡張は動かない**ので、`/clip` 改修時は必ず Web を配信（git push→Vercel）してから拡張をテスト。
- 選択テキストは URL クエリで渡す。長すぎ対策で `MAX_CONTENT=8000` で丸めている（プロキシのURL長制限回避）。
- `chrome://` などでは `scripting.executeScript` が失敗する→ try/catch で握り、選択空で続行する。

## 開発・読み込み手順（ユーザー実機）

1. Chrome で `chrome://extensions` を開く
2. 右上「デベロッパーモード」をON
3. 「パッケージ化されていない拡張機能を読み込む」→ この `clipper-extension` フォルダを選択
4. 使い方：
   - ツールバーの⚡アイコンをクリック → 今のページ＋選択テキストを記録画面へ
   - 右クリック →「StudyTracker に記録」（選択テキスト／ページ／リンク）

## 変更時のルール

- 機能を変えたら `version`（manifest.json）を上げ、仕様書 `StudyTrackerクリッパー仕様書.md` を更新する。
- `/clip` 側（Web）を変えたら StudyTracker-Next を配信（`npm run dist:win:sync` か Web のみ `git push`）。
- アイコンは `icons/`（sharp で⚡を生成。再生成スクリプトは git 履歴/この PJ のメモ参照）。

## 配布（将来）

- 当面は「パッケージ化されていない拡張機能」として手元読み込みで運用。
- ストア公開する場合は zip 化して Chrome ウェブストアへ（要デベロッパー登録）。その際 manifest に `key` を入れて拡張IDを固定する。
