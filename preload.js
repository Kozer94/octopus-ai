const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('octopus', {
  openFolder: () => ipcRenderer.invoke('open-folder'),
  windowControl: (action) => ipcRenderer.send('window-control', action),
});
