import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { Api, SaveEdits } from '../shared/ipc';

const api: Api = {
  scanDefaultFolder: () => ipcRenderer.invoke(IPC.scanDefaultFolder),
  openDialog: () => ipcRenderer.invoke(IPC.openDialog),
  openSave: (path: string) => ipcRenderer.invoke(IPC.openSave, path),
  writeSave: (edits: SaveEdits) => ipcRenderer.invoke(IPC.writeSave, edits),
  revealInFolder: (path: string) => ipcRenderer.invoke(IPC.revealInFolder, path),
  openPath: (path: string) => ipcRenderer.invoke(IPC.openPath, path),
  gameDataUrl: () => ipcRenderer.invoke(IPC.gameDataUrl),
  window: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    maximize: () => ipcRenderer.send(IPC.winMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    isMaximized: () => ipcRenderer.invoke(IPC.winIsMaximized),
    onMaximizedChange: (cb) => {
      const handler = (_e: unknown, v: boolean): void => cb(v);
      ipcRenderer.on(IPC.winMaximizedChanged, handler);
      return () => ipcRenderer.removeListener(IPC.winMaximizedChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
