import { app, BrowserWindow, shell, Tray, Menu, nativeImage, dialog, ipcMain, Notification } from 'electron'
import { readFile, writeFile, mkdir, readdir, unlink, copyFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { exec, spawn as spawnChild } from 'child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const isDev = !app.isPackaged

// ── ローカルインストール先 ────────────────────────────────────────────
// Drive から起動した場合に自動で AppData にインストールし、以降はそこから起動する
const LOCAL_INSTALL_DIR = join(process.env.LOCALAPPDATA || '', 'StudyTracker')
const LOCAL_EXE         = join(LOCAL_INSTALL_DIR, '学習トラッカー.exe')

// ── URL ───────────────────────────────────────────────────────────
// デプロイ後に VERCEL_URL を実際の URL に書き換えてください
const VERCEL_URL = 'https://study-tracker-next-web.vercel.app'
const DEV_URL    = 'http://localhost:3000'

const APP_URL = isDev ? DEV_URL : VERCEL_URL

// ── 状態 ──────────────────────────────────────────────────────────
let mainWin    = null
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
let lastBackupInfo       = null // { time: ISO文字列, path: string, success: boolean }
let driveBackupPath      = null // Google Drive バックアップ先フォルダ

const preloadPath = join(__dirname, 'preload.cjs')

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
    { type: 'separator' },
    {
      label: '最新版を確認',
      click: () => checkForUpdateManual(),
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
      return { action: 'allow', overrideBrowserWindowOptions: authWindowOptions }
    }

    const isAuthPopup =
      popupUrl.includes('firebaseapp.com') ||      // /__/auth/* など Firebase 全ドメイン
      popupUrl.includes('accounts.google.com') ||
      popupUrl.includes('googleapis.com') ||
      popupUrl.includes('google.com/o/oauth2')

    if (isAuthPopup) {
      return { action: 'allow', overrideBrowserWindowOptions: authWindowOptions }
    }

    // http/https の外部リンクのみブラウザで開く。
    // 空URL・不明プロトコルを openExternal に渡すとコンソールウィンドウが開くため除外。
    if (popupUrl.startsWith('http://') || popupUrl.startsWith('https://')) {
      shell.openExternal(popupUrl)
    }
    return { action: 'deny' }
  })

  if (isDev) mainWin.webContents.openDevTools()
}

// ── ローカルインストール設定の永続化 ─────────────────────────────────
const UPDATE_SOURCE_CONFIG = () => join(app.getPath('userData'), 'update-source.json')

async function getUpdateSourcePath() {
  try {
    const cfg = JSON.parse(await readFile(UPDATE_SOURCE_CONFIG(), 'utf-8'))
    return typeof cfg.sourcePath === 'string' ? cfg.sourcePath : null
  } catch { return null }
}

async function saveUpdateSourcePath(sourcePath) {
  const cfgPath = UPDATE_SOURCE_CONFIG()
  await mkdir(dirname(cfgPath), { recursive: true })
  await writeFile(cfgPath, JSON.stringify({ sourcePath }, null, 2), 'utf-8')
}

// ── PowerShell スクリプトを生成して wscript.exe 経由でウィンドウなし実行
// powershell.exe を spawn で直接起動すると detached:true と windowsHide:true が
// Windows 内部フラグ (DETACHED_PROCESS vs CREATE_NO_WINDOW) で競合してコンソールが出る。
// wscript.exe //B（コンソールサブシステムを持たない GUI プロセス）経由で起動することで
// コンソールウィンドウを完全に排除する。
async function launchPS1(scriptLines) {
  const ts     = Date.now()
  const tmpPs1 = join(app.getPath('temp'), `st-update-${ts}.ps1`)
  const tmpVbs = join(app.getPath('temp'), `st-update-${ts}.vbs`)

  const bom    = '﻿'
  const header = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    '',
  ]
  await writeFile(tmpPs1, bom + [...header, ...scriptLines].join('\n'), 'utf-8')

  // VBScript: Run の第2引数 0 = ウィンドウ非表示, 第3引数 False = 非同期
  const vbs = [
    'Set oShell = CreateObject("WScript.Shell")',
    `oShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -NonInteractive -NoProfile -File " & Chr(34) & "${tmpPs1}" & Chr(34), 0, False`,
  ].join('\r\n')
  await writeFile(tmpVbs, vbs, 'utf-8')

  spawnChild('wscript.exe', ['//B', tmpVbs], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  }).unref()
}

