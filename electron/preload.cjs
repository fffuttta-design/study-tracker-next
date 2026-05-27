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
  triggerBackup:    () => ipcRenderer.send('trigger-backup'),
  getBackupInfo:    () => ipcRenderer.invoke('get-backup-info'),
  setBackupTime:    (time) => ipcRenderer.send('backup-time-update', time),
})
