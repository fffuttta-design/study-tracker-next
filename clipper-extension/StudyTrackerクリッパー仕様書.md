# StudyTracker クリッパー 仕様書

> 何を作るか（What）。実装の正本。機能追加・変更のたびに更新する。
> 現バージョン: **v1.0.0**（2026-06-25）

## 1. 目的

見ているWebページや、ページ内で選択したテキストを、**StudyTracker の「特急メモ」にワンアクションで記録**する Chrome 拡張。
あとで StudyTracker 側で「⚡ 特急」タブから NotionPlus へ消化・整理する前提の“とりあえず放り込む”入口。

## 2. 構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | MV3 マニフェスト（権限・アイコン・action・背景SW） |
| `background.js` | サービスワーカー。右クリックメニュー登録＋クリック処理＋記録画面のオープン |
| `icons/icon{16,48,128}.png` | ⚡アイコン（StudyTrackerブランド紫 `#8b5cf6`） |
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
- **右クリックメニュー「StudyTracker に記録」**（contexts: selection / page / link）：
  - 選択テキストがあればそれを内容に、リンク上ならそのリンクURLを元ページに。

## 5. 記録画面 `/clip`（Web側）

- パラメータ `title` / `content`（`text`でも可）/ `url` を初期入力。
- 状態：認証チェック中（スピナー）→ 未ログイン（その場でGoogleログイン）→ 記録フォーム。
- フォーム：タイトル（input）／内容（textarea）／元ページ（リンク表示）／「⚡ 特急で保存」。
- 保存：`learningStore.add(uid, { dateKey, title, content, url, sortOrder })`。
  - これは StudyTracker の「特急メモ」と同一（`notionPageId` なし＝インボックス扱い）。
  - `url` は LearningItem の `url` フィールドへ保存（元ページに戻れる）。
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
