import { app, BrowserWindow, shell, Tray, Menu, nativeImage, dialog, ipcMain, Notification, globalShortcut, clipboard } from 'electron'
import updaterPkg from 'electron-updater'
const { autoUpdater } = updaterPkg
import { readFile, writeFile, mkdir, readdir, unlink, copyFile, appendFile } from 'fs/promises'
import { spawn } from 'child_process'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const isDev = !app.isPackaged

// ── デバッグログ（userData/debug.log に追記） ─────────────────────────
// 調査が終わったら削除すること
function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  console.log(line.trimEnd())
  const logPath = join(app.getPath('userData'), 'debug.log')
  appendFile(logPath, line).catch(() => {})
}

// ── URL ───────────────────────────────────────────────────────────
// デプロイ後に VERCEL_URL を実際の URL に書き換えてください
const VERCEL_URL = 'https://study-tracker-next-web.vercel.app'
const DEV_URL    = 'http://localhost:3000'

const APP_URL = isDev ? DEV_URL : VERCEL_URL

// ── 状態 ──────────────────────────────────────────────────────────
let mainWin    = null
let quickWin   = null   // 特急メモ クイック入力ポップアップ（グローバルホットキー）
let tray       = null
let isQuitting = false
let latestReviewCount    = 0
let notifHour            = 8
let notifMinute          = 0
let notifTimerId         = null

// バックアップ関連
let backupTimerId        = null
let backupHour           = 3    // 毎日03:00
let backupMinute         = 0
let updateDialogOpen     = false // アップデート確認ダイアログを表示中か（多重表示防止）
let lastBackupInfo       = null // { time: ISO文字列, path: string, success: boolean }
let driveBackupPath      = null // Google Drive バックアップ先フォルダ

const preloadPath = join(__dirname, 'preload.cjs')

// Windows タスクバー・通知・スタートメニューのアプリIDを設定（package.json の appId と合わせる）
if (process.platform === 'win32') {
  app.setAppUserModelId('com.studytracker.app')
}

// ── バックアップ保存先 ────────────────────────────────────────────
function getBackupDir() {
  return join(app.getPath('documents'), 'StudyTrackerBackups')
}

// ── Google Drive バックアップ設定の永続化 ─────────────────────────
const DRIVE_CONFIG_PATH = () => join(app.getPath('userData'), 'backup-config.json')

async function loadDriveConfig() {
  try {
    const raw = await readFile(DRIVE_CONFIG_PATH(), 'utf-8')
    const cfg = JSON.parse(raw)
    if (cfg.drivePath && existsSync(cfg.drivePath)) {
      driveBackupPath = cfg.drivePath
      console.log(`[backup] Google Driveパス読込: ${driveBackupPath}`)
    }
  } catch {
    // 初回起動時はファイルなし → 無視
  }
}

