const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openConfig: () => ipcRenderer.invoke('open-config')
});
