const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

// تحميل .env من مجلد server
dotenv.config({ path: path.join(__dirname, 'server', '.env') });

let serverProcess;

function startServer() {
  serverProcess = spawn('node', [path.join(__dirname, 'server', 'index.js')], {
    env: { ...process.env },
    stdio: 'inherit'
  });
  console.log('🐙 Server starting...');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'أخطبوط — Octopus AI',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  setTimeout(() => {
    win.loadURL('http://localhost:5173');
    win.once('ready-to-show', () => win.show());
  }, 3000);
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
