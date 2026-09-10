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

## 🔔 このアプリには「相棒のサーバー」が1本ある

**毎朝10時の復習通知の送り主は、このリポジトリではない。**
VPS常駐の別サービス **`C:\dev\CompanyOps\Application\study-review-notifier`** が
Firestore を読んで FCM を投げている（Cloud Functions は使わない＝Blaze 不要）。

- **復習の判定条件（`notionPageId` あり かつ 未完了ステージの予定日が今日以前）を変えるときは、
  4か所を同時に直す**：`apps/web/.../learning/page.tsx` の `dueItems` ／
  `apps/mobile/.../LearningScreen.tsx` ／ `packages/core/.../learningItem.ts` の `hasDueReview` ／
  **notifier の `due_items()`**。片方だけ直すと、通知の件数と画面の件数が合わなくなる。
- 通知が来ないときの切り分けは `study-review-notifier/CLAUDE.md`（`py deploy.py testsend` で即送信できる）。
- アプリ側の実装は `apps/mobile/src/services/push.ts` と §4.10（仕様書）。

---

## 🪟 タブでもリンクでも「窓を増やさない」（v1.0.318〜）

デスクトップ版は窓が複数ある（メイン／NotionPlus／ノート別窓／特急メモ）。
🔥 **画面の中の操作（大タブ・本文のリンク）は、すべて今いる窓でのページ遷移。新しい窓は開かない。**

- ⚠ v1.0.315〜317 は「画面ごとに担当の窓を決め、担当外のタブは担当の窓を前に出す」作りだった。
  だが **NotionPlusのタブを押しただけで窓がもう1つ立ち上がる**のが鬱陶しく、撤去した（2026-09-10 本人指摘）。
  `TopTabs.tsx` の `ownerOf()`／`isForeign()`／`handoff()` は削除済み。**復活させない。**
  （同じ理由で v1.0.317 に `guardWindowSection`＝全ナビゲーション監視も撤去済み。こちらも復活させない）
- 🔥 **窓を切り替えてよいのはディープリンク（`studytracker://`）とトレイだけ**＝
  `electron/main.js` の `sectionOwner()` → `showSection()`。`/notion-plus` のディープリンクは
  専用アイコンの NotionPlus窓を前に出す（`/studytracker-seiri` の `open-in-app.mjs` が使う経路）。
- 「同じ画面が2窓に並ぶと古い方が昨日の日付で止まる」問題は `useToday()` 側で解決済み（下記）。
  **窓を分けることで防ごうとしない。**
- 仕組みの詳細＝仕様書 §4.0。

## 📅 「今日」は `useToday()` で取る（v1.0.315〜）

このアプリはトレイ常駐で**何日も開きっぱなし**になる。
∴ 画面で日付を出すときに `new Date()` を1回読むだけだと、**翌日も昨日のまま止まる**
（2026-09-08、前日から開いていた窓が「9月7日」を表示したまま残っていた）。
日付を扱うときは `hooks/useToday.ts` を使う（0時のタイマー＋フォーカス／表示復帰で見直す）。

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
4. **検証の途中でアプリが自動更新して再起動し、デバッグポートが閉じる。**（2026-09-06）
   配信した新版をアプリ自身が拾って自己置換するため、CDPが `ECONNRESET` で落ちる。
   待機ループは**接続エラーを握って再試行する**作りにし、落ちたら
   `--remote-debugging-port=9222` で起動し直す。

### ✅ Vercel反映の確認は、アプリを使わないほうが速い（推奨）
アプリを起動してCDPで見るより、**Node から直接ビルド済みJSを読む**ほうが確実で速い。
```js
const html = await (await fetch('https://study-tracker-next-web.vercel.app/goals')).text();
const srcs = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)]
  .map(m => 'https://study-tracker-next-web.vercel.app' + m[1]);
for (const u of srcs) if ((await (await fetch(u)).text()).includes('<新コードにしか無い文字列>')) hit++;
```
反映を確認してから初めてアプリを起動する。**アプリを何度も再起動しない**（Firestoreの読み取りを食う）。

### 座標の取り方
右クリックは `Input.dispatchMouseEvent`（`button:'right'`, `buttons:2` を press/release の2回）が確実。
「サイドバーの余白」は、**nav内の全要素の `bottom` の最大値 + 40px** で求める
（最後の `<a>` の下＝まだ項目の上、ということがある）。

---

## 🔥 エディタは「ふたメモ」と共有している（2026-09-06〜）

