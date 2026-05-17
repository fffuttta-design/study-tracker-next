const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const WEB_URL = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../out/index.html')}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default',
    show: false,
  });

  mainWindow.loadURL(WEB_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // アイコンがなければスキップ
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, '../public/icon.ico'));
    tray = new Tray(icon);
    const menu = Menu.buildFromTemplate([
      { label: 'Study Tracker を開く', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: '終了', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip('Study Tracker');
    tray.on('double-click', () => mainWindow?.show());
  } catch {
    // アイコン未設定の場合はトレイなしで起動
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
