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

- **コードを直したら `manifest.json` の `version` を必ず上げる（パッチ+1）。**
  拡張は**自分で読み込み直す**（`background.js` の `initSelfReload`＝ディスクの manifest の version と
  動いている自分の version を3分おきに見比べ、違えば `chrome.runtime.reload()`）。
  つまり **`chrome://extensions` の ↻ は不要**。ただし **version を上げないと自動更新は起きない**
  （上げ忘れたときの逃げ道が従来どおりの ↻）。※未パッケージ拡張専用の仕掛け。
- 機能を変えたら `version`（manifest.json）を上げ、仕様書 `StudyTrackerクリッパー仕様書.md` を更新する。
- `/clip` 側（Web）を変えたら StudyTracker-Next を配信（`npm run dist:win:sync` か Web のみ `git push`）。
- アイコンは `icons/`（sharp で⚡を生成。再生成スクリプトは git 履歴/この PJ のメモ参照）。

## 配布（force-install 固定インストール ＝ 現行）

- **2026-07-22〜：Chromeが拡張をサイレントに消す問題の恒久対策として force-install 固定インストールに移行済み。**
  - 拡張ID＝`cofhakdnhbgombkcehnppnkbilligkde`（manifest の `key` で固定。鍵＝`C:\dev\_ext-tools\keys\clipper-extension.pem`）。
  - 署名済み `.crx` と `updates.xml` は `../clipper-extension-dist/` に生成し、配達所
    `C:\dev\_ext-tools\http-root\`（`http://127.0.0.1:8080/`）へ配置される。登録は**Google管理コンソール（クラウド）側**で完了済み。
  - 🚫 **レジストリに `ExtensionInstallForcelist` を書かない。** `force-install-all.reg` は**廃止・削除済み**。
    reg 経由は機能しない（`[BLOCKED]`）うえ、**クラウドより優先されるため正しい設定を「競合」で無効化する**
    ＝全拡張が消える状態に戻る。**探すな・復元するな。** → `C:\dev\_ext-tools\引継書-force-install-3拡張.md`
  - **再パッケージ手順（コード改修後）**：manifest の `version` を上げてから
    `py C:\dev\_ext-tools\ext-pack.py C:\dev\CompanyOps\Application\Study-Tracker-Next\clipper-extension`
    を再実行（鍵は既存を再利用＝IDは不変／crx・updates.xml・配達所が更新される。**管理コンソールの再設定は不要**）。
    ⚠ force-install下では**自己リロード（↻不要の仕掛け）は効かない**。この手順以外で更新は反映されない。
  - `C:\dev\_ext-tools\keys\clipper-extension.pem`（拡張IDの素）は**絶対に無くさない・gitに載せない**（`.gitignore` に `*.pem`/`*.crx` 登録済み）。
  - 正本＝`C:\dev\Google拡張機能ガイド.md` ／ `C:\dev\_ext-tools\引継書-force-install-3拡張.md`。
- ストア公開する場合は zip 化して Chrome ウェブストアへ（要デベロッパー登録）。

---

## 🔧 この拡張を改修するときの手順（必読・2026-07-22 確立）

**⚠️ この拡張はポリシー配信（force-install）されています。ソースを直しても即座には反映されません。**
Chromeが更新を見に行くのは「ポリシー変更時」と「数時間おきの定期チェック」だけで、
`chrome://extensions` の「更新」ボタン・Chrome再起動・専用フラグは**すべて効かないことを実測済み**です。

### ★正の開発ルート：`--dev` で開発用コピーを使う★

```bash
py C:\dev\_ext-tools\ext-pack.py <この拡張のフォルダ> --dev
```

`<フォルダ>-dev` に `key` を外したコピーが作られます。**別IDになるのでポリシー版と同じプロフィールに同居でき**、
プロフィール切替も不要です。名前に ` (DEV)` が付きます。

**手順**
1. **初回だけ**：`chrome://extensions` → デベロッパーモードON →
   「パッケージ化されていない拡張機能を読み込む」→ **`<フォルダ>-dev`** を選ぶ
   - ファイル選択ダイアログの**アドレス欄にフルパスを貼れば一発**です
   - **⚠ピン留めしない**（ツールバーに出ず、パズルアイコン🧩の中に入る）
2. **開発ループ**：元フォルダを直す → `--dev` を再実行（コピーへ同期）→ `chrome://extensions` の ↻ → **即反映**
3. **完成したら**：
   ```bash
   # ① manifest.json の version を上げてから
   py C:\dev\_ext-tools\ext-pack.py <フォルダ>            # ポリシー配信（本番反映）
   py C:\dev\_ext-tools\ext-pack.py <フォルダ> --dev-end  # 開発用コピーを片付ける
   ```

> ⚠ **片付けの順番**：① `chrome://extensions` で「(DEV)」カードを「削除」→ ② `--dev-end` でフォルダ削除。
> 逆にすると Chrome の設定に登録だけ残る（表示されないので実害は無いが綺麗ではない）。


### やってはいけないこと
- ❌ **元のフォルダを直接「未パッケージ拡張」として読み込まない**
  → `key` を持っているのでポリシー版と**同じIDになり衝突・重複**する（2026-07-22に実際に2個並んだ）
  → **必ず `-dev` の方**を読み込む
- ❌ **レジストリに `ExtensionInstallForcelist` を書かない**
  → 効かないうえ、クラウド設定より優先されるため**正しい設定を「競合」で無効化**し、全拡張が消える状態に戻る
- ❌ **秘密鍵を消さない・移動しない**（`C:\dev\_ext-tools\keys\<フォルダ名>.pem`）
  → 無くすとIDを再現できず、その拡張の設定が失われる

### 前提（止まっていると更新もインストールもできない）
- 配達所サーバー：スタートアップの `ChromeExtServer.vbs`（`http://127.0.0.1:8080/`）

**正本** → `C:\dev\_ext-tools\引継書-force-install-3拡張.md` ／ `C:\dev\Google拡張機能ガイド.md`