NotionPLUS のエディタ部品は、このリポジトリの中だけの物ではない。
**ふたメモ（FutaMemo）と同じ実体を使っている。**

```
C:\dev\CompanyOps\Application\Utility\FutaEditor   ← 部品の実体（パッケージ名 @futa/editor）
```

- `NotionEditor.tsx` の冒頭で `@futa/editor` から取り込んでいる物は**すべて共有**＝
  ここで直すのではなく、**FutaEditor 側を直す**。直すと ふたメモ にも同時に効く。
- ページリンク／ページテーブル／テーブルビューも**共有**になった（2026-09-06）。
  ページ一覧との接点は `NotionEditor.tsx` の中で作る**差し込み口**（`editorHost`）だけ。
  ノート⇄ブック変換もここから渡している（ふたメモには無い機能なので、向こうではボタンが出ない）。
- 一方、`NotionEditor.tsx` に直接書いてある物（インラインDB／特急メモ／検索置換／学習記録）は
  **NotionPLUS専用**。学習データやDBの行に繋がっているので共有できない。
- 🔥 **FutaEditor を直したら、必ずふたメモ側もビルドして確かめる**（片方だけの確認は禁止）。
  ルールと地雷の正本＝`C:\dev\CompanyOps\Application\Utility\FutaEditor\CLAUDE.md`。

### 🔥 配線（2026-09-07 に作り直した。ここを勘違いすると Vercel が落ちる）

**取り込み先は GitHub（`git+https://github.com/fffuttta-design/futa-editor.git#main`・publicリポジトリ）。**

> ⚠️ **`file:../../../Utility/FutaEditor` に戻してはいけない。**
> それはこのPCの中のフォルダを指すだけで、**リポジトリの外**にある。
> Vercel はこのリポジトリしかコピーしないので `Module not found: Can't resolve '@futa/editor'` で
> **本番デプロイが必ず落ちる**（2026-09-06〜07、実際に8回連続で落ち、Webが1日半止まった）。

**手元では実フォルダに繋ぎ直している**＝`scripts/link-futa-editor.mjs`（`postinstall` で自動実行）。
`apps/web/node_modules/@futa/editor` を `C:\dev\CompanyOps\Application\Utility\FutaEditor` への
ジャンクションに置き換えるので、**FutaEditorを直せば即このアプリにも効く**（今までどおり）。
FutaEditorが無いPC・Vercelでは何もせず素通りする。

🔥 **∴ FutaEditor を直したときの締めは3手**（取り込み版の更新は配信コマンドが自動でやる）：

> 🔴 **① の前に、FutaEditor の `package.json` の `version` を必ず上げる**（2026-09-08 に踏んだ）。
> webpack は `node_modules` の中身を**パッケージの version で新旧判断する**（`snapshot.managedPaths`）。
> 中身だけ変えて version を据え置くと、**Vercelのビルドキャッシュが前のファイルを使い回す**。
> しかも**ビルドは成功する**ので、`package-lock.json` が新しい commit を指していても気づけない。
> 配信コマンドが上げ忘れを検知して止めるようにしてあるが、先に上げるのが本筋。


| | やること |
|---|---|
| ① | **FutaEditor の `package.json` の `version` を上げる**（🔴 これを飛ばすと配信物だけ古くなる） |
| ② | **FutaEditor 側で commit → push**（`Utility\FutaEditor`・publicリポジトリ） |
| ③ | いつもの **`npm run dist:win:sync`**（配信）<br>　→ ビルド前に取り込む版を自動で最新へ進める |

> 🛑 **FutaEditor に未コミット／未pushがあると、配信コマンドは何もせずその場で止まる。**
> 「手元では直っているのに配信物だけ古い」を機械的に防ぐため（`scripts/build-and-sync.mjs` の Step -1）。
> 止まったら①を済ませて、もう一度配信すればよい。手で進めたいときだけ `npm run editor:update`。

| ファイル | 何を書いてあるか |
|---|---|
| `apps/web/package.json` | `"@futa/editor": "git+https://github.com/fffuttta-design/futa-editor.git#main"` |
| `apps/web/next.config.ts` | `transpilePackages` に追加＋`resolve.modules` に自分と直下の node_modules を先頭追加 |
| `apps/web/tsconfig.json` | `preserveSymlinks: true` ＋ `paths` で apps/web 側にしか無い TipTap を指す |
| `apps/web/tailwind.config.ts` | `content` に FutaEditor の src を追加（入れないとクラスが出ない） |

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
