/**
 * electron/preload.js — Secure Bridge between Main & Renderer
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  readPdfFile: async (filePath) => {
    return ipcRenderer.invoke('read-pdf-file', filePath);
  },
  getOpenFileArg: async () => {
    return ipcRenderer.invoke('get-open-file-arg');
  },
  openExternalUrl: async (url) => {
    return ipcRenderer.invoke('open-external-url', url);
  }
});