async function saveDriveConfig() {
  try {
    await writeFile(DRIVE_CONFIG_PATH(), JSON.stringify({ drivePath: driveBackupPath }, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[backup] Drive設定保存失敗:', e.message)
  }
}

// ── バックアップファイルを書き込み・世代管理 ────────────────────────
async function writeBackupFile(jsonString) {
  const backupDir = getBackupDir()
  await mkdir(backupDir, { recursive: true })

  // ファイル名: backup-YYYY-MM-DD_HHmm.json
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
  const filePath = join(backupDir, `backup-${stamp}.json`)

  await writeFile(filePath, jsonString, 'utf-8')
  console.log(`[backup] 保存完了: ${filePath}`)

  // 古いバックアップを削除（30件超え分）
  try {
    const files = (await readdir(backupDir))
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()  // 名前順 = 日付順
    const MAX_BACKUPS = 30
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(0, files.length - MAX_BACKUPS)
      for (const f of toDelete) {
        await unlink(join(backupDir, f))
        console.log(`[backup] 古いバックアップ削除: ${f}`)
      }
    }
  } catch (e) {
    console.warn('[backup] 世代管理失敗:', e.message)
  }

  // Google Drive にもコピー
  if (driveBackupPath && existsSync(driveBackupPath)) {
    try {
      const destDir = join(driveBackupPath, 'StudyTrackerBackups')
      await mkdir(destDir, { recursive: true })
      const destFile = join(destDir, `backup-${stamp}.json`)
      await copyFile(filePath, destFile)
      console.log(`[backup] Google Driveへコピー完了: ${destFile}`)

      // Drive側も30件世代管理
      const driveFiles = (await readdir(destDir))
        .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
        .sort()
      if (driveFiles.length > 30) {
        for (const f of driveFiles.slice(0, driveFiles.length - 30)) {
          await unlink(join(destDir, f))
        }
      }
    } catch (e) {
      console.warn('[backup] Google Driveコピー失敗:', e.message)
    }
  }

  return filePath
}

// ── バックアップをレンダラーにリクエストして実行 ───────────────────
function requestBackup() {
  if (!mainWin || mainWin.isDestroyed()) {
    console.warn('[backup] ウィンドウが存在しないためスキップ')
    return
  }
  console.log('[backup] データをレンダラーにリクエスト中...')
  mainWin.webContents.send('backup-request')
}

// ── バックアップスケジューラー ────────────────────────────────────
function scheduleBackup() {
  if (backupTimerId) { clearTimeout(backupTimerId); backupTimerId = null }

  const now  = new Date()
  const next = new Date(now)
  next.setHours(backupHour, backupMinute, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)

  const delay = next.getTime() - now.getTime()
  const hhmm  = `${String(backupHour).padStart(2,'0')}:${String(backupMinute).padStart(2,'0')}`
  console.log(`[backup] 次回バックアップ予定: ${next.toLocaleString('ja-JP')} (${Math.round(delay / 60000)}分後)`)

  backupTimerId = setTimeout(() => {
    backupTimerId = null
    requestBackup()
    scheduleBackup() // 翌日同時刻に再スケジュール
  }, delay)
}

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
    {
      label: '特急メモを追加  (Ctrl+Alt+S)',
      click: () => showQuickCapture(),
    },
    { type: 'separator' },
    {
      label: '最新版を確認',
      click: () => autoUpdater.checkForUpdates().catch(() => {}),
    },
    { type: 'separator' },
    {
      label: '今すぐバックアップ',
      click: () => requestBackup(),
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

// ── 特急メモ クイック入力ポップアップ ─────────────────────────────
// グローバルホットキー（Ctrl+Alt+S）でどのアプリからでも呼び出せる小窓。
// 既存の Web ルート /clip を流用（ログイン状態はメイン窓と共有・特急メモに1件記録して自動で閉じる）。
// 選択なし判定用のセンチネル（このリテラルが選択テキストと一致することは事実上ない）
const SELECTION_SENTINEL = '__ST_NO_SELECTION_SENTINEL__'

// 前面アプリ（Discord等）へ Ctrl+C を合成送出して「選択テキスト」をコピーさせる。
// 我々のグローバルホットキーが Ctrl+Alt を握っている可能性があるので、まず修飾キーを
// 明示的に離して(keyup)からクリーンに Ctrl+C を叩く（押しっぱなし誤爆を防ぐ）。
function sendCopyKeystroke() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false)
    const psScript = [
      '$ErrorActionPreference="SilentlyContinue"',
      '$sig=@"',
      '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);',
      '"@',
      '$k=Add-Type -MemberDefinition $sig -Name K -Namespace W -PassThru',
      'Start-Sleep -Milliseconds 80',           // ユーザーが指を離す時間を少し待つ
      '$UP=0x2',
      // Alt(L/R/汎用)・Ctrl(L/R/汎用) を強制的に離す
      'foreach($vk in 0xA4,0xA5,0x12,0xA2,0xA3,0x11){ $k::keybd_event([byte]$vk,0,$UP,[System.UIntPtr]::Zero) }',
      'Start-Sleep -Milliseconds 25',
      // クリーンな Ctrl+C
      '$k::keybd_event(0x11,0,0,[System.UIntPtr]::Zero)',
      '$k::keybd_event(0x43,0,0,[System.UIntPtr]::Zero)',
      '$k::keybd_event(0x43,0,$UP,[System.UIntPtr]::Zero)',
      '$k::keybd_event(0x11,0,$UP,[System.UIntPtr]::Zero)',
    ].join('\n')
    try {
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      const ps = spawn('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        { windowsHide: true })
      ps.on('error', () => resolve(false))
      ps.on('exit', () => setTimeout(() => resolve(true), 170)) // コピー反映を少し待つ
    } catch { resolve(false) }
  })
}

