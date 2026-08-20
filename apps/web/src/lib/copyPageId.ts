// NotionPlus のページIDを「NP:」タグ付きでコピーする共通処理。
// 先頭の「NP:」で NotionPlus のページIDだと判別できる形にして、Claude Code へ正確に渡せるようにする。
// 例: NP:ページ「事業」 01719740-2d81-45d7-9bd4-5d7c19001f17

function legacyCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* noop */ }
  ta.remove();
}

function showCopyToast(message: string) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;' +
    'background:#111827;color:#fff;padding:8px 16px;border-radius:9999px;font-size:12px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .15s;pointer-events:none';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, 1500);
}

export function copyNotionPlusPageId(id: string, title?: string) {
  const text = `NP:ページ「${title || 'Untitled'}」 ${id}`;
  const finish = () => showCopyToast('🆔 ページIDをコピーしました（NP:…）');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(finish).catch(() => { legacyCopy(text); finish(); });
  } else {
    legacyCopy(text);
    finish();
  }
}
