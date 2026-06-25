// StudyTracker クリッパー — バックグラウンド（service worker / MV3）
//
// ・ツールバーのアイコンクリック → 現在ページのタイトル・URL＋選択テキストを記録画面へ
// ・右クリックメニュー「StudyTracker に記録」 → 選択テキスト or ページ or リンクを記録画面へ
//
// 記録は StudyTracker Web の /clip ページ（ログイン済みセッションを利用）で行う。
// 拡張側に認証は持たせない（=Google Cloud 等の設定不要）。

const CLIP_URL = 'https://study-tracker-next-web.vercel.app/clip';
const MAX_CONTENT = 8000; // URLが長くなりすぎないよう選択テキストを丸める

// 選択テキストがあれば「該当箇所リンク」を作る（Chrome テキストフラグメント #:~:text=）。
// 開くと選択した文へスクロール＆ハイライトされる。長い選択は textStart,textEnd 形式にする。
function buildSourceUrl(url, selection) {
  if (!url || !/^https?:/i.test(url)) return url || '';
  const sel = (selection || '').replace(/\s+/g, ' ').trim();
  if (!sel) return url;
  if (url.includes(':~:')) return url; // 既にフラグメント指定があるものは触らない
  // ハイフンは範囲区切り(prefix-,-suffix)と誤解されるので %2D に退避
  const enc = (s) => encodeURIComponent(s).replace(/-/g, '%2D');
  let frag;
  if (sel.length <= 60) {
    frag = 'text=' + enc(sel);
  } else {
    frag = 'text=' + enc(sel.slice(0, 25)) + ',' + enc(sel.slice(-25));
  }
  return url + (url.includes('#') ? ':~:' : '#:~:') + frag;
}

function openClip({ title, content, url }) {
  const u = new URL(CLIP_URL);
  if (title) u.searchParams.set('title', String(title).slice(0, 300));
  if (content) u.searchParams.set('content', String(content).slice(0, MAX_CONTENT));
  if (url) u.searchParams.set('url', url);
  // 小さなポップアップウィンドウで開く（保存すると /clip 側で自動クローズ）
  chrome.windows.create({ url: u.toString(), type: 'popup', width: 480, height: 600 });
}

// 右クリックメニューを登録
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'studytracker-clip',
    title: 'StudyTracker に記録',
    contexts: ['selection', 'page', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'studytracker-clip') return;
  const base = info.linkUrl || info.pageUrl || (tab && tab.url) || '';
  // リンク右クリック時はそのリンク先URL（フラグメント無し）、それ以外は選択箇所リンク
  const sourceUrl = info.linkUrl ? base : buildSourceUrl(base, info.selectionText || '');
  openClip({
    title: tab && tab.title ? tab.title : '',
    content: info.selectionText || '',
    url: sourceUrl,
  });
});

// アクティブタブの選択テキストを取得して記録画面へ（アイコン／ショートカット共通）
async function clipTab(tab) {
  let selection = '';
  try {
    if (tab && tab.id != null) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => (window.getSelection ? window.getSelection().toString() : ''),
      });
      selection = (results && results[0] && results[0].result) || '';
    }
  } catch (e) {
    // chrome:// など実行できないページでは選択は空のまま続行
  }
  openClip({
    title: (tab && tab.title) || '',
    content: selection,
    url: buildSourceUrl((tab && tab.url) || '', selection),
  });
}

// ツールバーアイコンのクリック
chrome.action.onClicked.addListener((tab) => { clipTab(tab); });

// キーボードショートカット（既定 Alt+Shift+S / Mac: Cmd+Shift+S）
// 変更は chrome://extensions/shortcuts から可能。
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'clip-current') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) clipTab(tab);
});
