# インラインDB（本文埋め込みデータベース）リッチ化 要件定義

> ノート本文に `/データベース` 等で埋め込まれる **データベースのプレビュー表示**
> （`inlineDatabase` ノード／`NotionEditor.tsx` の `InlineDatabaseEmbed`）を、
> Notion のインラインビューのように見やすく・操作できるようにする。
> このドキュメントが要件の正本。実装が進んだら更新する。

最終更新: 2026-06-25

---

## 1. 背景・目的

- 現状の埋め込みテーブルは「枠＋素のテキスト」だけで、列幅も固定・選択肢の色も出ず、Notion と比べて貧弱。
- ノート本文の中で **要点だけサッと見られる**リッチなプレビューにしたい。
- ただし埋め込みは **読み取り専用プレビュー**であり、本格編集はDB本体ページ（`/notion-plus/[id]`）で行う、という役割分担は維持する。

## 2. 対象

| 対象 | パス |
|---|---|
| 埋め込みコンポーネント | `apps/web/src/components/editor/NotionEditor.tsx` の `InlineDatabaseEmbed` / `InlineDatabaseNode` |
| 参照する本体ビュー（配色・挙動の正） | `apps/web/src/components/database/DatabaseView.tsx` |
| データモデル | `packages/core/src/models/notionDatabase.ts`（`DbProperty.width` 既存） |

## 3. 設計原則

1. **本文非破壊**：DBの中身（行・スキーマ）は埋め込みからは書き換えない。列幅だけは「このビューの見た目」として埋め込みノードに保持。
2. **本体ビューと配色・アイコンを統一**：`DatabaseView.tsx` の `SELECT_COLORS` / `TYPE_ICONS` と同じ見た目。
3. **列幅は埋め込みごと（per-view）**：同じDBを2か所に貼っても別々の幅にできる（Notion 同様）。初期値はDB側 `width` → 型別既定の順で継承。

## 4. フェーズ計画

### Phase 1（実装済み・2026-06-25）
- [x] **列幅ドラッグリサイズ**：ヘッダー右端ハンドルをドラッグで自由変更（最小60px）。`table-layout:fixed`＋`<colgroup>`。
- [x] 列幅は埋め込みノード属性 `colWidths`（`{ [propId]: px }`）に保存。初期値 = `colWidths[id] ?? prop.width ?? 型別既定`。
- [x] **選択肢を色付きタグチップ**で表示（select / multiselect、本体と同じ7色）。
- [x] **チェックボックス**を ☑/☐ で表示。
- [x] **型アイコン**をヘッダーのプロパティ名の左に表示。
- [x] **行ホバーのハイライト**、ヘッダーのグラデ、件数バッジ、角丸＋影でカード化。
- [x] URL は青リンク風、数値は右寄せ等、型に応じた体裁。
- [x] はみ出すセルは省略（…）表示（fixed レイアウト）。
- [x] フッターを「＋ 他 N 行を表示」にし、押すとDB本体へ。

### Phase 2a（実装済み・2026-06-25）：行をその場で開く（Notionのピーク風）
- [x] **埋め込み表の行クリックでその行のページをポップアップ表示**（`InlineRowPagePopup`）。ノートを離れず中央モーダルで開き、閉じると元のノートのまま。
  - タイトル編集（`updateRow` で title セルへ保存）／ページ本文編集（`NotionEditor` + `updateRowContent` で `pageContent` へ保存）。
  - プロパティ（タイトル以外）は**表示のみ**（色チップ等）。編集は「↗ 本体で開く」からDB本体ページへ。
  - `Esc`・背景クリック・✕ で閉じる。`createPortal` で `document.body` 直下に描画（エディタの contentEditable と干渉しない）。
- ※フル編集（プロパティ含む）はDB本体ページの既存 `RowPageModal` が担当（行タイトルの「↗」から全画面で開く）。

### Phase 2b（実装済み・2026-06-25）：ポップアップ内でもプロパティ編集
- [x] セルエディタ群（Text/Number/Select/MultiSelect/Checkbox/Date/Url）と `SELECT_COLORS`/`TYPE_ICONS` を **共有モジュール `apps/web/src/components/database/cells.tsx`** に切り出し（DatabaseView と インラインDBポップアップの両方から使用・NotionEditorを参照しないので循環しない）。
- [x] 行ページポップアップでタイトル以外のプロパティも **その場で編集**（`saveCell` が直近の行データへマージして `updateRow`・連続編集の取りこぼし防止）。

### Phase 2c（提案・未）
- [ ] **表示プロパティの選択**（埋め込みごとに「この列だけ出す」、`visibleProps` をノード属性へ）。
- [ ] **プレビュー行数の変更**（既定5 → 埋め込みごとに3/5/10/全件、`previewLimit`）。
- [ ] **並び順・フィルタの簡易指定**（本体のソート/フィルタを一部引き継ぐ or 埋め込み側で軽く指定）。
- [ ] **集計行**（本体の `aggregations` を読んで count/sum 等をフッター表示）。

### Phase 3（提案・未）
- [ ] 埋め込み内での **簡易インライン編集**（チェックのトグル等、軽いものだけ）。
- [ ] **ビュー種別**：テーブル以外（ボード/リスト/ギャラリー）の埋め込み。
- [ ] **モバイル（RN）対応**：現状 Web/デスクトップ優先。

## 5. データ・互換性

- 追加ノード属性：`inlineDatabase.colWidths: Record<string, number>`（既定 `{}`）。
  - 既存の埋め込みは `colWidths` 無し → DB側 `width`／型別既定で表示（移行不要）。
- 本文は TipTap JSON 保存のため属性は自動永続化。`renderHTML`/`parseHTML`（HTMLコピペ経路）は従来通り。

## 6. 受け入れ基準（Phase 1）

- ヘッダー右端をドラッグすると列幅が滑らかに変わり、離すと保持される。再読込しても維持。
- 同じDBを別ノートに貼ると、片方の幅変更がもう片方に影響しない。
- select/multiselect が本体ページと同じ色のチップで出る。チェックボックスが ☑/☐ で出る。
- 列を狭めるとセル文字が「…」で省略され、横スクロールでも崩れない。
