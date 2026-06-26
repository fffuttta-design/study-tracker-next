# Study-Tracker-Next 仕様書

> **このドキュメントは機能追加・改修のたびに必ず更新すること。**
> 現バージョン: **v1.0.195 / build 215**（2026-06-13 時点）

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [技術スタック・アーキテクチャ](#2-技術スタックアーキテクチャ)
3. [プラットフォーム別仕様](#3-プラットフォーム別仕様)
4. [画面・機能仕様](#4-画面機能仕様)
5. [データモデル](#5-データモデル)
6. [Firestore コレクション設計](#6-firestore-コレクション設計)
7. [状態管理（Zustand ストア）](#7-状態管理zustand-ストア)
8. [API ルート仕様](#8-api-ルート仕様)
9. [主要コンポーネント](#9-主要コンポーネント)
10. [設定・永続化](#10-設定永続化)
11. [エディタ（TipTap）仕様](#11-エディタtiptap仕様)
12. [配信フロー](#12-配信フロー)
13. [改修ログ](#13-改修ログ)

---

## 1. プロジェクト概要

学習管理 + ノート（Notion ライク）+ 間隔反復復習 を統合した個人学習プラットフォーム。

### コンセプト

- **学習を記録 → ノートに貼り付け → 間隔を置いて復習** の 3 ステップを一気通貫
- Notion へのインポート対応（既存ノート資産を移行可能）
- AI（Claude Haiku）でメモを自動整理・分類
- Web / Windows デスクトップ / Android の 3 プラットフォーム同期

### バージョン管理ファイル

| ファイル | 説明 |
|---|---|
| `electron/build-info.json` | `version`（semver） + `buildNumber`（通し番号） |
| `apps/web/src/lib/version.ts` | UI 表示用バージョン文字列（**自動生成・手動編集禁止**） |
| `apps/mobile/android/app/build.gradle` | Android versionCode / versionName |

---

## 2. 技術スタック・アーキテクチャ

### モノレポ構成（Turborepo）

```
apps/
  web/       # Next.js 15 + React 19（Web & Electron の共用 UI）
  desktop/   # Electron ラッパー
  mobile/    # React Native 0.85（Android）
packages/
  core/      # 共有データモデル・ユーティリティ
  firebase/  # Firestore 操作ラッパー
  ui/        # 共有 UI コンポーネント
```

### 主要ライブラリ

| カテゴリ | ライブラリ | バージョン |
|---|---|---|
| フレームワーク | Next.js | 15 |
| UI ライブラリ | React | 19 |
| リッチエディタ | TipTap | 3.23 |
| 状態管理 | Zustand | 5 |
| スタイリング | Tailwind CSS | 3.4 |
| データベース | Firebase Firestore | - |
| 認証 | Firebase Auth（Google OAuth） | - |
| LLM | Anthropic SDK（Claude Haiku 4.5） | - |
| モバイル | React Native | 0.85 |
| デスクトップ | Electron | - |

### データフロー

```
ユーザー操作
    ↓
Zustand Store（UI 状態 + Firebase リアルタイム同期）
    ↓
Firebase Firestore（users/{uid}/コレクション）
    ↓（subscribeCol でリアルタイム受信）
全クライアントに即時反映
```

---

## 3. プラットフォーム別仕様

| 機能 | Web | Desktop (Windows) | Mobile (Android) |
|---|---|---|---|
| 学習記録・復習 | ✓ | ✓ | ✓ |
| NotionPlus（ノート） | ✓ | ✓ | 閲覧のみ（予定） |
| AI 整理 | ✓ | ✓ | ✓ |
| ローカルバックアップ | - | ✓ | - |
| Google Drive バックアップ | - | ✓ | - |
| 復習通知（時刻指定） | - | ✓（Electron 通知） | ✓（FCM） |
| 自動起動 | - | ✓ | - |
| Notion インポート | ✓ | ✓ | - |
| Google OAuth | ✓ | ✓（OAuthループバック + PKCE） | ✓ |

### Web
- **ホスト**：Vercel（GitHub push で自動デプロイ）
- **URL**：master push → Vercel が自動ビルド

### Desktop (Windows)
- **配信先**：Google Drive（`.sync-dest` ファイルにパス記載）
- **自動更新**：起動時に Drive の version.txt を確認して更新
- **Google 認証**：OAuthループバック + PKCE（`electron/googleAuth.js`）
- **exe 名**：固定名（バージョン番号を含まない）

### Mobile (Android)
- **配信**：GitHub Release（APK） + Google Drive（バックアップ）
- **署名**：リリース鍵（Drive `_signing/` にバックアップ）
- **OTA 更新**：アプリ内バージョン確認 → GitHub Release から APK ダウンロード

---

## 4. 画面・機能仕様

### 4.1 学習ページ（`/learning`）

**日付ナビゲーション**（常時表示）
- 前日 / 翌日 移動ボタン
- 選択日付を `text-3xl` で大きく表示
- 今日のスコアカード：学習数 / 復習待ち件数
- 今日の格言（日付ハッシュで毎日変わる）

**タブ構成（7タブ）**

#### タブ 0: ダッシュボード

**左パネル「今日の登録」**
- ⚡ 特急メモ（未消化）パネル
  - 折りたたみ可能なカードリスト
  - 各カードに：「✨ AI整理」「消化する →」「🗑 削除」ボタン
  - 登録日表示
- 消化済み学習アイテム（時間帯グループ）
  - `HH:00～` でグループ化
  - 昨日の学習（翌日 DUE）は赤色パネルで特別表示
- 「＋ 追加」「⚡ 特急」ボタン

**右パネル「今日の復習」**
- ステージ別グループ（色分けバッジ）
  - 翌日 / 3日後 / 7日後 / 2週間後 / 1ヶ月後
- 各ステージ内を学習日（dateKey）でサブグループ化
- 古い順 / 新しい順ソート切り替え

#### タブ 1: 本日の学習
- タイトル・内容検索
- フィルター：全て / 復習待ち / 完了済み
- コンパクト / 展開表示切り替え

#### タブ 2: 今日の復習
- ステージ別セクション（色分け）
- 学習日サブグループ化
- 復習完了ボタン：「この復習を完了（○日後）」

#### タブ 3: 達成リスト
- **サマリーカード**：全制覇 / 進行中 / 未着手 / 総アイテム数
- **ステージ分布バー**：復習ステージ別の割合（プログレスバー）
- **カテゴリフィルター**：すべて / 各カテゴリ
- **アイテム一覧**
  - 完了ステージ数でソート（降順）
  - ステージ進捗を小円で表示（完了=色付き / 未完了=灰色）
  - 全制覇マーク（🏆）

#### タブ 4: 全学習リスト
- **リストビュー**：日付ごとグループ化（降順）
- **カレンダービュー**
  - ヒートマップ（色の濃さ = 学習数）
  - 日付クリックでポップアップ表示
  - 月移動ナビゲーション

#### タブ 5: 通知ログ
- 準備中

#### タブ 6: ⚡ 特急
- 未消化特急メモ一覧
- AI整理 / 消化する / 削除アクション

---

### 4.2 AI整理モーダル（⚡ 特急からトリガー）

- 特急メモの内容を Claude Haiku に送信
- 候補ページ最大 3 件を提案（スコア付き理由付き）
- 候補ページをクリックすると：
  - そのページの見出し一覧を表示（アウトライン）
  - 追加先セクションを選択可能（末尾 / 各見出しの下）
- タイトル・内容を AI が整形（編集可能）
- 「消化する」ボタンで学習アイテムとして保存、元メモを削除

---

### 4.3 記録モーダル（AddItemDialog）

**左パネル**
- ページツリー（お気に入り → ルートページ → 子ページ）
  - お気に入りはページの深さに関係なく全ページから抽出
  - 展開 / 折りたたみ
  - 右クリックで「📚 Bookに変換 / 📄 ノートに変換」（**内容を保持**：ノート→Bookは本文を第1章へ、Book→ノートは全チャプターを1ページへ結合）
  - 「＋」ボタンで新規ページダイアログ
  - テキスト検索（タイトル一致 + 本文一致）
- 下部に「閉じる」ボタン

**右パネル（ヘッダー）**
- パンくずナビ（階層パス表示 / クリックでジャンプ）
- アイコン変更ボタン（アイコンピッカー）
- 「📚 記録」ボタン（選択テキストを登録）

**右パネル（Book 選択時）**
- チャプタータブバー（スクロール可能）
- 「＋ チャプター追加」ボタン

**右パネル（エディタ）**
- `NotionEditor` を共用
- テキスト選択 → 🔥 ボタン or 「📚 記録」で登録ダイアログ

**新規ページダイアログ**
- タイトル入力
- アイコン選択（絵文字80種 + URL入力）
- タイプ選択：ノート / ブック

**登録完了トースト**
- 画面中央に「🎉 登録しました！」を大きくアニメーション表示（1.8秒）

---

### 4.4 NotionPlus（`/notion-plus/[id]`）

#### ページタイプ

**① ノート**
- TipTap リッチエディタ
- 自動保存（編集停止後）
- ページ履歴（最新20件）

**② データベース**
- テーブルビュー
- スキーマ編集（プロパティ追加 / 削除 / 型変更）
- プロパティ型：テキスト / 数値 / セレクト / マルチセレクト / チェックボックス / 日付 / URL
- 行追加 / 編集 / 削除 / 並び替え
- 集計（count / sum / avg / min / max）

**③ ブック（Book）**
- チャプター管理
  - タブ切り替え
  - 追加 / 削除 / 名前変更（ダブルクリック）
  - 右クリックメニュー（削除）
- 各チャプターは独立した TipTap エディタ
- **自動見出し番号（本のような採番）** … 下記「ブック自動見出し番号」要件参照

##### ブック自動見出し番号（Book Auto-Numbering）要件

> ブックを書籍のように、章・見出しへ自動で階層番号を付与する。手入力不要・並べ替え/追加に自動追従。

- **方針**：**表示時に計算するだけ（本文 TipTap JSON には書き込まない＝可逆・OFFで元通り）**。採番ロジックは `apps/web/src/lib/bookNumbering.ts`。
  - `toKanji(n)`：1〜99の漢数字（章番号用）
  - `chapterLabel(index, title)`：章ラベル「第一章」＋カスタム名（デフォルト名「第1章/第一章」は番号へ統合し二重表示防止）
  - `numberHeadings(headings)`：見出し階層番号 `1 / 1.1 / 1.1.1` をチャプター内ローカルで算出
- **章番号の書式**：漢数字「第一章」（確定）。将来 算用数字 / Chapter N / 1.2.3 式を選べるようにする想定。
- **Phase 1（実装済み・2026-06-15）**
  - チャプタータブ（`/notion-plus/[id]` と 記録モーダル）に「第一章」を自動表示
  - 目次（BookTocView）：章に「第一章」、各見出しに `1 / 1.1 / 1.1.1` を自動表示
- **Phase 2（実装済み・2026-06-15）**：エディタ本文の見出しにも番号を表示。**CSSカウンタ方式**（`.notion-editor-booknum` クラス＋`editor.css` の `counter-reset/increment` と `::before`）で実装。本文 TipTap JSON は不変＝可逆。NotionEditor の `numberHeadings` プロパティで切替（ブックのチャプターエディタからのみ ON）。設定 `bookNumberHeadings`（既定 ON）で表示/非表示を切替可。
- **章番号の書式は変更可能（実装済み・2026-06-15）**：設定 `bookChapterFormat` で `kanji`（第一章）/ `arabic`（第1章）/ `chapter`（Chapter 1）/ `none`（番号なし）を選択。`chapterLabel(index, title, format)` が書式に応じてラベル生成。UI はページ右上⚙メニュー（ブックのときだけ「章番号の書式」「本文に見出し番号」を表示）。設定は `settingsStore`（localStorage）に全体既定として保持。
- **Phase 3（未）**：ブック個別の ON/OFF・書式上書き（`page` 側にフィールドを持たせ、全体既定を上書き）。

##### ページテーブル（ページリンク整理ボード）

> 子ページが増えてフラットになりがちなリンクを、**大見出し（セクション）＋列（小見出し）＋各列にページリンクの縦並び**で手配置して整理する「目次ボード（MOC）」。要件定義の正本は `ページテーブル要件定義.md`。

- **形態**：本文に挿す **TipTap カスタムノード `pageTable`**（`NotionEditor.tsx`）。スラッシュコマンド **`/ページテーブル`** で挿入。1ページに複数可。
- **表示デザイン（2026-06-16・コールアウト/カンバン化）**：枠線の表をやめ、**Trello風カンバン＋コールアウト**に。列＝淡色の角丸リスト（既定グレー・`color`で6色変更可・`width`でドラッグ幅変更160〜520px）、各リンク＝白い角丸カード（ページ絵文字＋ページ名・装飾アイコンは無し・**ドラッグでリスト間移動/並べ替え**）、下部に「＋カードを追加」、リストは横並び＋折り返し。**大見出しは大きめ(text-xl)＋セクションごとに枠で囲める(`framed`・既定ON)。セクション設定⚙で枠ON/OFF・リスト追加・削除。** `PtColumn.color?/width?`・`PtSection.framed?` を追加（既存データは自動でこの表示に・移行不要）。
- **データ**：ノード `attrs.sections`（`PtSection[]= {id,title,columns:[{id,heading,links:[{href,title,icon}]}]}`）に保持。**本文JSON内・新規Firestoreコレクション不要・本文非破壊**。リンクのアイコン/ページ名は `notionPageStore` からライブ表示（リネーム追従）。
- **実装済み機能（Phase 1＋2・2026-06-16）**：
  - 大見出し・小見出しのインライン編集
  - セクション：追加 / 削除 / 上下並べ替え
  - 列：追加 / 削除 / 左右並べ替え
  - リンク：**既存ページ検索追加** / **新規サブページ作成して追加**（現在ページの子にする）/ 削除 / 列内上下並べ替え / **切り取り→貼り付け（列・セクションをまたいで移動）**
  - リンククリックで遷移（モーダル内は `PageNavigationContext`）
- **親子追従（A案・ノート/ブック統一）**：`extractPageLinkIds`（`notion-plus/[id]/page.tsx`）が `pageTable` 内リンクも拾い、`reconcileChildrenParent` でこのページ（ブックならブック）の子へ `parentId` を付け替え。**ノート保存(handleSave)・ブックチャプター保存(handleBookChapterSave)の両方で実行**＝既存ページを追加すると必ずこのページの子になる（「整理＝束ねる」）。
- **新規ページ作成**は `EditorPageIdContext` で現在ページIDを取得し `parentId` を直接設定。
- **Phase 3（未）**：未配置の子ページ自動収集 / 表示オプション（アイコンON/OFF・列幅・色）/ リンクごとのメモ / 切れリンクのグレーアウト。
- **モバイル（RN）**：未対応（Web/デスクトップ優先・要追って対応）。

##### テーブルビュー（ページ＋説明の表）

> 看板（ページテーブル）と同じ並びの新ビュー。**1行＝「左セル：ページリンク／右セル：そのページの説明文」**の2列テーブル。「どのページが何の用か」を一覧で見せたいときに使う。

- **形態**：本文に挿す **TipTap カスタムノード `pageDescTable`**（`NotionEditor.tsx`）。スラッシュコマンド **`/テーブルビュー`** で挿入（看板の隣）。1ページに複数可。
- **データ**：ノード `attrs` に保持（本文JSON内・新規Firestoreコレクション不要）。`rows`（`PdRow[]= {id,href,title,icon,desc}`）＋ `title`（表の見出し・任意）＋ `leftLabel`/`rightLabel`（列名・既定「ページ」「説明」）＋ `headerColor`（ヘッダー行の背景色・既定なし＝淡グレー）＋ `leftWidth`（左列幅・既定240px）。ページのアイコン/名前は `notionPageStore` からライブ表示（リネーム追従）。
- **機能**：行追加（**既存ページ検索追加** / **新規サブページ作成して追加**＝現在ページの子にする）／説明文の編集（自動で高さが伸びるテキスト）／行の削除・上下移動・**ドラッグ並べ替え**／左列幅のドラッグリサイズ／列名・表タイトルの編集／**ヘッダー行の背景色変更**（ヘッダーにホバー→色丸ボタン→`CALLOUT_BG_COLORS` パレット）／ページリンククリックで遷移（モーダル内は `PageNavigationContext`）。
- **重複排除＆親子追従**：看板と同じ思想。表に入れたページは本文中の単体リンクを自動削除（`removeBodyPageLink`）。`extractPageLinkIds` / `contentHasPageLink` が `pageDescTable` の `rows[].href` も拾うので、子ページリンク自動補完の二重化を防ぎ、`reconcileChildrenParent` でこのページの子へ `parentId` を付け替える。
- **モバイル（RN）**：`/editor-mobile` に **読み取りスタブ `PageDescTableStub`**（ページリンク＋説明を表示・タップで遷移）。未知ノードによる本文消失を防止。

#### ページ操作

- お気に入り登録（★ ボタン）
- アイコン変更（80種絵文字 + URL）
- ページ削除（子孫ページ一括削除）
- ページ履歴表示（タイムスタンプ付き最新20件）
- ドラッグ ＆ ドロップ並び替え（`DragHandleExtension`）

#### 設定メニュー（ページ右上⚙）

- レイアウト：センター / 左寄せ
- 行間設定（段落 / ソフト改行）
- 書式の位置調整ダイアログ
  - 箇条書き / 番号付きリスト / チェックリスト / H1-H4 / 段落 / 引用（0.1px単位）
  - ドラッグハンドル縦位置（0.5px単位、0=中央基準）
- 章番号の書式（**ブックのときだけ表示**）：第一章 / 第1章 / Chapter 1 / なし（`bookChapterFormat`）
- チャプター名を先頭に表示（**ブックのときだけ表示**）：ON/OFF トグル（`bookShowChapterHeading`）。ON で固定書式バーの**下**に章ラベルをセクション見出し（左アクセントバー＋下区切り線）として表示
- 本文に見出し番号（**ブックのときだけ表示**）：ON/OFF トグル（`bookNumberHeadings`）
  - 番号の色：プリセット7色＋カラーピッカー（`bookHeadingNumberColor`、番号ONのときだけ表示）

---

### 4.5 カテゴリページ（`/categories`）

- 3階層（大・中・小）カテゴリ管理
- ツリービュー（インデント表示）
- インライン編集（ダブルクリック）
- 色選択（12色プリセット、`0xAARRGGBB` Flutter 互換形式）
- 子カテゴリ追加（小カテゴリまで）
- 削除時に子孫・関連アイテム数を警告ダイアログで表示
- アイテム使用数バッジ

---

### 4.6 目標ページ（`/goals`）

- ステータス：未着手 → 学習中 → 習得済み（3段階）
- 優先度：高 / 中 / 低
- フィルタータブ：全て / 学習中 / 未着手 / 習得済み
- 追加モーダル：タイトル・カテゴリ（6プリセット+自由）・優先度・メモ
- ステータス切替ボタン（→ 次へ）
- 編集 / 削除

---

### 4.7 特急メモページ（`/quick-memo`）

- 日付別 TipTap エディタ（`dailyMemos` コレクション）
- 日付セクション展開 / 折りたたみ
- テーブルデフォルトジェネレータ（No・内容・✓ 列）
- デフォルト行数設定（1〜20行、localStorage 保存）
- セクション右クリックメニュー（削除）

---

### 4.8 要改修リストページ（`/improvements`）

- アクティブタスク：ドラッグ並び替え
  - インライン編集（名前・詳細）
  - 完了ボタン（円形チェック）/ 削除ボタン
- 完了済みセクション（展開 / 折りたたみ）
  - 「戻す」ボタン（完了→未完了）

---

### 4.9 設定ページ（`/settings`）

**一般**
- 復習間隔：5段階（翌日 / 3日後 / 7日後 / 2週間後 / 1ヶ月後）
  - 各段階の日数をスライダーで調整
  - デフォルトに戻すボタン

**通知（Electron のみ）**
- 復習通知時刻（HH:MM 形式）

**バックアップ（Electron のみ）**
- 自動バックアップ時刻設定
- ローカル保存先表示
- Google Drive バックアップ先選択（フォルダピッカー）
- 前回バックアップ時刻 / 成功 / 失敗表示
- 「今すぐバックアップ」ボタン

**アプリ操作（Electron のみ）**
- PC 起動時に自動起動（トグル）
- 「アプリを再起動」ボタン

**アカウント**
- ログインユーザーのメールアドレス表示
- 「サインアウト」ボタン

**バージョン**
- 現在のバージョン表示
- Electron 版：最新バージョン確認・更新通知

---

## 5. データモデル

### 5.1 LearningItem

```ts
interface LearningItem {
  id: string;
  dateKey: string;           // YYYY-MM-DD（登録日、ローカルタイムゾーン）
  categoryId?: string;
  title: string;
  url?: string;
  content: string;           // マークダウン or テキスト
  importance?: 'high' | 'medium' | 'low';
  reviews: ReviewRecord[];   // 5段階復習スケジュール
  sortOrder: number;
  createdAt?: string;        // ISO 8601
  notionPageId?: string;     // NotionPlus ページ紐付け
  notionPagePath?: string;   // 「ページ名 > セクション名」形式
}

interface ReviewRecord {
  stageIndex: number;        // 0=翌日 / 1=3日後 / 2=7日後 / 3=2週間後 / 4=1ヶ月後
  scheduledDate: string;     // YYYY-MM-DD
  completed: boolean;
}
```

**復習ステージ定数**：`[1, 3, 7, 14, 30]`（日数）

**主要ユーティリティ関数**：
- `hasDueReview(item)` → 本日以前に未完了の復習があるか
- `isFullyCompleted(item)` → 全ステージ完了か
- `getNextStageIndex(item)` → 次の未完了ステージインデックス
- `recalcNextReview(reviews, stageIndex, dateKey, stageDays)` → 復習完了時の次回日程再計算
- `createReviews(dateKey, stageDays)` → 初期復習スケジュール生成
- `localDateKey(d?)` → ローカルタイムゾーンで YYYY-MM-DD 文字列

---

### 5.2 LearningCategory

```ts
interface LearningCategory {
  id: string;
  name: string;
  colorValue: number;    // 0xAARRGGBB（Flutter Color 互換）
  parentId?: string;     // undefined = 大カテゴリ / 大カテゴリID = 中 / 中ID = 小
  sortOrder: number;
}
```

**ユーティリティ関数**：
- `categoryLevel(cat, allCats)` → 0=大 / 1=中 / 2=小
- `categoryAndDescendants(id, allCats)` → カテゴリと全子孫のIDセット
- `categoryPath(id, allCats)` → 「大 › 中 › 小」形式の文字列
- `colorValueToHex(colorValue)` → `#RRGGBB` CSS 形式

---

### 5.3 NotionPage

```ts
interface NotionPage {
  id: string;
  title: string;
  content: string;       // ノート: TipTap JSON / データベース: DbSchema JSON / ブック: chapters JSON
  parentId?: string;     // 親ページ ID（undefined = ルートページ）
  icon: string;          // 絵文字 or 画像URL
  order: number;         // 同一階層内の並び順
  updatedAt: string;     // ISO 8601
  isFavorite: boolean;
  type?: 'page' | 'database' | 'book';  // undefined = 'page' 扱い
  notionId?: string;     // Notion API のページID（インポート重複防止）
}

interface BookChapter {
  id: string;
  title: string;
  content: string;       // TipTap JSON
  order: number;
}

interface PageHistorySnapshot {
  id: string;            // {pageId}_{timestamp}
  pageId: string;
  title: string;
  content: string;
  savedAt: string;       // ISO 8601
}
```

**ブック コンテンツのシリアライズ形式**：
```json
{ "chapters": [{ "id": "...", "title": "...", "content": "...", "order": 0 }] }
```

---

### 5.4 NotionDatabase

```ts
type DbPropertyType =
  'title' | 'text' | 'number' | 'select' | 'multiselect' |
  'checkbox' | 'date' | 'url';

type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max';

interface DbProperty {
  id: string;
  name: string;
  type: DbPropertyType;
  options?: string[];    // select / multiselect 用の選択肢
}

interface DbSchema {
  properties: DbProperty[];
  aggregations?: Record<string, AggregationType>;  // key = propertyId
}

interface DbRow {
  id: string;
  databaseId: string;
  cells: Record<string, string | number | boolean | null>;
  pageContent?: string;  // TipTap JSON（行の詳細ページ）
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

---

### 5.5 Goal

```ts
interface Goal {
  id: string;
  title: string;
  category: string;              // 自由テキスト
  priority: 'high' | 'medium' | 'low';
  memo: string;
  status: 'todo' | 'learning' | 'done';
  order: number;
  createdAt: string;
}
```

---

### 5.6 DailyMemo

```ts
interface DailyMemo {
  id: string;       // YYYY-MM-DD
  content: string;  // TipTap JSON
  createdAt: string;
  updatedAt: string;
}
```

---

### 5.7 ImprovementTask

```ts
interface ImprovementTask {
  id: string;
  name: string;
  detail: string;
  completed: boolean;
  order: number;
  createdAt: string;
}
```

---

## 6. Firestore コレクション設計

**パス構造**: `users/{uid}/{collection}/{docId}`

| コレクション | ドキュメントID | 主要フィールド |
|---|---|---|
| `learningItems` | UUID | dateKey, title, content, reviews[], notionPageId |
| `categories` | UUID | name, colorValue, parentId, sortOrder |
| `goals` | UUID | title, status, priority, order |
| `notionPages` | UUID（workspace固定） | title, content, type, parentId, isFavorite |
| `notionPageHistory` | `{pageId}_{timestamp}` | pageId, title, content, savedAt |
| `notionDatabaseRows` | UUID | databaseId, cells, order |
| `memos` | UUID | title, content, order |
| `dailyMemos` | YYYY-MM-DD | content, updatedAt |
| `improvementTasks` | UUID | name, detail, completed, order |

**特記事項**：
- ワークスペースページ ID = `"workspace"`（旧: `"__workspace__"`、移行済み）
- `batchUpsert` / `batchDelete` は 500件 単位でチャンク処理
- 子孫ページの削除は `notionPageStore.remove()` が再帰的に収集してバッチ削除

---

## 7. 状態管理（Zustand ストア）

### 全ストア一覧

| ストア | Firebase 同期 | persist | 用途 |
|---|---|---|---|
| `authStore` | ✓（onAuthStateChanged） | - | 認証状態 |
| `learningStore` | ✓（subscribeCol） | - | 学習アイテム |
| `categoryStore` | ✓（subscribeCol） | - | カテゴリ |
| `goalStore` | ✓（subscribeCol） | - | 目標 |
| `notionPageStore` | ✓（subscribeCol） | - | ノートページ |
| `notionDatabaseRowStore` | ✓（subscribeWhere） | - | データベース行 |
| `dailyMemoStore` | ✓（subscribeCol） | - | 日次メモ |
| `memoStore` | ✓（subscribeCol） | - | メモ |
| `improvementTaskStore` | ✓（subscribeCol） | - | 改修タスク |
| `settingsStore` | - | ✓（localStorage） | 設定 |

### 初期化フロー

```
App 起動
  → authStore.init() で認証リスナー登録
  → ログイン確認
  → 各ストアの subscribe(uid) を layout.tsx で呼び出し
  → Firestore がリアルタイム更新を配信
```

---

## 8. API ルート仕様

### 8.1 POST `/api/ai-triage`

**用途**：特急メモを Claude Haiku で分析し、配置先候補ページを提案

**リクエスト**：
```ts
{
  title: string;
  content: string;
  pages: Array<{ id: string; title: string; icon: string; path: string }>;
}
```

**レスポンス**：
```ts
{
  suggestions: Array<{
    pageId: string;
    reason: string;
    score: number;
  }>;
  refinedTitle: string;
  refinedContent: string;
}
```

**LLM**：`claude-haiku-4-5-20251001`  
**環境変数**：`ANTHROPIC_API_KEY`（`.env.local`）

---

### 8.2 GET `/api/url-preview`

**用途**：URL のメタデータ（タイトル・ファビコン）取得

**クエリパラメータ**：`url`

**レスポンス**：
```ts
{
  title: string;
  favicon: string;
  url: string;
}
```

**設定**：タイムアウト 5秒、失敗時はドメイン名をタイトルに使用

---

### 8.3 POST `/api/notion-import`

**用途**：Notion ページ・データベースを TipTap 形式に変換してインポート

**Runtime**：Edge Runtime

**アクション**：

① `fetch-node`：1ノード取得（子ページIDリスト含む）
```ts
{
  action: 'fetch-node';
  notionPageId: string;
}
```

② `import-url`：URLから全ツリーをストリーミングインポート
```ts
{
  action: 'import-url';
  url: string;
}
```

**変換対応ブロック**：
- paragraph / heading_1〜3 / bulleted_list_item / numbered_list_item
- to_do / quote / code / divider / table
- callout / image / child_page / child_database / link_to_page

**テキスト装飾**：bold / italic / strikethrough / code / color（CSS カラーマップ）

**同時リクエスト制御**：セマフォ（最大 3並列、Notion API レート制限対策）

**環境変数**：`NOTION_TOKEN`

---

## 9. 主要コンポーネント

### 9.1 NotionEditor（`apps/web/src/components/editor/NotionEditor.tsx`）

TipTap ベースのリッチエディタ。全ノートページで共用。

**Props**：
```ts
interface NotionEditorProps {
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => Promise<void>;
  onCreateSubPage?: () => Promise<{ id: string; title: string }>;
  recordTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onRecordText?: (text: string) => void;
  notionPageId?: string;
  notionPagePath?: string;
  highlightText?: string;       // 通知からのハイライト
  onPageNavigate?: (href: string) => void;  // モーダル内ページ遷移
  hideTitle?: boolean;          // ブック用：タイトル非表示
  compact?: boolean;
  onEditorFocus?: () => void;
  hideToolbar?: boolean;
}
```

**カスタム TipTap 拡張**：
- `ResizableImage`：ドラッグリサイズ対応画像
- `ResizableYoutube`：YouTube 埋め込み
- `CustomTableCell` / `CustomTableHeader`：テーブルセル
- `PageLinkNode`：ページ間リンク
- `UrlMentionNode`：URL プレビューノード
- `CalloutNode`：コールアウトブロック
- `ToggleHeadingNode`：折りたたみ見出し（`_ ` 入力で作成）
- `TocNode`：目次ノード
- `InlineDatabaseNode`：インラインデータベース参照
- `DragHandleExtension`：ブロックドラッグ&ドロップ
- `AnnotationMark`：テキストアノテーション
- `MarkdownBulletShortcut`：`- ` でリスト作成
- `MarkdownCodeBlockShortcut`：` ``` ` + スペースでコードブロック作成

**自動保存**：テキスト変更から一定時間後に `onSave` 呼び出し

---

### 9.2 DragHandleExtension（`apps/web/src/components/editor/DragHandleExtension.ts`）

ProseMirror Plugin として実装。外部ライブラリ不要の自前実装。

**動作**：
- `document` レベルで mousemove を監視
- ホバー中のトップレベルブロックを検出
- `body` 直下に fixed で `⋮⋮` ハンドル配置
- ドラッグ中にオートスクロール（dragover + rAF ベース）

**縦位置計算**：`rect.top + rect.height / 2 - 8 + _offset`  
（`_offset` は `setDragHandleVertOffset()` で外部から設定可能）

---

### 9.3 AddItemDialog（`apps/web/src/components/notion/AddItemDialog.tsx`）

学習アイテム登録用の全画面モーダル。

**主な状態**：
- `selectedPageId`：選択中の NotionPlus ページ
- `bookChapters` / `activeChapterId`：Book ページのチャプター管理
- `confirming`：登録確認ダイアログの表示制御
- `bigToast`：登録完了の大型トースト
- `newPageDialog`：新規ページ作成ダイアログ
- `contextMenu`：右クリックメニュー

---

### 9.4 DatabaseView（`apps/web/src/components/notion/DatabaseView.tsx`）

データベースタイプのページを表示するコンポーネント。

**機能**：
- スキーマ編集（プロパティ追加 / 削除 / 型変更 / 選択肢管理）
- セルインライン編集（型に応じた UI）
- 行追加 / 削除 / D&D 並び替え
- 集計行（count / sum / avg / min / max）

---

## 10. 設定・永続化

### settingsStore（localStorage persist）

**キー**：`"study-tracker-settings"`

| 設定項目 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `reviewStageDays` | `number[]` | `[1,3,7,14,30]` | 復習間隔（日数）|
| `notionPlusLayout` | `'center' \| 'left'` | `'center'` | ノートレイアウト |
| `notionPlusParaLineHeight` | `number` | `1.7` | 段落行間 |
| `notionPlusSoftLineHeight` | `number` | `1.15` | ソフト改行行間 |
| `notionPlusBlockOffsets` | `NotionBlockOffsets` | 全 0 | ブロック Y 位置調整（9種） |
| `reviewNotificationTime` | `string` | `'08:00'` | 復習通知時刻 |
| `quickMemoDefaultRows` | `number` | `5` | 日次メモテーブルデフォルト行数 |
| `lastViewedNotionPageId` | `string \| null` | `null` | 前回表示 NotionPlus ページ |
| `dragHandleOffset` | `number` | `0` | ドラッグハンドル縦位置オフセット(px) |
| `bookChapterFormat` | `'kanji' \| 'arabic' \| 'chapter' \| 'none'` | `'kanji'` | ブック章番号の書式 |
| `bookNumberHeadings` | `boolean` | `true` | ブック本文に見出し番号(1.1)を表示 |
| `bookHeadingNumberColor` | `string` | `'#9ca3af'` | ブック見出し番号の文字色（CSS変数 `--booknum-color`） |
| `bookShowChapterHeading` | `boolean` | `true` | チャプター名をページ先頭に大きく表示 |

**NotionBlockOffsets**（ブロック別 Y 位置調整）：
```ts
{
  bullet: number;     // 箇条書き
  ol: number;         // 番号付きリスト
  check: number;      // チェックリスト
  h1: number;         // 見出し1
  h2: number;         // 見出し2
  h3: number;         // 見出し3
  h4: number;         // 見出し4
  p: number;          // 段落
  blockquote: number; // 引用
}
```

---

## 11. エディタ（TipTap）仕様

### 対応フォーマット・入力ショートカット

| 入力 | 変換結果 |
|---|---|
| `# ` | 見出し H1 |
| `## ` | 見出し H2 |
| `### ` | 見出し H3 |
| `- ` | 箇条書きリスト |
| `1. ` | 番号付きリスト |
| ` ``` ` + スペース | コードブロック |
| `_ ` | 折りたたみ見出し（ToggleHeading） |
| `**text**` | 太字 |
| `*text*` | 斜体 |
| `~~text~~` | 打消し線 |
| `` `text` `` | インラインコード |

### ツールバーボタン

見出し（H1〜H4） / 太字 / 斜体 / 打消し / 下線 / コード / リンク / 画像 / テーブル / リスト / コードブロック / 引用 / 横線 / テキストカラー / ハイライト / 左寄せ / 中央 / 右寄せ / 目次 / URL メンション

### CSS 変数（行間・位置調整）

```css
--para-line-height: /* notionPlusParaLineHeight */
--soft-line-height: /* notionPlusSoftLineHeight */
--offset-bullet: /* blockOffsets.bullet px */
--offset-ol: /* blockOffsets.ol px */
--offset-check: /* blockOffsets.check px */
--offset-h1: /* blockOffsets.h1 px */
--offset-h2: /* blockOffsets.h2 px */
--offset-h3: /* blockOffsets.h3 px */
--offset-h4: /* blockOffsets.h4 px */
--offset-p: /* blockOffsets.p px */
--offset-blockquote: /* blockOffsets.blockquote px */
```

---

## 12. 配信フロー

### 全プラットフォーム一括配信

```bash
npm run dist:win:sync
```

**自動処理順序**：
1. `electron/build-info.json` → patch +1、buildNumber +1
2. `apps/web/src/lib/version.ts` → バージョン文字列更新
3. `apps/mobile/version.json` → 更新
4. 起動中の `学習トラッカー.exe` を終了
5. Electron Windows アプリをビルド（`dist-electron/win-unpacked`）
6. `robocopy` で Google Drive（`.sync-dest` パス）に同期 → デスクトップ配信完了
7. Android APK ビルド（assembleRelease、失敗時 assembleDebug）
8. APK を Google Drive にコピー
9. GitHub Release に APK アップロード → Android 配信完了
10. `git add -A && git commit && git push origin master` → Vercel 自動デプロイ → Web 配信完了

### Web のみ更新

```bash
git add -A && git commit -m "..." && git push origin master
```

### 前提条件

- `.sync-dest`：Google Drive 同期先パスが記載されていること
- `gh` CLI：インストール済み・認証済み（GitHub Release アップロードに使用）
- Android SDK / JAVA_HOME：設定済み（スクリプト内でパスを自動設定）

---

## 13. 改修ログ

> **機能追加・変更があったら必ずここに追記すること**

| 日付 | バージョン | 内容 |
|---|---|---|
| 2026-06-26 | （次回配信） | バグ修正（根本原因）：**「戻る」でスクロール位置が復元されず常に最上部に飛ぶ**問題を解消。原因＝記憶/復元が `<main>` を監視していたが、実際にスクロールするのは `<main>` ではなく **NotionEditor 内の本文枠（overflow-y-auto の div）**。ページが `<main>` を `h-full` で埋めるため `<main>` 自身はスクロールせず、位置が一切保存されていなかった。対策＝本文枠に `data-scroll-container` を付与し、scroll は capture フェーズで document から拾って保存／復元時は枠を rAF で探して当て込む（後から描画されても・ノート/ブックで枠が変わっても確実）。NotionEditor.tsx（data-scroll-container）/ notion-plus/[id]/page.tsx |
| 2026-06-26 | （次回配信） | 改善：テーブルビューのヘッダー色ボタンが**ホバーでしか出ず気づけない**ため、**常時表示の「●色」ボタン＋ヘッダー右クリック**でも色メニューを開けるように（discoverability 向上）。NotionEditor.tsx PageDescTableView |
| 2026-06-26 | （旧・置換済） | 改善：**ページに入って「戻る」と、元のスクロール位置まで確実に戻る**ように強化。本文(エディタ)は遅れて高さが確定するため従来の1200ms打ち切りでは届かないことがあった。`ResizeObserver`で本文の高さ変化に追従しつつ毎フレーム当て込み（最長2.5秒）、到達して安定したら離す、ユーザーが自分でスクロール/キー操作したら即中断（勝手に動かさない）に作り直し。notion-plus/[id]/page.tsx（スクロール位置の復元 effect） |
| 2026-06-26 | （次回配信） | 改善：**テーブルビューのヘッダー行の背景色を変更可能**に（`headerColor` 属性・ヘッダーにホバーで色丸ボタン→`CALLOUT_BG_COLORS`パレット・最前面ポータル）。NotionEditor.tsx（PageDescTableView/PageDescTableNode）/ editor-mobile も属性を round-trip 保持。 |
| 2026-06-26 | （次回配信） | 新機能：**テーブルビュー（ページ＋説明の表）**。看板（ページテーブル）と同じ並びの新ビューで、スラッシュ `/テーブルビュー` で挿入する TipTap ノード `pageDescTable`。1行＝「左：ページリンク／右：そのページの説明文」。行追加（既存ページ検索＋新規サブページ作成）・説明の編集（自動高さ）・行の削除/上下移動/ドラッグ並べ替え・左列幅リサイズ・列名/タイトル編集。看板と同じく表に入れたページの本文単体リンクは自動削除し、`extractPageLinkIds`/`contentHasPageLink` に `rows[].href` を拾わせて二重リンク補完を防止＋親子付け替えに追従。モバイル(/editor-mobile)は読み取りスタブ `PageDescTableStub` を追加（未知ノードで本文が空になる事故を防止）。NotionEditor.tsx（PageDescTableView/PageDescTableNode）/ notionPageStore.ts / notion-plus/[id]/page.tsx / editor-mobile/page.tsx |
| 2026-06-25 | （Web配信） | 新機能：**Chromeクリッパー拡張＋Web記録ページ `/clip`**。見ているWebページや選択テキストをChrome拡張（ツールバー⚡／右クリック「StudyTrackerに記録」）から `/clip` を小ポップアップで開き、**ログイン済みWebセッション**で「特急メモ」(learningItems・title/content/url)へ1件記録。拡張側に認証を持たせない設計（Google Cloud設定不要）。記録画面=apps/web/src/app/clip/page.tsx（Suspense+useSearchParams、未ログイン時はその場でGoogleログイン、保存後window.close）。拡張本体=リポジトリ直下 clipper-extension/（MV3・manifest/background.js/icons、専用CLAUDE.md＋StudyTrackerクリッパー仕様書.md）。 |
| 2026-06-25 | （次回配信） | バグ修正：**空（カーソルだけ）の箇条書き行でカーソルがマーカーとズレる**問題を修正。`editor.css` の `p:has(br)`（Shift+Enterソフト改行用に行間を詰めるルール）が、ProseMirrorが空段落へ自動挿入する末尾`<br class="ProseMirror-trailingBreak">`にも当たり、空の箇条書きだけ行間がsoft-lh(1.15)になってカーソル高さがマーカー(para-lh基準)とズレていた（入力すると直る現象の正体）。セレクタを `p:has(br:not(.ProseMirror-trailingBreak))` にして末尾自動brを除外。editor.css |
| 2026-06-25 | （次回配信） | 改善：**インラインDB行ページのポップアップでプロパティも編集可能に（Phase 2b）**。DatabaseViewのセルエディタ群（Text/Number/Select/MultiSelect/Checkbox/Date/Url）と配色/型アイコンを共有モジュール `components/database/cells.tsx` に切り出し、DatabaseViewとインラインDBポップアップの両方で使用（循環import回避）。ポップアップでタイトル以外も `saveCell`（直近行へマージしてupdateRow）でその場編集。NotionEditor.tsx / DatabaseView.tsx / cells.tsx |
| 2026-06-25 | （次回配信） | 新機能：**インラインDBの行クリックでその行のページをその場でポップアップ表示（Notionのピーク風・Phase 2a）**。本文埋め込み表の行をクリックすると、ノートを離れず中央モーダルでその行のページが開く（`InlineRowPagePopup`・`createPortal`でbody直下に描画）。タイトル編集（`updateRow`）＋ページ本文編集（`NotionEditor`+`updateRowContent`で`pageContent`へ）。プロパティ（タイトル以外）は色チップ等で表示のみ、フル編集は「↗ 本体で開く」からDB本体の既存`RowPageModal`へ。Esc/背景クリック/✕で閉じる。NotionEditor.tsx（InlineRowPagePopup・renderDbCellを共通化）。要件=インラインDB要件定義.md §Phase 2a |
| 2026-06-25 | （次回配信） | 改善：**本文埋め込みデータベース（インラインDB）のプレビューをNotion風にリッチ化（Phase 1）**。①**列幅をドラッグで自由変更**（ヘッダー右端ハンドル・最小60px・`table-layout:fixed`＋`colgroup`）。幅は**埋め込みごと**にノード属性 `inlineDatabase.colWidths`（`{[propId]:px}`）へ保存（DB本体の幅は変えない／初期値は `colWidths→DB側width→型別既定`）。②**選択肢を色付きタグチップ**（select/multiselect・本体DatabaseViewと同じ7色）③**チェックボックスを☑/☐**④ヘッダーに**型アイコン**⑤**行ホバー反転**・件数バッジ・角丸＋影でカード化・はみ出しは…省略⑥フッターを「＋ 他N行を表示」に。要件定義=インラインDB要件定義.md（Phase2以降の計画も記載）。NotionEditor.tsx（InlineDatabaseEmbed/InlineDatabaseNode） |
| 2026-06-25 | （次回配信） | 新機能：**NotionPlusでスクロール位置を記憶**。ページ内のリンクから子ページに入って戻ったとき、元ページの**さっき見ていたスクロール位置に復元**する（従来は先頭に戻っていた）。スクロール容器の `<main>`（(app)/layout.tsx）の位置をページIDごとにモジュールMap `scrollByPage` に記録し、戻った際に復元。本文エディタは遅れて高さが決まるため rAF で最大1.2秒リトライして確実に届かせる。通知ハイライト(`?hl=`)・章ディープリンク(`?chapter=`)のときは復元せずそちらを優先。セッション中のみ保持（章記憶 `lastChapterByBook` と同方式）。notion-plus/[id]/page.tsx |
| 2026-06-23 | （次回配信） | バグ修正：**看板（ページテーブル）の「＋ 新規ページを作成して追加」が機能せず、押すと一瞬で閉じてカードが作れない**問題を修正。原因＝カード作成で `addPage` すると `pages.length` が即増える一方、看板へのリンク追記は本文の自動保存（約1.2秒デバウンス）後にしかストアへ反映されない。その保存前の一瞬に子ページリンク自動補完の useEffect が古い content を見て「リンクが無い」と誤判定し、本文末尾に重複リンクを足したうえ editorKey 再初期化でエディタを作り直す→追加したカードごと消えていた。対策＝補完処理を少し待って（1800ms）から**ストアの最新 content** を見て判断するようにし、看板保存の反映を取りこぼさないようにした。notion-plus/[id]/page.tsx |
| 2026-06-22 | （次回配信） | 新機能：**特急メモにインライン「✏️ 編集」ボタン**を追加。ダッシュボードの特急メモ（展開部）と「⚡ 特急」タブの両方に編集ボタンを配置。押すとタイトル＋本文を編集できる小さなモーダル（InboxEditModal）が開き、保存で learningStore.update を呼んで上書き。消化前にサッと直したいニーズに対応。learning/page.tsx |
| 2026-06-20 | （次回配信） | 改善：見出しインデントの「一度見出しを作ると延々インデントが続いて抜け出せない」問題を解消。①見出し行の先頭で **Backspace → 見出し解除（通常テキスト化）** ②カスケードをやめ **見出しの“直下の段”だけ1段(1.5rem)字下げ**し、**空行 or 次の見出しで字下げ終了**（＝そこから左端に戻れる）。見出し自身は下げない。表示のみ・非破壊。HeadingOutlineIndent.ts |
| 2026-06-20 | （次回配信） | バグ修正：**Android版で看板（ページテーブル）を含むページが真っ白**になる問題を修正。モバイルの /editor-mobile に pageTable のスタブが無く、setContent が未知ノードで失敗→本文消失していた。看板用 PageTableStub（大見出し/列/ページリンクを読取表示・タップでそのページへ遷移）を追加。さらに setContent 失敗時も白画面にせず空ページにフォールバックするよう堅牢化。※/editor-mobile は Vercel 配信なのでAPK再インストール不要・Web反映で既存Android即修正。editor-mobile/page.tsx |
| 2026-06-20 | （次回配信） | 新機能：**ページ（ブックは章）まるごとを復習に登録**。ページヘッダーに「🔁 ページを復習」ワンクリックボタン（DBは非表示）。learningItem を作成（isPageReview:true / title=ページ名・ブックは「ページ名 / 章名」/ content空 / notionPageId / ブックは chapterId・chapterTitle）し5段階の復習ルーティンへ。二重登録は確認メッセージ「既に復習登録されています。新しく登録しますか？」を出して任意で再登録、登録済みはボタンが「✓ 復習登録済み」表示。復習リストでは「📄 ページ全体／📖 章」バッジを表示。復習で開くときはハイライト無し（章は ?chapter= で該当章を開く＝ブックの章deep-link対応）。LearningItem(core)/notion-plus/[id]/page.tsx/learning/page.tsx |
| 2026-06-20 | （次回配信） | 新機能：**ページ内 検索＆置換（Ctrl+R）**。Ctrl/Cmd+R でエディタ右上に検索置換バーを表示（Electron/ブラウザのリロードは preventDefault で抑止）。検索（大小無視・件数表示・↑↓/Enter/Shift+Enterで前後移動・該当を選択しスクロール）、置換／すべて置換（末尾→先頭で位置ズレ防止・空欄置換＝削除）。NotionEditor.tsx（getMatches/selectMatch/replaceCurrent/replaceAll） |
| 2026-06-20 | （次回配信） | 新機能：**既存ページへのショートカット（ページリンク）挿入**。スラッシュ `/ページリンク` で既存ページ検索ピッカー（更新日時順・自分自身/DB除外）を開き、選ぶと本文に pageLink ブロックを挿入。クリックで大元ページへ遷移（本体は別の場所のまま、呼び出し口だけ配置）。NotionEditor.tsx（SlashCommand.openPageLinkPicker / insertPageShortcut / ピッカーポータル） |
| 2026-06-20 | （次回配信） | 新機能：**見出しごとのうっすら区切り線**。H1/H2 の上端に淡い線（H1=#ececec・H2=#f1f1f1）を引き、直前セクションの終わりを判別しやすくした。本文先頭の見出しは線なし。表示のみ。editor.css |
| 2026-06-20 | （次回配信） | 新機能：テーブルの**枠線スタイル切替**。ツールバー（テーブル内）に「枠線:標準/くっきり/枠なし」ボタンを追加し3段階で切替。table 要素に borderStyle 属性（data-border）を持たせ CSS で出し分け（strong=1.5px #6b7280／none=透明／標準=従来の薄グレー）。CustomTable / editor.css / NotionEditor.tsx |
| 2026-06-20 | （次回配信） | バグ修正：YouTube URL をメンション化するとタイトルが「- YouTube」になり拾えない問題を修正。url-preview API で YouTube は公式 oEmbed（youtube.com/oembed）から動画タイトルを取得するようにした（スクレイピングは同意ページでタイトルを取り逃すため）。api/url-preview/route.ts |
| 2026-06-20 | （次回配信） | 改善：URL貼り付けの挙動を変更。**まずURLをリンク付きで貼り付け**、その直後にポップアップで「メンション／YouTube埋め込み／URLのまま」を選べるようにした（従来は選択するまで何も挿入されなかった）。「URLのまま」は閉じるだけ。変換選択時は貼ったURL範囲(range)を置換。NotionEditor.tsx |
| 2026-06-20 | （次回配信） | 新機能：テーブルの**行・列にまとめて背景色**。ツールバー（テーブル内のみ表示）に「行色」「列色」を追加し、カーソルのある行/列の全セルへ一括で色付け。TableMap でセル位置を割り出し setNodeMarkup で backgroundColor を設定（色はTABLE_CELL_COLORS）。NotionEditor.tsx / applyTableLineColor |
| 2026-06-20 | （次回配信） | バグ修正：新規ノート作成（遷移）直後にクリック・キー入力を受け付けず、アプリを最小化→復帰すると直る問題を修正（Electron）。エディタ生成時(onCreate)に webContents へフォーカスを戻す IPC `focus-window` を呼び、エディタにカーソルを置く。electron/main.js・preload.cjs・layout.tsx(型)・NotionEditor.tsx |
| 2026-06-20 | （次回配信） | 看板のカード追加（既存ページ検索）の一覧を**更新日時の新しい順**に並べ替え。検索しなくても直近編集したノートが上に出る。NotionEditor.tsx filteredPages（updatedAt降順） |
| 2026-06-20 | （次回配信） | バグ修正：スラッシュコマンドメニューで矢印キー移動時にスクロールが追従せず選択項目が画面外に出る問題を修正。選択中ボタンに ref を付け slashIndex 変化時に scrollIntoView({block:'nearest'})。NotionEditor.tsx |
| 2026-06-20 | （次回配信） | コードブロック内で太字などのインラインマークを有効化（正攻法）。StarterKit同梱の codeBlock(marks:'') では `extendNodeSchema` で上書き不可だったため、`@tiptap/extension-code-block@3.23.4` を導入し `StarterKit codeBlock:false`＋`CodeBlock.extend({marks:'_'})` に差し替え。※`#`等のmarkdownショートカットはコード=リテラルのため意図的に無効のまま。NotionEditor.tsx |
| 2026-06-20 | （次回配信） | ブックが「別ページへ行って戻ると必ず第1章」に戻る問題を改善。ブックIDごとに最後に見た章を記憶（モジュールMap lastChapterByBook）し、再表示時に復元（セッション中）。notion-plus/[id]/page.tsx |
| 2026-06-20 | （次回配信） | 看板（ページテーブル）カードを右クリック→「📚 ブックに変換／📄 ノートに変換」を追加（本文ページリンクと同等。DBカードは変換不可表示）。NotionEditor.tsx PageTableView |
| 2026-06-20 | （次回配信） | 行間設定をプリセットボタン→**スライダー**化（Enter/Shift+Enter とも 1.00〜2.20・0.05刻み・現在値を数値表示）。ドラッグで本文に即反映＝手で触って微調整→確定できる。場所=NotionPlus ⚙設定。notion-plus/[id]/page.tsx |
| 2026-06-20 | （次回配信） | サイドバーの「★お気に入り」と「📄ページ一覧」の境目を明確化。各セクション見出しを色付きバー（お気に入り=amber-50/ページ一覧=gray-100）にし、区切り線を border-gray-200・余白拡大で強調。Sidebar.tsx |
| 2026-06-20 | （次回配信） | コードブロック内でも太字などインラインマークを使えるように（`extendNodeSchema` で codeBlock の marks を '_'＝全許可。既定は marks:'' で不可だった）。新拡張 CodeBlockAllowMarks。NotionEditor.tsx |
| 2026-06-20 | （次回配信） | 新機能：サイドバーのノートを**ダブルクリックで別ウィンドウ表示**。Web=新規タブ、Electron=`setWindowOpenHandler` に同一オリジン(APP_URL)分岐を追加し新しいアプリ窓として開く（従来は内部URLも openExternal で外部ブラウザ送りだった）。ツリー/検索結果/お気に入りの各ノートリンクに onDoubleClick → openNoteInNewWindow。Sidebar.tsx / electron/main.js |
| 2026-06-20 | （次回配信） | Shift+Enter 行間の選択肢を拡張（最大1.35→広1.7/特広2.0を追加）。詰まりすぎて使いづらい問題に対応。notion-plus/[id]/page.tsx（設定の「Shift+Enter 行間」） |
| 2026-06-17 | （次回配信） | バグ修正：ブックの固定書式バーがスクロールで流れて消える問題を修正。エディタ外枠(flex-1 overflow-y-auto)に `min-h-0` が無く、flexの min-height:auto で中身ぶん伸びて外側<main>がスクロール→sticky基準が非スクロール要素になり固定が効かなかった。stickyToolbar時に min-h-0 を付与しエディタ自身をスクロール容器化。NotionEditor.tsx |
| 2026-06-17 | （次回配信） | バグ修正：右クリックメニューの文字色/背景色だけ色をベタ書きしておりツールバー・コールアウト・セクションの正規パレットと食い違っていた（例: 黄の背景が右クリック#FDE68A vs 正規#FEF9CD）。右クリックを `TEXT_COLORS`/`BG_COLORS` に統一し見本も実際の適用色で表示。NotionEditor.tsx |
| 2026-06-17 | （次回配信） | 新機能「見出しアウトライン・インデント」：見出しの配下の本文を見出しレベルに応じて段階字下げ（H1配下=1段/H2自身=1段・配下=2段/…のカスケード、1段=1.5rem）。ProseMirrイデコレーション（padding-leftインライン）で表示のみ・content非破壊。新拡張 HeadingOutlineIndent.ts を全NotionEditorに追加。切り戻しはextensionsから外すだけ。NotionEditor.tsx |
| 2026-06-17 | （次回配信） | 箇条書きのマーカー(●○▪)と文字の縦位置ズレを修正。マーカー(::before)の行高が固定値(1.3/1.85)で本文の可変行高(--para-lh)と合っていなかったのを、`calc(var(--para-lh)/フォント倍率)` で本文と同じ行ボックスに揃えた。設定の余白調整では直らなかった縦ズレの根治。editor.css |
| 2026-06-17 | （次回配信） | ブックのチャプタータイトル表示を強化：本文H1(1.875rem)より小さかった(text-2xl)のを text-4xl(2.25rem)へ拡大し、淡い紫の背景パネル(bg-brand-50)＋左アクセントバー＋濃紫文字(text-brand-700)で目立たせた。※既存アクセントバーは未定義色 brand-400 で実質無色だったため brand-500 に修正。NotionEditor.tsx |
| 2026-06-17 | （次回配信） | ブック（固定書式バー）でチャプタータブ直下〜書式バーの間にできる無駄な空白帯を解消。エディタ外枠の上余白を `py-8`→`pt-2`（stickyToolbar時のみ・通常ページは従来通り py-8）。NotionEditor.tsx |
| 2026-06-17 | （次回配信） | 「現在の画像」プレビューをクリックで**全画面拡大（ライトボックス）**できるように。共通コンポーネント `IconImagePreview`（components/IconImagePreview.tsx・状態内蔵/createPortalで最前面・どこでもクリックで閉じる）を新設し、3か所（本文リンク/見出し/記録ダイアログ）のインライン実装を共通化。バグ分散を避けるため1コンポーネントに集約。 |
| 2026-06-17 | （次回配信） | 「現在の画像」プレビューを「学習リストに記録」ダイアログのアイコンピッカー（AddItemDialog.tsx）にも追加。これでページアイコンを設定できる3か所すべて（本文リンク/見出し/記録ダイアログ）で大きく確認できる。 |
| 2026-06-17 | （次回配信） | 上記の「現在の画像」プレビューを**ページ見出し（ヘッダー）のアイコンピッカー**にも追加（notion-plus/[id]/page.tsx）。当初は本文ページリンク側(NotionEditor.tsx)だけに入れていたが、ユーザーが使うのはヘッダー側だったため同じものを実装。ボタンではなく、画像アイコン時にピッカー先頭へ自動表示。 |
| 2026-06-17 | （次回配信） | ページリンクのアイコンが画像（外部URL/貼付）のとき、アイコンピッカー先頭に「現在の画像」の大きめプレビュー（max-h-44・object-contain）を表示。アイコンサイズだと何の画像か見えない問題への対応（表示のみ・新規state/モーダルなしで低リスク）。NotionEditor.tsx |
| 2026-06-17 | （次回配信） | ページテーブル（看板）セクションの背景色の選択肢を6色→16色に拡充（看板専用パレット `PT_SECTION_BG_COLORS`。黄/オレンジ/ベージュ/赤/ローズ/ピンク/紫/ラベンダー/藍/青/水色/ティール/緑/ライム/スレート/グレー）。コールアウト・列色は従来の `CALLOUT_BG_COLORS` のまま。NotionEditor.tsx |
| 2026-06-17 | （次回配信） | ページテーブル（看板）UI：常時表示の下部「＋ カードを追加」を廃止し、リスト見出し右の小さな「＋」ボタン（常時表示）に集約。見やすさ優先。空リストでもドロップできるようカード群に最小高さを確保。NotionEditor.tsx |
| 2026-06-17 | （配信基盤） | 配信スクリプト `build-and-sync.mjs` を `GH_TOKEN`(PAT) 依存から **gh CLI 認証ベース**に変更。`--publish never` でビルド後、ログイン済み gh CLI で Release を作成し setup.exe/blockmap/latest.yml/APK を公開＋version.json に downloadUrl 反映。`gh auth login` 済みならトークン設定不要（未認証時は Release だけスキップし Web は配信）。GH_TOKEN 未設定で自動更新が止まる事故の恒久対策 |
| 2026-06-17 | （次回配信） | バグ修正：看板（ページテーブル）に入れたページが本文に単体リンクとして二重表示される問題を修正。`addPageLinkToContent` が本文トップレベルの単体 `pageLink` しか見ておらず看板内のリンクを「無い」と誤判定→「子ページのリンク自動補完」effect が単体リンクを復活させていた。看板(`pageTable`)の中も再帰的に走査する `contentHasPageLink` を追加し、本文・看板のどこかに既存なら追加しないように。notionPageStore.ts（※既存の重複は手動で1度消せば以後復活しない） |
| 2026-06-17 | （次回配信） | バグ修正：本文中ページリンクの右クリックメニュー「✂️ 切り取り」が無反応だった問題を修正。`execCommand('cut')` の前にエディタへ `focus()` していなかったため cut イベントが ProseMirror に届かず何も切り取られなかった（正常に動く「貼り付け」と同手順に統一＝`chain().focus().setNodeSelection(pos).run()`）。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ページテーブル：セクション設定(⚙)に「枠線の太さ」(1〜4px)を追加（`PtSection.borderWidth?`・枠ありのとき表示・inline styleで適用）。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ページテーブル：セクション設定(⚙)に「背景色」を追加（枠の中＝セクション全体の背景。なし＋6色、`PtSection.bg?`）。背景色 or 枠があれば角丸＋余白のパネル表示。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ページテーブル カンバン高さ統一：①同列のリスト高さを揃える(`items-stretch`)。カード高さを `min-h-[34px]`＋アイコンを16px角の枠に収めて行高一定にし、絵文字/画像アイコンによる微妙な高さ差を解消（Youtube/LINE等のカードが同じ高さに）。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ページテーブル カンバン修正：②③色/セクション設定メニューがホバー枠内にありマウスを移すと消える問題を、最前面ポータル(fixed・座標算出)化で解消。④リスト見出しの操作ボタン(色/左右/削除)を同サイズ中央寄せ枠に統一し縦ズレ解消。⑤看板にページを追加したら本文中の同一ページの単体ページリンクを自動削除（重複排除＝看板を正の場所に・`removeBodyPageLink`）。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ページテーブル カンバン強化：①カードのドラッグ移動（リスト間/並べ替え・HTML5 DnD、↑↓ボタンは撤去）②大見出しを大きく(text-xl)③カードのアイコンと文字の縦位置を揃え(items-center)④リスト幅をドラッグでリサイズ(`PtColumn.width?`・右端ハンドル・160〜520px)⑤大見出しごとに枠でセクション化(`PtSection.framed?`・既定ON)⑥セクション設定(⚙)で枠ON/OFF・リスト追加・削除。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ページテーブルの見た目を「テーブル」→「Trello風カンバン＋コールアウトカード」に刷新。列＝淡色角丸リスト（色6種変更可・既定グレー）、リンク＝白い角丸カード、装飾アイコン無し、横並び＋折り返し。`PtColumn.color?` 追加（既存データ移行不要）。NotionEditor.tsx。※Google Driveバックアップ機能は撤去せず維持（更新には無関係なだけ）。 |
| 2026-06-16 | （次回配信） | 設定のアップデート確認の説明文が古かった（「Google Drive の version.json と比較します」）。実体は electron-updater(GitHub Release)＝Driveは更新に無関係なため「GitHub の最新リリースと比較します」に統一修正。settings/page.tsx（※Driveは main.js のデータバックアップ先機能としては存続） |
| 2026-06-16 | （次回配信） | ページテーブル/リンクの親付け替えをノート・ブックで統一（A案）：ブックの `handleBookChapterSave` でも `reconcileChildrenParent` を呼び、既存ページを追加すると必ずこのページ（ブック）の子になるように。notion-plus/[id]/page.tsx |
| 2026-06-16 | （次回配信） | ページテーブル：＋追加ピッカーがエディタのスクロール領域(overflow)に切られて見切れる問題を修正。`createPortal`＋`position:fixed`で `document.body` 直下・最前面(z-[1000])に表示。ボタン位置から座標算出し画面端・下端でクランプ（下にはみ出すなら上開き）。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ブック固定書式バーの修正：`-mt-8/pt-8` のはみ出し補正が書式バー上に32pxの白帯（無駄余白）を作り、固定時に分厚くなってチャプタータイトルを覆う問題を解消。コンパクトな `sticky top-0 py-1` に変更。NotionEditor.tsx |
| 2026-06-16 | （次回配信） | ページテーブル（ページリンク整理ボード）新規実装：`/ページテーブル`で挿入するTipTapノード `pageTable`。大見出し（セクション）＋列（小見出し）＋各列にページリンク縦並びで整理。Phase1＋2＝大小見出し編集/セクション・列の追加削除並べ替え/リンク追加(既存検索＋新規作成)・削除・上下移動・切り取り→貼り付けで列セクション間移動/クリック遷移/子ページ自動親付け替え。NotionEditor.tsx(PageTableNode・EditorPageIdContext) / notion-plus/[id]/page.tsx(extractPageLinkIds拡張)。要件=ページテーブル要件定義.md |
| 2026-06-15 | （次回配信） | ブック：チャプター名タイトルの位置を固定書式バーの「下」へ変更し、左アクセントバー＋下区切り線のセクション見出しに整形（タイトルだと一目で分かるように）。固定バーは常に -mt-8/pt-8 へ戻す。NotionEditor.tsx |
| 2026-06-15 | （次回配信） | ブック：チャプター名をページ先頭に大きく表示する/しないを⚙で切替（`bookShowChapterHeading`・既定ON）。NotionEditor の `chapterHeading` プロパティで先頭に章ラベルを表示（固定書式バーの上、スクロールで流れる）。チャプター名がある時は固定バーのはみ出し補正(-mt-8/pt-8)を外す。settingsStore / NotionEditor.tsx / notion-plus/[id]/page.tsx |
| 2026-06-15 | （次回配信） | ブック見出し番号の微調整：番号の文字色を⚙から変更可能に（プリセット7色＋カラーピッカー、CSS変数 `--booknum-color`、設定 `bookHeadingNumberColor`）。固定書式バーと本文先頭見出しの間の余白を縮小（sticky の pb-1 化＋`.notion-editor > :first-child` の上余白0）。settingsStore / NotionEditor.tsx / editor.css / notion-plus/[id]/page.tsx |
| 2026-06-15 | （次回配信） | ブック見出し番号 Phase 2：本文の見出しにも番号(1/1.1/1.1.1)を自動表示（CSSカウンタ・本文非破壊）。章番号の書式を変更可能に（第一章/第1章/Chapter 1/なし）。⚙メニューにブック専用設定（章番号書式＋本文番号ON/OFF）を追加。bookNumbering.ts / editor.css / NotionEditor.tsx(numberHeadings) / settingsStore(bookChapterFormat・bookNumberHeadings) / notion-plus/[id]/page.tsx |
| 2026-06-15 | （次回配信） | ブックの書式バーを常に固定表示：チャプター編集時、スクロールしても書式バー（Toolbar）が画面上部に張り付くようにした（NotionEditor に `stickyToolbar` プロパティを追加し、ブックのチャプターエディタからのみ渡す。ノート表示は従来どおり）。NotionEditor.tsx / notion-plus/[id]/page.tsx |
| 2026-06-15 | （次回配信） | 今日の復習：日付グループ見出し「M/d（曜）に学習」を大きく強調（text-base/bold/gray-700）。今日の復習タブ・ステージ別表示の2箇所（learning/page.tsx） |
| 2026-06-15 | （次回配信） | ブック自動見出し番号 Phase 1：チャプタータブ・目次に章番号「第一章」（漢数字）を自動表示、目次の見出しに `1 / 1.1 / 1.1.1` を自動採番。表示時計算のみ（本文非破壊）。採番ロジック=apps/web/src/lib/bookNumbering.ts。要件は §4.3/§4.4 に記載 |
| 2026-06-15 | （次回配信） | 記録モーダルのノート⇄ブック変換バグ修正：変換時に内容が消える/ノート変換が効かない（type:undefinedがmergeで無視）問題を、内容保持＋type:'page'明示で修正（AddItemDialog.tsx） |
| 2026-06-15 | （次回配信） | 登録時の祝賀演出を強化＆共通化：🎉＋紙吹雪＋ポップアニメの RegisterCelebration を新設。記録(AddItemDialog)＋⚡特急メモ(QuickInboxModal)で登録時に中央へ大きく「登録しました！」（components/RegisterCelebration.tsx） |
| 2026-06-15 | （次回配信） | ページリンク右クリックにノート⇄ブック変換を追加：本文中のサブページリンクを右クリック→「📚 ブックに変換／📄 ノートに変換」。内容を保持（ノート→ブックは現内容を第1章へ、ブック→ノートは全チャプターを1ページへ結合）。DB・未解決リンクは対象外（NotionEditor.tsx PageLinkView） |
| 2026-06-15 | （次回配信） | お気に入りバグ再修正：サイドバーのお気に入り一覧が「ルート直下のページ」しか拾わず、子ページ・ブックに★を付けても出ない問題を修正。★を付けた全ページ（子ページ/ブック/DB含む）を表示し、子ページには所在パス（親 › 子）も併記（Sidebar.tsx） |
| 2026-06-15 | （次回配信） | パンくずバグ修正：本文中のサブページリンクを切り取り→別ページへ貼り付けて移動しても子ページの parentId が更新されず、パンくずが移動前のままになる問題を修正。ページ保存時に本文内のサブページリンクへ parentId を追従させる（reconcileChildrenParent・循環防止つき、notion-plus/[id]/page.tsx） |
| 2026-06-13 | v1.0.195 / build 215 | AI整理モーダル：配置先ページのアウトライン表示・セクション選択機能を追加 |
| 2026-06-13 | v1.0.195 / build 215 | AddItemDialog 5機能追加：パンくずナビ / Book変換右クリック / 登録完了トースト / 新規ページダイアログ / Book表示 |
| 2026-06-13 | v1.0.195 / build 215 | お気に入りバグ修正：子ページのお気に入りも表示されるよう修正 |
| 2026-06-13 | v1.0.195 / build 215 | ホームヘッダー大型化（text-3xl）+ 学習数・復習待ちカード表示 |
| 2026-06-13 | v1.0.195 / build 215 | NotionEditor: ``` + スペースでコードブロック入力ショートカット追加 |
| 2026-06-13 | v1.0.195 / build 215 | ドラッグハンドル縦位置調整機能：書式の位置調整ダイアログに追加・settingsStoreに永続化 |
