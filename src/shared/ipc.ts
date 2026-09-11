import type { Actor, Currency, PlayerData, Plot } from './sr2save';

/** Summary shown on the save picker cards. */
export interface SaveInfo {
  path: string;
  fileName: string;
  folder: string;
  size: number;
  modifiedMs: number;
  /** null if the file could not be parsed; the error is in `error` */
  gameVersion: number | null;
  playerVersion: number | null;
  gameName: string;
  displayName: string;
  slotIndex: number | null;
  money: number | null;
  plotCount: number | null;
  usedPlots: number | null;
  actorCount: number | null;
  error: string | null;
}

/** Everything the renderer needs to edit a save. Serializable (no raw bytes). */
export interface SaveModel {
  path: string;
  info: SaveInfo;
  itemIndex: string[];
  growerIndex: string[];
  componentIndex: string[];
  zoneIndex: string[];
  player: PlayerData;
  summaryCurrencies: Currency[];
  plots: Plot[];
  actors: Actor[];
  actorParseError: string | null;
}

/** Edited parts sent back to the main process on save. */
export interface SaveEdits {
  path: string;
  player: PlayerData;
  summaryCurrencies: Currency[];
  plots: Plot[];
}

export interface WriteResult {
  ok: boolean;
  backupPath?: string;
  error?: string;
}

export interface SaveFolderScan {
  /** First existing default folder (or the expected one if none exists). */
  root: string;
  /** All candidate folders (Linux: one per Steam library). */
  roots: string[];
  exists: boolean;
  saves: SaveInfo[];
  platform: NodeJS.Platform;
}

export interface Api {
  scanDefaultFolder(): Promise<SaveFolderScan>;
  openDialog(): Promise<SaveModel | null>;
  openSave(path: string): Promise<SaveModel>;
  writeSave(edits: SaveEdits): Promise<WriteResult>;
  revealInFolder(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  gameDataUrl(): Promise<string>;
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(cb: (isMax: boolean) => void): () => void;
  };
}

export const IPC = {
  scanDefaultFolder: 'save:scanDefaultFolder',
  openDialog: 'save:openDialog',
  openSave: 'save:open',
  writeSave: 'save:write',
  revealInFolder: 'shell:reveal',
  openPath: 'shell:openPath',
  gameDataUrl: 'game:dataUrl',
  winMinimize: 'win:minimize',
  winMaximize: 'win:maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:isMaximized',
  winMaximizedChanged: 'win:maximizedChanged',
} as const;
