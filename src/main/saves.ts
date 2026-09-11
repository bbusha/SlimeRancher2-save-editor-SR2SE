import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSave, serializeSave } from '../shared/sr2save';
import type { SaveFile } from '../shared/sr2save';
import type { SaveEdits, SaveFolderScan, SaveInfo, SaveModel, WriteResult } from '../shared/ipc';

const STEAM_APP_ID = '1657630';
const SAVE_SUBDIR = ['AppData', 'LocalLow', 'MonomiPark', 'SlimeRancher2'];

/** Steam client roots to look at on Linux (native, flatpak) — the first that exists wins for the default path. */
function linuxSteamRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(home, '.steam', 'root'),
  ];
}

/** Parse steamapps/libraryfolders.vdf for every library path (internal drive, SD card, …). */
function steamLibraries(steamRoot: string): string[] {
  const libs = new Set<string>([steamRoot]);
  const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  try {
    const text = fs.readFileSync(vdf, 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch {
    /* no vdf */
  }
  return [...libs];
}

/**
 * Every folder that may hold Slime Rancher 2 saves on this machine.
 * Windows: %USERPROFILE%\AppData\LocalLow\MonomiPark\SlimeRancher2
 * Linux / SteamOS (Proton prefix): <library>/steamapps/compatdata/1657630/pfx/drive_c/users/steamuser/AppData/LocalLow/MonomiPark/SlimeRancher2
 */
export function defaultSaveRoots(): string[] {
  if (process.platform === 'win32') return [path.join(os.homedir(), ...SAVE_SUBDIR)];
  if (process.platform === 'linux') {
    const out: string[] = [];
    for (const root of linuxSteamRoots()) {
      if (!fs.existsSync(root)) continue;
      for (const lib of steamLibraries(root)) {
        const p = path.join(lib, 'steamapps', 'compatdata', STEAM_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', ...SAVE_SUBDIR);
        if (!out.includes(p)) out.push(p);
      }
    }
    if (!out.length) {
      out.push(path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'compatdata', STEAM_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', ...SAVE_SUBDIR));
    }
    // Existing folders first so the UI shows the real one at the top.
    return out.sort((a, b) => Number(fs.existsSync(b)) - Number(fs.existsSync(a)));
  }
  return [path.join(os.homedir(), 'Library', 'Application Support', 'MonomiPark', 'SlimeRancher2')];
}

export function defaultSaveRoot(): string {
  return defaultSaveRoots()[0];
}

function listSaveFiles(dir: string, depth = 0): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir) || depth > 3) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'Unity') continue;
      out.push(...listSaveFiles(p, depth + 1));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sav')) {
      out.push(p);
    }
  }
  return out;
}

function describe(filePath: string, save: SaveFile | null, error: string | null): SaveInfo {
  const st = fs.statSync(filePath);
  return {
    path: filePath,
    fileName: path.basename(filePath),
    folder: path.dirname(filePath),
    size: st.size,
    modifiedMs: st.mtimeMs,
    gameVersion: save?.gameVersion ?? null,
    playerVersion: save?.player.version ?? null,
    gameName: save?.gameName ?? '',
    displayName: save?.displayName ?? '',
    slotIndex: save?.saveSlotIndex ?? null,
    money: save ? (save.player.currencies[0]?.amount ?? 0) : null,
    plotCount: save?.plots.length ?? null,
    usedPlots: save ? save.plots.filter((p) => p.typeId !== 1).length : null,
    actorCount: save?.actors.length ?? null,
    error,
  };
}

export function scanFolders(roots: string[]): SaveFolderScan {
  const saves: SaveInfo[] = [];
  for (const root of roots) {
    for (const file of listSaveFiles(root)) {
      try {
        const raw = new Uint8Array(fs.readFileSync(file));
        const save = parseSave(raw);
        saves.push(describe(file, save, null));
      } catch (e) {
        saves.push(describe(file, null, e instanceof Error ? e.message : String(e)));
      }
    }
  }
  saves.sort((a, b) => b.modifiedMs - a.modifiedMs);
  const existing = roots.filter((r) => fs.existsSync(r));
  return { root: existing[0] ?? roots[0], roots, exists: existing.length > 0, saves, platform: process.platform };
}

/** The save currently open in the editor; kept in main so raw bytes never cross IPC. */
let current: { path: string; save: SaveFile } | null = null;

export function openSave(filePath: string): SaveModel {
  const raw = new Uint8Array(fs.readFileSync(filePath));
  const save = parseSave(raw);
  current = { path: filePath, save };
  return {
    path: filePath,
    info: describe(filePath, save, null),
    itemIndex: save.itemIndex,
    growerIndex: save.growerIndex,
    componentIndex: save.componentIndex,
    zoneIndex: save.zoneIndex,
    player: save.player,
    summaryCurrencies: save.summary.currencies,
    plots: save.plots,
    actors: save.actors,
    actorParseError: save.actorParseError,
  };
}

function backupPathFor(filePath: string): string {
  const dir = path.join(path.dirname(filePath), 'SR2SE-backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${path.basename(filePath, '.sav')}.${stamp}.sav`);
}

export function writeSave(edits: SaveEdits): WriteResult {
  try {
    if (!current || current.path !== edits.path) {
      // Re-read from disk if the session was lost (e.g. dev reload).
      openSave(edits.path);
    }
    const save = current!.save;
    save.player = edits.player;
    save.summary.currencies = edits.summaryCurrencies;
    save.plots = edits.plots;
    const out = serializeSave(save);
    // Sanity check: the result must parse again before we touch the disk.
    parseSave(out);
    const backupPath = backupPathFor(edits.path);
    fs.copyFileSync(edits.path, backupPath);
    const tmp = edits.path + '.tmp';
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, edits.path);
    // Reload so subsequent saves build on the new bytes.
    openSave(edits.path);
    return { ok: true, backupPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
