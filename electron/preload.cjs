// preload.cjs - contextBridge for renderer access
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  relaunch: () => ipcRenderer.send('app-relaunch'),
  setReviewCount: (count) => ipcRenderer.send('review-count-update', count),
})
