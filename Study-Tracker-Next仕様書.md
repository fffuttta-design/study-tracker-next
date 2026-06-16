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
