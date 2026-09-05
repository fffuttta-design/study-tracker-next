# Study Tracker Next — 開発ガイド

> **このドキュメントは開発作業の全フェーズで必ず参照すること。**
> コード変更・機能追加・バグ修正・リファクタリング問わず、以下のルールに従うこと。

---

## ⚠️ セッション開始時の必須手順

**このプロジェクトでの会話を始める際は、必ず最初に以下を読むこと：**

```
C:\dev\CompanyOps\Application\Study-Tracker-Next\Study-Tracker-Next仕様書.md
```

仕様書には全画面・全データモデル・全コレクション・設定項目・配信フローが記載されている。
読まずに作業を進めると既存の設計と衝突するコードを生成するリスクがある。

## ⚠️ 機能追加・変更後の必須手順

機能追加・変更・バグ修正を行ったら、**必ず仕様書の該当箇所を更新すること**：

1. 新機能 → 対応する画面仕様セクション（§4.x）に追記
2. 新データフィールド → §5（データモデル）を更新
3. 新 Firestore コレクション → §6 に追加
4. 新設定項目 → §10（settingsStore）に追加
5. 改修内容 → §13（改修ログ）に日付・バージョン・内容を追記

---

## プロジェクト概要

学習管理アプリ。Web・Windowsデスクトップ・Android の3プラットフォームで動作する。

| プラットフォーム | 技術 | 配信先 |
|---|---|---|
| Web | Next.js 15 + Firebase | Vercel（GitHub push で自動デプロイ） |
| Desktop (Windows) | Electron + Next.js | GitHub Release（ZIP）→ アプリ自身が自動DL・自己置換 |
| Android | React Native 0.85 | GitHub Release（APK・初回インストールも更新も同じ） |

### モノレポ構成

```
apps/
  web/       # Next.js（WebとElectronが共用するメインUI）
  desktop/   # Electron ラッパー
  mobile/    # React Native Android
packages/
  core/      # 共有データモデル・ユーティリティ
  firebase/  # Firestore操作ラッパー
  ui/        # 共有UIコンポーネント
```

---

## ルール1：改修後は必ずバージョンを上げること

### バージョン管理ファイル

| ファイル | 役割 |
|---|---|
| `electron/build-info.json` | `version`（semver）+ `buildNumber`（通し番号）。**配信スクリプトが自動でインクリメントする** |
| `apps/web/src/lib/version.ts` | UI表示用の `APP_VERSION` 文字列。**配信スクリプトが自動で書き換える。手動で編集しないこと。** |
| `apps/mobile/android/app/build.gradle` | `versionCode` / `versionName`。配信スクリプトが自動更新する |

### バージョンの上げ方

**3ファイルすべて配信スクリプト（`npm run dist:win:sync`）が自動更新する。手動で触る必要はない。**

- `electron/build-info.json` → patch +1、buildNumber +1
- `apps/web/src/lib/version.ts` → `build-info.json` の新バージョンに自動上書き
- `apps/mobile/android/app/build.gradle` → `update-mobile-build-number.mjs` が更新

> ⚠️ `version.ts` は **絶対に手動編集しないこと**。スクリプトが管理するファイルのため、手動で変更すると次回配信時に上書きされるか、バージョンの逆行を引き起こす。

---

## ルール2：改修後は全デバイスへ配信すること

### 配信コマンド（これ1つで全プラットフォームに配信）

```bash
npm run dist:win:sync
```

このコマンドが自動で行うこと：

1. `electron/build-info.json` の `buildNumber` と `version`（patch）をインクリメント
2. `apps/mobile/version.json` を更新
3. Android の `updateService.ts` のビルド番号を更新
4. 起動中の `学習トラッカー.exe` を終了（DLLロック解除）
5. Electron で Windows デスクトップアプリをビルド（`dist-electron/win-unpacked`）
6. `dist-electron/study-tracker-win.zip` を作成（GitHub Release 配布用）
7. Android APK をビルド（assembleDebug のみ・release は reanimated ninja ループで失敗するため）
8. GitHub Release `build-XXX` タグに APK と Windows ZIP を両方アップロード
9. `git add -A && git commit && git push origin master` → Vercel が自動デプロイ → Web 配信完了

