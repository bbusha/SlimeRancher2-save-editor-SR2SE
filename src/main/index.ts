import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC } from '../shared/ipc';
import type { SaveEdits, SaveModel } from '../shared/ipc';
import { defaultSaveRoot, defaultSaveRoots, openSave, scanFolders, writeSave } from './saves';

// Game data (icons, maps, metadata) are served through a custom scheme so the
// renderer can reference them with plain <img src="sr2://icons/x.png">.
protocol.registerSchemesAsPrivileged([
  { scheme: 'sr2', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
]);

// AppImages on SteamOS / immutable distros cannot set up the SUID chrome
// sandbox; run unsandboxed there (this is a local file editor, not a browser).
if (process.platform === 'linux' && (process.env.APPIMAGE || process.env.SR2SE_NO_SANDBOX)) {
  app.commandLine.appendSwitch('no-sandbox');
}

function gameResourcesDir(): string {
  // In development the resources live in the repo; when packaged they are
  // copied next to the app as extraResources (see electron-builder.yml).
  return app.isPackaged ? join(process.resourcesPath, 'game') : join(app.getAppPath(), 'resources', 'game');
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#0d1b2e',
    titleBarStyle: 'hidden',
    icon: join(gameResourcesDir(), 'app-icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('maximize', () => mainWindow?.webContents.send(IPC.winMaximizedChanged, true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send(IPC.winMaximizedChanged, false));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (process.env.SR2SE_DEBUG_DIR) startDebugLoop(mainWindow, process.env.SR2SE_DEBUG_DIR);
}

/**
 * Development helper: when SR2SE_DEBUG_DIR is set, poll <dir>/cmd.json for
 * {"js": "...", "shot": "file.png"}; run the JS in the renderer, capture a
 * screenshot and write <dir>/result.json. Lets automation drive the UI.
 */
function startDebugLoop(win: BrowserWindow, dir: string): void {
  const fs = require('node:fs') as typeof import('node:fs');
  const cmdFile = join(dir, 'cmd.json');
  setInterval(async () => {
    if (!fs.existsSync(cmdFile) || win.isDestroyed()) return;
    let cmd: { js?: string; shot?: string; wait?: number };
    try {
      cmd = JSON.parse(fs.readFileSync(cmdFile, 'utf8'));
      fs.unlinkSync(cmdFile);
    } catch {
      return;
    }
    const result: Record<string, unknown> = { ok: true };
    try {
      if (cmd.js) result.value = await win.webContents.executeJavaScript(cmd.js, true);
      if (cmd.wait) await new Promise((r) => setTimeout(r, cmd.wait));
      if (cmd.shot) {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(join(dir, cmd.shot), img.toPNG());
      }
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }
    fs.writeFileSync(join(dir, 'result.json'), JSON.stringify(result));
  }, 500);
}

app.whenReady().then(() => {
  const resDir = gameResourcesDir();
  protocol.handle('sr2', (request) => {
    const url = new URL(request.url);
    // sr2://icons/foo.png -> <resDir>/icons/foo.png
    const rel = decodeURIComponent(url.hostname + url.pathname).replace(/\.\./g, '');
    return net.fetch(pathToFileURL(join(resDir, rel)).toString());
  });

  ipcMain.handle(IPC.scanDefaultFolder, () => scanFolders(defaultSaveRoots()));
  ipcMain.handle(IPC.openSave, (_e, path: string): SaveModel => openSave(path));
  ipcMain.handle(IPC.openDialog, async (): Promise<SaveModel | null> => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open Slime Rancher 2 save file',
      defaultPath: defaultSaveRoot(),
      filters: [
        { name: 'Slime Rancher 2 save', extensions: ['sav'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return openSave(res.filePaths[0]);
  });
  ipcMain.handle(IPC.writeSave, (_e, edits: SaveEdits) => writeSave(edits));
  ipcMain.handle(IPC.revealInFolder, (_e, path: string) => shell.showItemInFolder(path));
  ipcMain.handle(IPC.openPath, (_e, path: string) => shell.openPath(path));
  ipcMain.handle(IPC.gameDataUrl, () => 'sr2://data/gamedata.json');
  ipcMain.on(IPC.winMinimize, () => mainWindow?.minimize());
  ipcMain.on(IPC.winMaximize, () => (mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()));
  ipcMain.on(IPC.winClose, () => mainWindow?.close());
  ipcMain.handle(IPC.winIsMaximized, () => mainWindow?.isMaximized() ?? false);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