// ── アップデート適用（サイレント：ウィンドウなし・エラー時のみダイアログ）
async function applyUpdate(sourcePath, newVersion, newBuildNum) {
  await launchPS1([
    // アプリ終了を待ってからコピー（終了まで最大5秒待機）
    `$maxWait = 10; $i = 0; while ((Get-Process -Name '学習トラッカー' -ErrorAction SilentlyContinue) -and $i -lt $maxWait) { Start-Sleep -Milliseconds 500; $i++ }`,
    `robocopy "${sourcePath}" "${LOCAL_INSTALL_DIR}" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP`,
    'if ($LASTEXITCODE -ge 8) {',
    // エラー時のみWindowsダイアログで通知
    '  Add-Type -AssemblyName System.Windows.Forms',
    `  [System.Windows.Forms.MessageBox]::Show("アップデートに失敗しました。\\nトレイメニューの「最新版を確認」から再試行してください。\\n(code: $LASTEXITCODE)", "Study Tracker 更新エラー", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null`,
    '} else {',
    `  Start-Process "${LOCAL_EXE}"`,
    '}',
  ])
  setTimeout(() => app.exit(0), 300)
}

// ── 初回: Drive から起動された場合に AppData へ自動インストール ───────
async function autoInstallIfNeeded() {
  if (isDev) return false

  const exeDir = dirname(app.getPath('exe'))

  // すでに AppData から起動している → 何もしない
  if (exeDir.toLowerCase().startsWith(LOCAL_INSTALL_DIR.toLowerCase())) return false

  console.log(`[install] Drive実行を検知 → ローカルインストール開始`)
  console.log(`[install]   元: ${exeDir}`)
  console.log(`[install]   先: ${LOCAL_INSTALL_DIR}`)

  // 次回アップデート時の参照先として保存
  await saveUpdateSourcePath(exeDir)

  await launchPS1([
    `robocopy "${exeDir}" "${LOCAL_INSTALL_DIR}" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP`,
    'if ($LASTEXITCODE -ge 8) {',
    '  Add-Type -AssemblyName System.Windows.Forms',
    `  [System.Windows.Forms.MessageBox]::Show("インストールに失敗しました。\\n(code: $LASTEXITCODE)", "Study Tracker インストールエラー", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null`,
    '} else {',
    `  Start-Process "${LOCAL_EXE}"`,
    '}',
  ])
  setTimeout(() => app.exit(0), 300)
  return true
}

// ── トレイメニューから手動チェック（結果を必ずダイアログで通知）────────
async function checkForUpdateManual() {
  try {
    const sourcePath = await getUpdateSourcePath()
    if (!sourcePath) {
      dialog.showMessageBox(mainWin, {
        type: 'info', title: '最新版を確認',
        message: 'アップデート元が設定されていません',
        detail: 'Drive からインストールし直してください。',
        buttons: ['OK'],
      })
      return
    }

    const versionJsonPath = join(sourcePath, 'version.json')
    if (!existsSync(versionJsonPath)) {
      dialog.showMessageBox(mainWin, {
        type: 'warning', title: '最新版を確認',
        message: 'version.json が見つかりません',
        detail: `確認先: ${sourcePath}`,
        buttons: ['OK'],
      })
      return
    }

    const [remote, local] = await Promise.all([
      readFile(versionJsonPath,                   'utf-8').then(JSON.parse),
      readFile(join(__dirname, 'build-info.json'), 'utf-8').then(JSON.parse),
    ])

    const remoteNum = remote.buildNumber ?? 0
    const localNum  = local.buildNumber  ?? 0

    if (remoteNum <= localNum) {
      dialog.showMessageBox(mainWin, {
        type: 'info', title: '最新版を確認',
        message: '✅ 最新版です',
        detail: `v${local.version} (build ${localNum})`,
        buttons: ['OK'],
      })
      return
    }

    const { response } = await dialog.showMessageBox(mainWin, {
      type: 'info', title: '学習トラッカー - アップデート',
      message: '新しいバージョンが利用可能です 🎉',
      detail: [
        `現在 : v${local.version} (build ${localNum})`,
        `最新 : v${remote.version} (build ${remoteNum})`,
        '',
        '今すぐ更新しますか？',
      ].join('\n'),
      buttons: ['今すぐ更新', '後で'],
      defaultId: 0, cancelId: 1,
    })

    if (response === 0) {
      await applyUpdate(sourcePath, remote.version ?? '?', remoteNum)
    }
  } catch (e) {
    dialog.showMessageBox(mainWin, {
      type: 'error', title: '最新版を確認',
      message: 'チェックに失敗しました',
      detail: e.message,
      buttons: ['OK'],
    })
  }
}