// 選択テキストを取得（選択があればそれ、無ければ既存クリップボードを流用）
async function captureSelectionText() {
  const before = clipboard.readText() || ''
  try { clipboard.writeText(SELECTION_SENTINEL) } catch { /* noop */ }
  const ok = await sendCopyKeystroke()
  if (!ok) { try { clipboard.writeText(before) } catch { /* noop */ } ; return before }
  const after = clipboard.readText() || ''
  if (after === SELECTION_SENTINEL || after.trim() === '') {
    // 何も選択されていなかった → クリップボードを元に戻し、既存内容を使う（従来動作）
    try { clipboard.writeText(before) } catch { /* noop */ }
    return before
  }
  return after // 選択テキスト取得成功
}

async function showQuickCapture() {
  // 既に開いていれば前面に出すだけ
  if (quickWin && !quickWin.isDestroyed()) {
    quickWin.show()
    quickWin.focus()
    quickWin.webContents.focus()
    return
  }

  // 選択テキスト（無ければ既存クリップボード）を流し込む（先頭の非空行→タイトル / 残り→本文）
  const raw = (await captureSelectionText()).replace(/\r\n/g, '\n')
  let clipTitle = ''
  let clipBody = ''
  if (raw.trim()) {
    const lines = raw.split('\n')
    let i = 0
    while (i < lines.length && lines[i].trim() === '') i++ // 先頭の空行を飛ばす
    clipTitle = (lines[i] ?? '').trim()
    clipBody = lines.slice(i + 1).join('\n').replace(/^\n+/, '') // タイトル行より後を本文へ
  }
  const qs = new URLSearchParams()
  if (clipTitle) qs.set('title', clipTitle)
  if (clipBody)  qs.set('content', clipBody)
  const clipUrl = `${APP_URL}/clip${qs.toString() ? `?${qs.toString()}` : ''}`

  quickWin = new BrowserWindow({
    width: 440,
    height: 560,
    frame: false,            // 枠なしのスッキリした小窓（ページ側に✕ボタンあり）
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,       // タスクバーに出さない
    alwaysOnTop: true,       // 最前面（Discord等の上に出す）
    show: false,
    title: '特急メモ',
    icon: getTrayIconPath() ?? undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  })

  quickWin.loadURL(clipUrl)

  quickWin.once('ready-to-show', () => {
    quickWin.center()
    quickWin.show()
    quickWin.focus()
    quickWin.webContents.focus()
  })

  // Escape で閉じる
  quickWin.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      e.preventDefault()
      if (quickWin && !quickWin.isDestroyed()) quickWin.close()
    }
  })

  // 未ログイン時の Google ログインポップアップを許可（基本はメイン窓と認証共有のため不要だが保険）
  quickWin.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    const isAuth =
      !popupUrl || popupUrl === 'about:blank' ||
      popupUrl.includes('firebaseapp.com') ||
      popupUrl.includes('accounts.google.com') ||
      popupUrl.includes('googleapis.com') ||
      popupUrl.includes('google.com/o/oauth2')
    if (isAuth) {
      quickWin?.setAlwaysOnTop(false) // ログイン窓が背面に隠れないように
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500, height: 660, title: 'Googleでログイン',
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        },
      }
    }
    if (popupUrl.startsWith('http://') || popupUrl.startsWith('https://')) shell.openExternal(popupUrl)
    return { action: 'deny' }
  })

  quickWin.on('closed', () => { quickWin = null })
}

