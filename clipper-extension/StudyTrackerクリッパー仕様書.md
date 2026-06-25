# StudyTracker クリッパー 仕様書

> 何を作るか（What）。実装の正本。機能追加・変更のたびに更新する。
> 現バージョン: **v1.2.0**（2026-06-25）

## 1. 目的

見ているWebページや、ページ内で選択したテキストを、**StudyTracker の「特急メモ」にワンアクションで記録**する Chrome 拡張。
あとで StudyTracker 側で「⚡ 特急」タブから NotionPlus へ消化・整理する前提の“とりあえず放り込む”入口。

## 2. 構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | MV3 マニフェスト（権限・アイコン・action・背景SW） |
| `background.js` | サービスワーカー。右クリックメニュー登録＋クリック処理＋記録画面のオープン |
| `icons/icon{16,48,128}.png` | ブックマーク型アイコン（ティール `#1D9E75` 背景＋白ブックマーク。sharpでSVGから生成） |
| （Web側）`apps/web/src/app/clip/page.tsx` | 記録画面 `/clip`。実際の保存はここで行う |

## 3. 動作フロー

```
ユーザー操作（アイコン / 右クリック）
  → background.js が title / 選択テキスト / URL を集める
  → https://study-tracker-next-web.vercel.app/clip?title=&content=&url= を
     小さなポップアップウィンドウ(480x600)で開く
  → /clip がログイン済みセッションで内容を表示（編集可）
  → 「⚡ 特急で保存」→ learningItems に1件追加 → 1.1秒後に自動で閉じる
```

## 4. 起動口（トリガー）

- **ツールバーの⚡アイコン**：アクティブタブのタイトル・URL＋（あれば）選択テキストを記録画面へ。
- **キーボードショートカット**（v1.1.0〜）：既定 **`Alt+Shift+S`**（Mac: `Cmd+Shift+S`）。アイコンクリックと同じ動作。
  - manifest `commands.clip-current` ＋ `chrome.commands.onCommand`。記録ロジックは `clipTab(tab)` に共通化（アイコン/ショートカットで共用）。
  - キー変更は **`chrome://extensions/shortcuts`** から。既定キーが他と衝突して割り当たらない場合もここで設定。
- **右クリックメニュー「StudyTracker に記録」**（contexts: selection / page / link）：
  - 選択テキストがあればそれを内容に、リンク上ならそのリンクURLを元ページに。

## 5. 記録画面 `/clip`（Web側）

- パラメータ `title` / `content`（`text`でも可）/ `url` を初期入力。
- 状態：認証チェック中（スピナー）→ 未ログイン（その場でGoogleログイン）→ 記録フォーム。
- フォーム：タイトル（input）／内容（textarea）／元ページ（リンク表示）／「⚡ 特急で保存」。
- 本文には **選択テキスト＋元ページのリンクを併記**して保存（メモ単体で出典が分かるように）。
  - 初期表示の内容＝`選択テキスト` + 空行 + `元ページURL`（編集可）。
- **該当箇所リンク（v1.2.0〜）**：選択がある時は Chrome のテキストフラグメント `#:~:text=...` 付きURLを生成（`background.js` の `buildSourceUrl`）。
  - 開くと選択した文へスクロール＆ハイライト（Chrome/Edge）。長文は `text=先頭,末尾` 形式に丸め、`-` は `%2D` で退避。
  - リンク右クリック時はそのリンク先URL（フラグメント無し）。`chrome://` 等は URL のみ。
- 保存：`learningStore.add(uid, { dateKey, title, content, url, sortOrder })`。
  - これは StudyTracker の「特急メモ」と同一（`notionPageId` なし＝インボックス扱い）。
  - `content` に出典URLを含み、`url` フィールドにも該当箇所リンクを保存（元ページ＝該当箇所に戻れる）。
- 保存後：「✅ 特急メモに記録しました」を表示し `window.close()` で自動クローズ。

## 6. 権限

- `contextMenus`：右クリックメニュー。
- `activeTab` + `scripting`：アイコンクリック時にアクティブタブの選択テキストを読む（クリック時のみ・全サイト常時権限は持たない）。
- host_permissions なし＝プライバシーに配慮（クリックした時だけそのタブにアクセス）。

## 7. データ

記録先 Firestore: `users/{uid}/learningItems/{id}`（StudyTracker と同じ）。拡張は直接書かず、`/clip`（Web）経由で書く。

## 8. 制限・既知事項

- 選択テキストは URL クエリで渡すため `8000字`で丸める（超長文は末尾が切れる）。
- `chrome://`・Chromeウェブストア等の特権ページでは選択テキストを取得できない（タイトル/URLのみ記録）。
- 初回や別ブラウザで未ログインの場合は `/clip` でログインが必要（ログイン後そのまま記録できる）。

## 9. 今後（提案）

- ワンクリック直接保存（画面を出さない）。要：拡張にFirebase Auth＋Google CloudでChrome拡張OAuthクライアント登録。
- 記録時に NotionPlus の配置先まで選べるクイック整理。
- スクショ添付・ページ本文の自動要約（Claude）連携。