// ── バージョンチェック（update-source.json の Drive パスと比較）────────
async function checkForUpdate() {
  if (isDev) return
  try {
    const sourcePath = await getUpdateSourcePath()
    if (!sourcePath) { console.log('[update] update-source.json なし → スキップ'); return }

    const versionJsonPath = join(sourcePath, 'version.json')
    if (!existsSync(versionJsonPath)) { console.log('[update] version.json が Drive に見つかりません'); return }

    const [remote, local] = await Promise.all([
      readFile(versionJsonPath,                   'utf-8').then(JSON.parse),
      readFile(join(__dirname, 'build-info.json'), 'utf-8').then(JSON.parse),
    ])

    const remoteNum = remote.buildNumber ?? 0
    const localNum  = local.buildNumber  ?? 0

    if (remoteNum <= localNum) { console.log(`[update] 最新版です (build ${localNum})`); return }

    console.log(`[update] 新バージョン検知: build ${localNum} → ${remoteNum}`)

    const { response } = await dialog.showMessageBox(mainWin, {
      type: 'info',
      title: '学習トラッカー - アップデート',
      message: '新しいバージョンが利用可能です 🎉',
      detail: [
        `現在 : v${local.version  ?? '?'} (build ${localNum})`,
        `最新 : v${remote.version ?? '?'} (build ${remoteNum})`,
        '',
        '今すぐ更新しますか？',
      ].join('\n'),
      buttons: ['今すぐ更新', '後で'],
      defaultId: 0,
      cancelId: 1,
    })

    if (response === 0) {
      await applyUpdate(sourcePath, remote.version ?? '?', remoteNum)
    }
  } catch (e) {
    console.warn('[update] バージョンチェック失敗:', e.message)
  }
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
  app.relaunch()
  app.exit(0)
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

// 手動アップデートチェック（設定画面から）
ipcMain.handle('check-for-update', async () => {
  try {
    const sourcePath = await getUpdateSourcePath()
    if (!sourcePath) return { hasUpdate: false, reason: 'no-source-config' }

    const versionJsonPath = join(sourcePath, 'version.json')
    if (!existsSync(versionJsonPath)) return { hasUpdate: false, reason: 'no-version-file' }

    const [remote, local] = await Promise.all([
      readFile(versionJsonPath,                   'utf-8').then(JSON.parse),
      readFile(join(__dirname, 'build-info.json'), 'utf-8').then(JSON.parse),
    ])

    const remoteNum = remote.buildNumber ?? 0
    const localNum  = local.buildNumber  ?? 0

    if (remoteNum <= localNum) {
      return { hasUpdate: false, current: { version: local.version, buildNumber: localNum } }
    }
    return {
      hasUpdate: true,
      current:   { version: local.version,  buildNumber: localNum  },
      latest:    { version: remote.version, buildNumber: remoteNum },
      sourcePath,
    }
  } catch (e) {
    return { hasUpdate: false, reason: String(e.message) }
  }
})

ipcMain.on('apply-update', async (_, arg) => {
  // arg には { sourcePath, version, buildNumber } が渡される
  const sourcePath  = arg?.sourcePath  ?? await getUpdateSourcePath()
  const newVersion  = arg?.version     ?? '?'
  const newBuildNum = arg?.buildNumber ?? 0
  if (!sourcePath) { console.warn('[apply-update] sourcePath なし'); return }
  await applyUpdate(sourcePath, newVersion, newBuildNum)
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
    Menu.setApplicationMenu(null)
    await loadDriveConfig()

    // Drive から起動された場合は AppData に自動インストールして終了
    const installed = await autoInstallIfNeeded()
    if (installed) return

    createWindow()
    createTray()
    mainWin.once('ready-to-show', () => {
      setTimeout(() => checkForUpdate(), 1500)
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