// ── BrowserWindow 作成 ────────────────────────────────────────────
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '学習トラッカー',
    icon: getTrayIconPath() ?? undefined,
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
    debugLog(`[setWindowOpenHandler] url="${popupUrl}"`)

    const authWindowOptions = {
      width: 500,
      height: 660,
      title: 'Googleでログイン',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    }

    // about:blank / 空URL: Firebase SDK が signInWithPopup 時に最初に開く中間ウィンドウ。
    // これを openExternal に渡すと Windows がコンソールウィンドウを起動してしまうため、
    // ポップアップとして allow する。
    if (!popupUrl || popupUrl === 'about:blank') {
      debugLog(`[setWindowOpenHandler] → allow (blank)`)
      return { action: 'allow', overrideBrowserWindowOptions: authWindowOptions }
    }

    const isAuthPopup =
      popupUrl.includes('firebaseapp.com') ||      // /__/auth/* など Firebase 全ドメイン
      popupUrl.includes('accounts.google.com') ||
      popupUrl.includes('googleapis.com') ||
      popupUrl.includes('google.com/o/oauth2')

    if (isAuthPopup) {
      debugLog(`[setWindowOpenHandler] → allow (auth)`)
      return { action: 'allow', overrideBrowserWindowOptions: authWindowOptions }
    }

    // 同一オリジン（アプリ内ルート）は新しいアプリウィンドウで開く（ノートを別窓表示）。
    // 例: ノートをダブルクリック → window.open('/notion-plus/<id>') → ここで新しい窓として allow。
    if (popupUrl.startsWith(APP_URL)) {
      debugLog(`[setWindowOpenHandler] → allow (in-app new window)`)
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1000,
          height: 800,
          minWidth: 700,
          minHeight: 500,
          title: '学習トラッカー',
          icon: getTrayIconPath() ?? undefined,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: preloadPath,
          },
        },
      }
    }

    // http/https の外部リンクのみブラウザで開く。
    // 空URL・不明プロトコルを openExternal に渡すとコンソールウィンドウが開くため除外。
    if (popupUrl.startsWith('http://') || popupUrl.startsWith('https://')) {
      debugLog(`[setWindowOpenHandler] → openExternal`)
      shell.openExternal(popupUrl)
    } else {
      debugLog(`[setWindowOpenHandler] → deny (unknown protocol)`)
    }
    return { action: 'deny' }
  })

  // ── ポップアップ内の window.open・ナビゲーションを全追跡 ─────────────
  mainWin.webContents.on('did-create-window', (popupWin, details) => {
    debugLog(`[did-create-window] url="${details.url}"`)

    // ポップアップ内で更に window.open が呼ばれたら記録して deny
    popupWin.webContents.setWindowOpenHandler(({ url }) => {
      debugLog(`[popup-window.open] url="${url}"`)
      return { action: 'deny' }
    })

    // ポップアップ内のナビゲーションを全記録
    popupWin.webContents.on('will-navigate', (_, url) => {
      debugLog(`[popup-will-navigate] url="${url}"`)
    })
    popupWin.webContents.on('did-navigate', (_, url) => {
      debugLog(`[popup-did-navigate] url="${url}"`)
    })
  })

  // メインウィンドウのナビゲーションも記録
  mainWin.webContents.on('will-navigate', (_, url) => {
    debugLog(`[main-will-navigate] url="${url}"`)
  })

  if (isDev) mainWin.webContents.openDevTools()
}

