import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const isDev = !app.isPackaged

// ── URL ───────────────────────────────────────────────────────────
// デプロイ後に VERCEL_URL を実際の URL に書き換えてください
const VERCEL_URL = 'https://study-tracker-next-web.vercel.app'
const DEV_URL    = 'http://localhost:3000'

const APP_URL = isDev ? DEV_URL : VERCEL_URL

// ── 状態 ──────────────────────────────────────────────────────────
let mainWin    = null
let tray       = null
let isQuitting = false

const preloadPath = join(__dirname, 'preload.cjs')

// ── トレイアイコンのパス ───────────────────────────────────────────
function getTrayIconPath() {
  const devPath  = join(__dirname, '../build/icon.ico')
  const prodPath = join(process.resourcesPath ?? '', 'icon.ico')
  if (isDev && existsSync(devPath))  return devPath
  if (!isDev && existsSync(prodPath)) return prodPath
  const devPng = join(__dirname, '../build/icon.png')
  if (existsSync(devPng)) return devPng
  return null
}

// ── システムトレイ作成 ────────────────────────────────────────────
function createTray() {
  const iconPath = getTrayIconPath()
  if (!iconPath) return

  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('学習トラッカー')

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '学習トラッカーを開く',
      click: () => { mainWin?.show(); mainWin?.focus() },
    },
    { type: 'separator' },
    {
      label: '再起動',
      click: () => { isQuitting = true; app.relaunch(); app.exit(0) },
    },
    {
      label: '終了',
      click: () => { isQuitting = true; app.quit() },
    },
  ]))

  // ダブルクリックでウィンドウを開く
  tray.on('double-click', () => { mainWin?.show(); mainWin?.focus() })
}

// ── BrowserWindow 作成 ────────────────────────────────────────────
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '学習トラッカー',
    show: false, // 準備ができてから表示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  })

  mainWin.loadURL(APP_URL)

  // ページ読み込み完了後に表示（チラつき防止）
  mainWin.once('ready-to-show', () => {
    // 自動起動時（openAsHidden）は非表示のまま
    if (!app.getLoginItemSettings().wasOpenedAsHidden) {
      mainWin.show()
    }
  })

  // × ボタン → トレイへ隠す（プロセスは継続）
  mainWin.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWin.hide()
    }
  })

  // Firebase / Google OAuth ポップアップを許可
  mainWin.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    const isAuthPopup =
      popupUrl.includes('firebaseapp.com/__/auth') ||
      popupUrl.includes('accounts.google.com') ||
      popupUrl.includes('googleapis.com/oauth')

    if (isAuthPopup) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 660,
          title: 'Googleでログイン',
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        },
      }
    }

    // それ以外の外部リンクはブラウザで開く
    shell.openExternal(popupUrl)
    return { action: 'deny' }
  })

  if (isDev) mainWin.webContents.openDevTools()
}

// ── バージョンチェック（Driveの version.json と比較）─────────────────
// Google Drive がバックグラウンドで新しい exe + version.json を同期する
// 起動時に exe と同じフォルダの version.json を読んで buildNumber を比較
// 新しければ app.relaunch() → 次回起動時に新バイナリが使われる
async function checkForUpdate() {
  try {
    const exeDir          = dirname(app.getPath('exe'))
    const versionJsonPath = join(exeDir, 'version.json')
    if (!existsSync(versionJsonPath)) return

    const [remote, local] = await Promise.all([
      readFile(versionJsonPath,                   'utf-8').then(JSON.parse),
      readFile(join(__dirname, 'build-info.json'), 'utf-8').then(JSON.parse),
    ])

    const remoteNum = remote.buildNumber ?? 0
    const localNum  = local.buildNumber  ?? 0

    if (remoteNum > localNum) {
      console.log(`[update] 新バージョン検知: build ${localNum} → ${remoteNum}`)
      app.relaunch()
      app.exit(0)
    }
  } catch (e) {
    console.warn('[update] バージョンチェック失敗:', e.message)
  }
}

// ── シングルインスタンス ──────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // すでに起動中 → そちらのウィンドウを前面に出して終了
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) { mainWin.show(); mainWin.focus() }
  })

  app.whenReady().then(async () => {
    createWindow()
    createTray()
    await checkForUpdate()
  })
}

// トレイ常駐: 全ウィンドウを閉じてもプロセスは終了しない
app.on('window-all-closed', () => { /* noop */ })
app.on('before-quit', () => { isQuitting = true })
