// preload.cjs - contextBridge for renderer access
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // アプリ操作
  relaunch: () => ipcRenderer.send('app-relaunch'),
  // 復習通知
  setReviewCount:      (count) => ipcRenderer.send('review-count-update', count),
  setNotificationTime: (time)  => ipcRenderer.send('notification-time-update', time),
  // バックアップ
  onBackupRequest:  (cb) => ipcRenderer.on('backup-request', () => cb()),
  sendBackupData:   (json) => ipcRenderer.send('backup-data', json),
  onBackupComplete: (cb) => ipcRenderer.on('backup-complete', (_, info) => cb(info)),
  triggerBackup:       () => ipcRenderer.send('trigger-backup'),
  getBackupInfo:       () => ipcRenderer.invoke('get-backup-info'),
  setBackupTime:       (time) => ipcRenderer.send('backup-time-update', time),
  // Google Drive バックアップ
  getDriveBackupPath:  () => ipcRenderer.invoke('get-drive-backup-path'),
  setDriveBackupPath:  (path) => ipcRenderer.send('set-drive-backup-path', path),
  selectDriveFolder:   () => ipcRenderer.invoke('select-drive-folder'),
  // 自動起動
  getAutoLaunch:       () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch:       (enable) => ipcRenderer.send('set-auto-launch', enable),
  // ビルド情報（インストール済みシェルの実際のバージョン）
  getBuildInfo:        () => ipcRenderer.invoke('get-build-info'),
  // アップデート
  checkForUpdate:      () => ipcRenderer.invoke('check-for-update'),
  applyUpdate:         (arg) => ipcRenderer.send('apply-update', arg),
})
