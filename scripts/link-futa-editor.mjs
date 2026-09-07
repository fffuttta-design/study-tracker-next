/**
 * ローカル開発のときだけ、@futa/editor を「このPCのFutaEditorフォルダ」に繋ぎ直す。
 *
 * 背景：
 *   @futa/editor（ふたメモと共有しているエディタ部品）は GitHub から入れている。
 *   そうしないと Vercel がビルドできない（Vercelはこのリポジトリしかコピーしないので、
 *   以前の `file:../../../Utility/FutaEditor` は「そんなフォルダは無い」で必ず落ちる）。
 *   ただし GitHub から入れると node_modules の中身は"コピー"なので、
 *   **FutaEditorフォルダを直してもStudyTrackerに反映されなくなる**。
 *   そこで、手元にFutaEditorがあるときだけ、node_modules の中身を
 *   実フォルダへのジャンクション（近道）に置き換えて、直したら即反映される状態に戻す。
 *
 * 🔥 この置き換えは「このPCの中だけ」。Vercel や他のPCでは
 *    FutaEditorフォルダが無いので、何もせず素通りする（＝GitHubのコピーがそのまま使われる）。
 *
 * ⚠️ だから **FutaEditorを直したら必ず push する**。
 *    手元では直っているのに、配信された物には入っていない、という食い違いが起きる。
 *    push したあとは `npm run editor:update` で取り込み先を最新に進めること。
 */
import { existsSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'C:\\dev\\CompanyOps\\Application\\Utility\\FutaEditor';
const DEST = join(ROOT, 'apps', 'web', 'node_modules', '@futa', 'editor');

if (!existsSync(SRC)) {
  // このPCにFutaEditorが無い（Vercel・他のPC）＝GitHubから入ったコピーをそのまま使う
  process.exit(0);
}
if (!existsSync(dirname(DEST))) {
  // まだ npm install されていない
  process.exit(0);
}

try {
  // すでにジャンクションなら何もしない（npm install のたびに繋ぎ直すのは無駄）
  if (existsSync(DEST) && statSync(DEST).isDirectory()) {
    const stat = statSync(DEST, { bigint: false });
    const already = existsSync(join(DEST, '.git')); // 実フォルダはgit管理下、コピーは違う
    if (already) process.exit(0);
    void stat;
  }
  rmSync(DEST, { recursive: true, force: true });
  symlinkSync(SRC, DEST, 'junction');
  console.log('[link-futa-editor] @futa/editor → ' + SRC + ' に繋ぎました（手元だけ）');
} catch (e) {
  // 繋げなくても GitHub のコピーで動くので、失敗しても止めない
  console.warn('[link-futa-editor] 繋げませんでした（GitHubのコピーを使います）:', e.message);
}