> 🔥 **アプリの実体は `%LOCALAPPDATA%\Programs\study-tracker\学習トラッカー.exe` の1つだけ**（NSISインストーラの入れ先＝`electron-updater` が自己置換するのもここ）。
> ⚠️ **`%LOCALAPPDATA%\StudyTracker\` は2026-06で役目を終えた置き去りのコピー。** 昔は配信スクリプトが
> `robocopy` でここへ直コピーしていたが**その処理はもう無い**ので中身は6月のまま（v1.0.199・旧アイコン）。
> ここを起動すると**古いアイコンの窓がもう1つ増えて「アイコンがちぐはぐ」に見える**（2026-08-31に実際に発生）。
> 検証でアプリを起動するときも**必ず `Programs\study-tracker` の方**を使うこと。

### 前提条件

- `gh` CLI がインストール済みで認証済みであること（GitHub Releaseアップロードに使用）
- Android SDK・JAVA_HOME が設定済みであること（スクリプト内でパスを自動設定）

### Webのみ更新する場合

```bash
git add -A && git commit -m "..." && git push origin master
```

GitHub push だけで Vercel が自動デプロイする。

---

## ルール3：UIの改修は「デスクトップ実機」で動作確認してから報告する

Webのプレビュー（`npm run dev` + ブラウザ）は**ログインが要るのでサイドバーや本文まで到達できない**。
確認はデスクトップ版（ログイン済み）にCDPで繋いで行う。

```powershell
Get-Process -Name '学習トラッカー' | Stop-Process -Force
Start-Process "$env:LOCALAPPDATA\Programs\study-tracker\学習トラッカー.exe" -ArgumentList '--remote-debugging-port=9222'
# 検証が終わったら必ず通常モードで起動し直す（デバッグポートを開けっぱなしにしない）
```

接続は Node 組込 WebSocket（`new WebSocket(t.webSocketDebuggerUrl)`・`ws` パッケージは入っていない）。
雛形＝`C:\dev\Skills\studytracker-seiri\core\cdp-verify-rootmenu3.mjs` / `_shot-page.mjs`（スクショ）。

### 🔥 ここで3回誤診した（2026-09-05）

1. **配信直後は、デスクトップ版がまだ古いJSを読んでいる。**
   アプリはVercelに載ったWebを読む。`npm run dist:win:sync` が終わっても**Vercelのデプロイはその後**なので、
   直後に触ると新機能が無い。しかも **`APP_VERSION` の表示だけは新しくなっていることがある**ので、
   バージョン表示を根拠にしてはいけない。確実な判定はこれ：
   ```js
   // ページ内で実行：読み込み済みJSに新機能の文字列が入っているか
   const srcs=[...document.querySelectorAll('script[src]')].map(s=>s.src);
   for(const u of srcs){ if((await (await fetch(u)).text()).includes('最上位に作成')) hit++; }
   ```
2. **前のテストで開いたメニューが、次のクリックを食う。**
   コンテキストメニューは `.fixed.inset-0` のオーバーレイを敷くので、閉じずに次の座標をクリックすると
   そのオーバーレイに当たる。**各テストの前に必ず閉じる**：
   ```js
   document.querySelectorAll('.fixed.inset-0').forEach(o=>o.dispatchEvent(new MouseEvent('click',{bubbles:true})));
   ```
3. **メニューの有無を `document.body.innerText` の語で判定しない。**
   ツールバーに「IDをコピー」等が常時表示されているため、何をしても `true` になる。
   判定は**そのメニューにしか無い語**（例：「最上位に作成」）で行う。

### 座標の取り方
右クリックは `Input.dispatchMouseEvent`（`button:'right'`, `buttons:2` を press/release の2回）が確実。
「サイドバーの余白」は、**nav内の全要素の `bottom` の最大値 + 40px** で求める
（最後の `<a>` の下＝まだ項目の上、ということがある）。

---

## 開発環境

```bash
npm run dev          # Web + Electron を同時起動（Turbo）
npm run build        # 全パッケージをビルド（型チェック含む）
npm run type-check   # TypeScript型チェックのみ
```

---

## 技術スタック

- **状態管理**: Zustand（Firebase Firestoreとリアルタイム同期）
- **エディタ**: TipTap（NotionライクなリッチテキストエディタはNotionEditor.tsxに集約）
- **スタイリング**: Tailwind CSS
- **データ永続化**: Firebase Firestore（ユーザーごとに `users/{uid}/` サブコレクション）
- **設定永続化**: Zustand persist（localStorage）

## Firestoreコレクション一覧

| コレクション名 | 用途 |
|---|---|
| `learningItems` | 学習アイテム（間隔反復スケジューリング） |
| `categories` | カテゴリー階層 |
| `notionPages` | NotionPlusページ |
| `notionPageHistory` | ページ変更履歴 |
| `notionDatabaseRows` | データベース行 |
| `memos` | 簡易メモ |
| `dailyMemos` | 日付別学習メモ（ID = YYYY-MM-DD） |
| `improvementTasks` | 改善タスク |
| `goals` | 目標管理 |