// ── electron-updater 設定 ──────────────────────────────────────────
// DEV モードではチェックしない（GitHub Release がないため）
if (!isDev) {
  autoUpdater.autoDownload = true         // バックグラウンドで自動ダウンロード
  autoUpdater.autoInstallOnAppQuit = true // 終了時に自動インストール

  autoUpdater.on('update-available', (info) => {
    debugLog(`[update] 新バージョン検知: v${info.version}`)
    mainWin?.webContents.send('update-available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    debugLog('[update] 最新版です')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWin?.webContents.send('update-download-progress', Math.round(progress.percent))
  })

  autoUpdater.on('update-downloaded', (info) => {
    debugLog(`[update] ダウンロード完了: v${info.version}`)
    mainWin?.webContents.send('update-downloaded', { version: info.version })

    // すでにダイアログを表示中なら多重表示しない（閉じた後に新しい版が来たら再表示する）
    if (updateDialogOpen) {
      debugLog('[update] ダイアログ表示中のため再表示しません')
      return
    }
    updateDialogOpen = true
    dialog.showMessageBox(mainWin, {
      type: 'info',
      title: '学習トラッカー - アップデート準備完了',
      message: `v${info.version} の準備ができました 🎉`,
      detail: '今すぐ再起動してインストールしますか？',
      buttons: ['今すぐ再起動', '後で'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      updateDialogOpen = false
      if (response === 0) autoUpdater.quitAndInstall()
    }).catch(() => { updateDialogOpen = false })
  })

  autoUpdater.on('error', (err) => {
    debugLog(`[update] エラー: ${err.message}`)
  })
}

// ── 復習通知スケジューラー ────────────────────────────────────────
function scheduleReviewNotification() {
  if (notifTimerId) { clearTimeout(notifTimerId); notifTimerId = null }

  const now  = new Date()
  const next = new Date(now)
  next.setHours(notifHour, notifMinute, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)

  const delay = next.getTime() - now.getTime()
  notifTimerId = setTimeout(() => {
    notifTimerId = null
    if (latestReviewCount > 0 && Notification.isSupported()) {
      const notif = new Notification({
        title: '学習トラッカー 📚',
        body:  `復習待ちが ${latestReviewCount} 件あります`,
        silent: false,
      })
      notif.on('click', () => {
        mainWin?.show()
        mainWin?.focus()
        mainWin?.webContents.executeJavaScript(
          `window.location.href = '/learning?tab=2'`
        )
      })
      notif.show()
    }
    scheduleReviewNotification()
  }, delay)
}

// ── 自動起動 IPC ─────────────────────────────────────────────────
ipcMain.handle('get-auto-launch', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.on('set-auto-launch', (_, enable) => {
  app.setLoginItemSettings({
    openAtLogin: !!enable,
    openAsHidden: true, // 起動時はトレイのみ（ウィンドウ非表示）
  })
  console.log(`[auto-launch] 自動起動: ${enable ? '有効' : '無効'}`)
})

// ── IPC ──────────────────────────────────────────────────────────
ipcMain.on('app-relaunch', () => {
  debugLog('[app-relaunch] IPC received')
  app.relaunch()
  app.exit(0)
})

// 新規ノート遷移直後に入力（クリック・キー）を受け付けず、最小化で復帰する問題への対策。
// 送信元ウィンドウの webContents へ確実にフォーカスを戻す。
ipcMain.on('focus-window', (e) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) win.focus()
    e.sender.focus()
  } catch (err) {
    debugLog('[focus-window] error', err?.message)
  }
})

ipcMain.on('review-count-update', (_, count) => {
  latestReviewCount = typeof count === 'number' ? count : 0
})

ipcMain.on('notification-time-update', (_, time) => {
  const parts = String(time).split(':').map(Number)
  const h = parts[0] ?? NaN
  const m = parts[1] ?? 0
  if (!isNaN(h) && h >= 0 && h <= 23 && !isNaN(m) && m >= 0 && m <= 59) {
    notifHour   = h
    notifMinute = m
    scheduleReviewNotification()
  }
})

// バックアップデータ受信 → ファイル書き込み
ipcMain.on('backup-data', async (_, jsonString) => {
  try {
    const filePath = await writeBackupFile(jsonString)
    lastBackupInfo = { time: new Date().toISOString(), path: filePath, success: true }

    // レンダラーに完了を通知
    mainWin?.webContents.send('backup-complete', lastBackupInfo)

    // OS通知
    if (Notification.isSupported()) {
      new Notification({
        title: '学習トラッカー バックアップ完了 ✅',
        body:  `データを保存しました\n${filePath}`,
        silent: true,
      }).show()
    }
  } catch (e) {
    console.error('[backup] 書き込み失敗:', e.message)
    lastBackupInfo = { time: new Date().toISOString(), path: null, success: false, error: e.message }
    mainWin?.webContents.send('backup-complete', lastBackupInfo)
  }
})

