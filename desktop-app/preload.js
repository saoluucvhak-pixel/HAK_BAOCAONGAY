const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openConfig: () => ipcRenderer.invoke('open-config'),
  getAccountMode: () => ipcRenderer.invoke('account-mode'),
  configureAccount: (action) => ipcRenderer.invoke('configure-account', action)
});
