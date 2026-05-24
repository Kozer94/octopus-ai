const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem } = require('electron');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

const supervisor = require('./server/supervisor');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'أخطبوط — Octopus AI',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  win.webContents.on('context-menu', (event, params) => {
    // إنشاء قائمة مخصصة دون منع الحدث الافتراضي

    const menu = new Menu();

    // إذا كان التحرير ممكن
    if (params?.isEditable) {
      menu.append(new MenuItem({ label: 'قص', role: 'cut' }));
      menu.append(new MenuItem({ label: 'نسخ', role: 'copy' }));
      menu.append(new MenuItem({ label: 'لصق', role: 'paste' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'تحديد الكل', role: 'selectAll' }));
    }

    // إذا يوجد تحديد نص
    if (params?.selectionText) {
      // لا نكرر copy إذا كانت isEditable فعلًا
      if (!params?.isEditable) menu.append(new MenuItem({ label: 'نسخ', role: 'copy' }));
    }

    // Fallback: لو ما ظهرت أي عناصر لكن نحتاج على الأقل تحديد الكل/نسخ عند الإمكان
    if (menu.items.length === 0) {
      menu.append(new MenuItem({ label: 'نسخ', role: 'copy' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'تحديد الكل', role: 'selectAll' }));
    }

    if (menu.items.length > 0) {
      menu.popup({ window: win });
    }
  });

  setTimeout(() => {
    win.loadURL('http://localhost:5173');
    win.once('ready-to-show', () => win.show());
  }, 3000);
}

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

app.whenReady().then(() => {
  supervisor.start();
  createWindow();
});

app.on('window-all-closed', () => {
  supervisor.stop();
  if (process.platform !== 'darwin') app.quit();
});