// 手動バックアップトリガー（設定画面から）
ipcMain.on('trigger-backup', () => {
  requestBackup()
})

// 最後のバックアップ情報を返す（invoke/handle パターン）
ipcMain.handle('get-backup-info', () => {
  return {
    lastBackup:     lastBackupInfo,
    backupDir:      getBackupDir(),
    backupHour,
    backupMinute,
    driveBackupPath: driveBackupPath ?? null,
  }
})

// バックアップ時刻変更
ipcMain.on('backup-time-update', (_, time) => {
  const parts = String(time).split(':').map(Number)
  const h = parts[0] ?? NaN
  const m = parts[1] ?? 0
  if (!isNaN(h) && h >= 0 && h <= 23 && !isNaN(m) && m >= 0 && m <= 59) {
    backupHour   = h
    backupMinute = m
    scheduleBackup()
  }
})

// インストール済みシェルのビルド情報を返す（UI のバージョン表示用）
ipcMain.handle('get-build-info', async () => {
  try {
    const raw = await readFile(join(__dirname, 'build-info.json'), 'utf-8')
    return JSON.parse(raw)
  } catch { return null }
})

// 手動アップデートチェック（設定画面から）
ipcMain.handle('check-for-update', async () => {
  if (isDev) return { hasUpdate: false, reason: 'dev' }
  try {
    const result = await autoUpdater.checkForUpdates()
    const remoteVersion = result?.updateInfo?.version ?? null
    return { checking: true, version: remoteVersion }
  } catch (e) {
    return { hasUpdate: false, reason: e.message }
  }
})

// アップデート適用（設定画面の「再起動してインストール」ボタンから）
ipcMain.on('apply-update', () => {
  autoUpdater.quitAndInstall()
})

// Google Drive バックアップパス取得
ipcMain.handle('get-drive-backup-path', () => driveBackupPath)

// Google Drive バックアップパスを手動設定
ipcMain.on('set-drive-backup-path', (_, path) => {
  driveBackupPath = path || null
  saveDriveConfig()
})

// フォルダ選択ダイアログ → パスを返す
ipcMain.handle('select-drive-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: 'Google Driveのフォルダを選択',
    properties: ['openDirectory'],
  })
  if (canceled || !filePaths[0]) return null
  driveBackupPath = filePaths[0]
  await saveDriveConfig()
  return driveBackupPath
})

// ── シングルインスタンス ──────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) { mainWin.show(); mainWin.focus() }
  })

  app.whenReady().then(async () => {
    debugLog(`[startup] __dirname="${__dirname}"`)
    debugLog(`[startup] exe="${app.getPath('exe')}"`)
    debugLog(`[startup] userData="${app.getPath('userData')}"`)
    Menu.setApplicationMenu(null)
    await loadDriveConfig()

    createWindow()
    createTray()

    // 特急メモ クイック入力のグローバルホットキー（Ctrl+Alt+S）
    const hotkeyOk = globalShortcut.register('CommandOrControl+Alt+S', () => { showQuickCapture() })
    debugLog(`[hotkey] Ctrl+Alt+S 登録: ${hotkeyOk ? '成功' : '失敗（他アプリが使用中の可能性）'}`)

    mainWin.once('ready-to-show', () => {
      // 起動3秒後に確認 → バックグラウンド自動DL → DL完了でダイアログ
      if (!isDev) {
        setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
        setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 3 * 60 * 1000)
      }
    })
    // 復習通知スケジュール（毎朝08:00）
    scheduleReviewNotification()
    // バックアップスケジュール（毎日03:00）
    scheduleBackup()
  })
}

// トレイ常駐: 全ウィンドウを閉じてもプロセスは終了しない
app.on('window-all-closed', () => { /* noop */ })
app.on('before-quit', () => { isQuitting = true })
app.on('will-quit', () => { globalShortcut.unregisterAll() })
