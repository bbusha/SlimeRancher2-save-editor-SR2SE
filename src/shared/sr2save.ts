/**
 * Slime Rancher 2 save file (.sav) parser / serializer.
 *
 * Format notes (reverse engineered from GameV9 / GameV10 / GameV11,
 * PlayerV9-12 / RanchV02-03 / LandPlotV02 / AmmoDataV01-02 / ActorDataV02-04
 * persisted data sets):
 *
 *  - Little endian throughout; strings are .NET BinaryWriter strings
 *    (7-bit length prefix + UTF-8).
 *  - Objects: <name string><i32 version> 00 30 <fields> 00 40
 *  - Dictionaries (most): <i32 count> then (key, value, 00 20)*
 *  - Lists: <i32 count> then elements. The top-level Actors list is
 *    additionally wrapped by a 00 10 marker before the count.
 *  - Nullable<T> / nullable object refs: bool "has value" then the value.
 *
 * Header layouts by game version:
 *
 *  - GameV9/V10: SRGAME is followed by four standalone index table objects
 *    (SRITI, SRRGI, SRGAMEICONINDEX, SRGZONEINDEX) and, near the end of the
 *    file, an SRUCI upgrade-component index object.
 *  - GameV11 (Slime Rancher 2 v1.3.x, 2026): the standalone index tables were
 *    replaced by an INDXTBLLKUP v1 object holding a list of
 *    (key string, INDXTBL v1 object) pairs right after the SRGAME header:
 *
 *        INDXTBLLKUP v1 {
 *          i32 count
 *          count × { key string, INDXTBL v1 { i32 count, strings } 00 40 }
 *        } 00 40
 *
 *    with keys 'IdentifiableType', 'ResourceGrowerDefinition',
 *    '[1].GameIconDefinition' and '[1].World.ZoneDefinition'. A second
 *    INDXTBLLKUP later in the file (after SRGAMESETTINGS) carries the scene
 *    group and upgrade component tables
 *    ('[1].SceneManagement.SceneGroup', '[1].Player.Component.UpgradeComponent').
 *  - PlayerV12 adds no new field before the refinery counts; the tail after
 *    itemCounts (bool, f64, bool, SRDZR, VWDITMS, …) is preserved raw.
 *
 * Strategy: the editor only needs a handful of regions (index tables at
 * the start, the game summary currencies, the Player object prefix and the
 * Ranch plots list). Those regions are parsed structurally and re-emitted
 * on save; everything else is preserved byte-for-byte. Actors are parsed
 * read-only for progress display (which slimes live in which corral).
 */

import { BinaryReader, BinaryWriter, SaveParseError, concatBytes, indexOfBytes } from './binary';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Currency {
  id: number;
  amount: number;
  everCollected: number;
  /** SRCRNCY object version as stored in the save (re-emitted on write). */
  version: number;
}

/** One vac-pack ammo slot / plot storage slot. -1 id means empty. */
export interface AmmoSlot {
  id: number;
  count: number;
  appearance: number;
  emotions: Array<[number, number]>;
  radiant: boolean;
  /** SRAD object version (1 = AmmoDataV01, 2 = AmmoDataV02) */
  version: number;
}

export interface PlayerData {
  version: number;
  health: number;
  energy: number;
  radiation: number;
  currencies: Currency[];
  keys: number;
  gameVersion: string;
  pos: Vec3;
  rot: Vec3;
  /** upgrade uniqueId -> level (-1 = not owned) */
  upgrades: Array<[number, number]>;
  upgradesVersion: number;
  /** upgrade component index -> count */
  components: Array<[number, number]>;
  componentsVersion: number;
  ammo: AmmoSlot[];
  blueprints: number[];
  availBlueprints: number[];
  favorites: number[];
  /** refinery item counts: item index -> count */
  itemCounts: Array<[number, number]>;
}

export interface Plot {
  version: number;
  feederNextTime: number;
  feederPendingCount: number;
  feederCycleSpeed: number;
  collectorNextTime: number;
  attachedDeathTime: number;
  /** LandPlot.Id: 1 empty, 2 corral, 3 coop, 4 garden, 5 silo, 6 pond, 7 incinerator */
  typeId: number;
  /** index into growerIndex, -1 if none */
  resourceGrowerId: number;
  id: string;
  /** LandPlot.Upgrade enum values */
  upgrades: number[];
  siloAmmo: Array<{ key: string; slots: AmmoSlot[] }>;
  siloActivatorIndices: number[];
  ashUnits: number;
  trackedActorIds: number[] | null;
}

export interface Actor {
  actorId: number;
  typeId: number;
  pos: Vec3;
  sceneGroup: number;
  feral: boolean;
  radiant: boolean;
}

export interface SaveFile {
  raw: Uint8Array;
  gameVersion: number;
  itemIndex: string[];
  growerIndex: string[];
  iconIndex: string[];
  zoneIndex: string[];
  componentIndex: string[];
  /** Scene group index table (GameV11 only; empty otherwise). */
  sceneGroupIndex: string[];
  gameName: string;
  saveSlotIndex: number;
  displayName: string;
  summary: { currencies: Currency[]; offset: number; end: number };
  player: PlayerData;
  playerRegion: { start: number; end: number };
  ranchVersion: number;
  plots: Plot[];
  ranchRegion: { start: number; end: number };
  actors: Actor[];
  actorParseError: string | null;
}

// ---------------------------------------------------------------------------
// Reading helpers

function readObjStart(r: BinaryReader, expectedName?: string): { name: string; version: number } {
  const start = r.pos;
  const name = r.str();
  const version = r.i32();
  r.expect(0x00, 0x30);
  if (expectedName !== undefined && name !== expectedName) {
    throw new SaveParseError(`expected object '${expectedName}' but found '${name}'`, start);
  }
  return { name, version };
}

function readObjEnd(r: BinaryReader): void {
  r.expect(0x00, 0x40);
}

function readI32List(r: BinaryReader): number[] {
  const n = r.i32();
  if (n < 0 || n > 10_000_000) throw new SaveParseError(`unreasonable list length ${n}`, r.pos - 4);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = r.i32();
  return out;
}

function readStrList(r: BinaryReader): string[] {
  const n = r.i32();
  if (n < 0 || n > 1_000_000) throw new SaveParseError(`unreasonable list length ${n}`, r.pos - 4);
  const out: string[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = r.str();
  return out;
}

function readDictI32I32(r: BinaryReader): Array<[number, number]> {
  const n = r.i32();
  if (n < 0 || n > 1_000_000) throw new SaveParseError(`unreasonable dict length ${n}`, r.pos - 4);
  const out: Array<[number, number]> = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = r.i32();
    const v = r.i32();
    r.expect(0x00, 0x20);
    out[i] = [k, v];
  }
  return out;
}

function readVec3(r: BinaryReader): Vec3 {
  readObjStart(r, 'SRV3');
  const v = { x: r.f32(), y: r.f32(), z: r.f32() };
  readObjEnd(r);
  return v;
}

function readEmotions(r: BinaryReader): Array<[number, number]> {
  readObjStart(r, 'SRSED');
  const n = r.i32();
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) out.push([r.i32(), r.f32()]);
  readObjEnd(r);
  return out;
}

function readAmmo(r: BinaryReader): AmmoSlot {
  const h = readObjStart(r, 'SRAD');
  if (h.version !== 1 && h.version !== 2) {
    throw new SaveParseError(`unsupported ammo data version ${h.version}`, r.pos);
  }
  const id = r.i32();
  const count = r.i32();
  const appearance = r.i32();
  const emotions = readEmotions(r);
  const radiant = h.version >= 2 ? r.bool() : false;
  readObjEnd(r);
  return { id, count, appearance, emotions, radiant, version: h.version };
}

function readAmmoList(r: BinaryReader): AmmoSlot[] {
  const n = r.i32();
  if (n < 0 || n > 100_000) throw new SaveParseError(`unreasonable ammo list length ${n}`, r.pos - 4);
  const out: AmmoSlot[] = [];
  for (let i = 0; i < n; i++) out.push(readAmmo(r));
  return out;
}

function readIndexTable(r: BinaryReader, name: string): string[] {
  readObjStart(r, name);
  const list = readStrList(r);
  readObjEnd(r);
  return list;
}

function readCurrencies(r: BinaryReader): Currency[] {
  const n = r.i32();
  if (n < 0 || n > 64) throw new SaveParseError(`unreasonable currency count ${n}`, r.pos - 4);
  const out: Currency[] = [];
  for (let i = 0; i < n; i++) {
    const h = readObjStart(r, 'SRCRNCY');
    out.push({ id: r.i32(), amount: r.i32(), everCollected: r.i32(), version: h.version });
    readObjEnd(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writing helpers

function writeObjStart(w: BinaryWriter, name: string, version: number): void {
  w.str(name);
  w.i32(version);
  w.u8(0x00);
  w.u8(0x30);
}

function writeObjEnd(w: BinaryWriter): void {
  w.u8(0x00);
  w.u8(0x40);
}

function writeI32List(w: BinaryWriter, list: number[]): void {
  w.i32(list.length);
  for (const v of list) w.i32(v);
}

function writeDictI32I32(w: BinaryWriter, d: Array<[number, number]>): void {
  w.i32(d.length);
  for (const [k, v] of d) {
    w.i32(k);
    w.i32(v);
    w.u8(0x00);
    w.u8(0x20);
  }
}

function writeVec3(w: BinaryWriter, v: Vec3): void {
  writeObjStart(w, 'SRV3', 1);
  w.f32(v.x);
  w.f32(v.y);
  w.f32(v.z);
  writeObjEnd(w);
}

function writeEmotions(w: BinaryWriter, e: Array<[number, number]>): void {
  writeObjStart(w, 'SRSED', 1);
  w.i32(e.length);
  for (const [k, v] of e) {
    w.i32(k);
    w.f32(v);
  }
  writeObjEnd(w);
}

function writeAmmo(w: BinaryWriter, a: AmmoSlot): void {
  writeObjStart(w, 'SRAD', a.version);
  w.i32(a.id);
  w.i32(a.count);
  w.i32(a.appearance);
  writeEmotions(w, a.emotions);
  if (a.version >= 2) w.bool(a.radiant);
  writeObjEnd(w);
}

function writeAmmoList(w: BinaryWriter, list: AmmoSlot[]): void {
  w.i32(list.length);
  for (const a of list) writeAmmo(w, a);
}

function writeCurrencies(w: BinaryWriter, list: Currency[]): void {
  w.i32(list.length);
  for (const c of list) {
    writeObjStart(w, 'SRCRNCY', c.version);
    w.i32(c.id);
    w.i32(c.amount);
    w.i32(c.everCollected);
    writeObjEnd(w);
  }
}

// ---------------------------------------------------------------------------
// Player

const SUPPORTED_PLAYER_VERSIONS = new Set([9, 10, 11, 12]);

function readPlayer(r: BinaryReader): PlayerData {
  const h = readObjStart(r);
  if (h.name !== '' || !SUPPORTED_PLAYER_VERSIONS.has(h.version)) {
    throw new SaveParseError(`unsupported player data version '${h.name}' v${h.version}`, r.pos);
  }
  const health = r.i32();
  const energy = r.i32();
  const radiation = r.i32();
  const currencies = readCurrencies(r);
  const keys = r.i32();
  const gameVersion = r.str();
  const pos = readVec3(r);
  const rot = readVec3(r);
  const up = readObjStart(r, 'SRPU');
  const upgrades = readDictI32I32(r);
  readObjEnd(r);
  const uc = readObjStart(r, 'SRUPGRADECOMPONENTS');
  const components = readDictI32I32(r);
  readObjEnd(r);
  const ammo = readAmmoList(r);
  const blueprints = readI32List(r);
  const availBlueprints = readI32List(r);
  const favorites = readI32List(r);
  const itemCounts = readDictI32I32(r);
  return {
    version: h.version,
    health,
    energy,
    radiation,
    currencies,
    keys,
    gameVersion,
    pos,
    rot,
    upgrades,
    upgradesVersion: up.version,
    components,
    componentsVersion: uc.version,
    ammo,
    blueprints,
    availBlueprints,
    favorites,
    itemCounts,
  };
}

function writePlayer(w: BinaryWriter, p: PlayerData): void {
  writeObjStart(w, '', p.version);
  w.i32(p.health);
  w.i32(p.energy);
  w.i32(p.radiation);
  writeCurrencies(w, p.currencies);
  w.i32(p.keys);
  w.str(p.gameVersion);
  writeVec3(w, p.pos);
  writeVec3(w, p.rot);
  writeObjStart(w, 'SRPU', p.upgradesVersion);
  writeDictI32I32(w, p.upgrades);
  writeObjEnd(w);
  writeObjStart(w, 'SRUPGRADECOMPONENTS', p.componentsVersion);
  writeDictI32I32(w, p.components);
  writeObjEnd(w);
  writeAmmoList(w, p.ammo);
  writeI32List(w, p.blueprints);
  writeI32List(w, p.availBlueprints);
  writeI32List(w, p.favorites);
  writeDictI32I32(w, p.itemCounts);
}

// ---------------------------------------------------------------------------
// Ranch plots

function readPlot(r: BinaryReader): Plot {
  const h = readObjStart(r, 'SRLP');
  if (h.version !== 2) throw new SaveParseError(`unsupported land plot version ${h.version}`, r.pos);
  const feederNextTime = r.f64();
  const feederPendingCount = r.i32();
  const feederCycleSpeed = r.i32();
  const collectorNextTime = r.f64();
  const attachedDeathTime = r.f64();
  const typeId = r.i32();
  const resourceGrowerId = r.i32();
  const id = r.str();
  const upgrades = readI32List(r);
  const n = r.i32();
  if (n < 0 || n > 64) throw new SaveParseError(`unreasonable silo dict size ${n}`, r.pos - 4);
  const siloAmmo: Plot['siloAmmo'] = [];
  for (let i = 0; i < n; i++) {
    const key = r.str();
    const slots = readAmmoList(r);
    r.expect(0x00, 0x20);
    siloAmmo.push({ key, slots });
  }
  const siloActivatorIndices = readI32List(r);
  const ashUnits = r.f32();
  let trackedActorIds: number[] | null = null;
  if (r.bool()) {
    readObjStart(r, 'TRACKEDACTORLIST');
    const cnt = r.i32();
    trackedActorIds = [];
    for (let i = 0; i < cnt; i++) trackedActorIds.push(r.f64());
    readObjEnd(r);
  }
  readObjEnd(r);
  return {
    version: h.version,
    feederNextTime,
    feederPendingCount,
    feederCycleSpeed,
    collectorNextTime,
    attachedDeathTime,
    typeId,
    resourceGrowerId,
    id,
    upgrades,
    siloAmmo,
    siloActivatorIndices,
    ashUnits,
    trackedActorIds,
  };
}

function writePlot(w: BinaryWriter, p: Plot): void {
  writeObjStart(w, 'SRLP', p.version);
  w.f64(p.feederNextTime);
  w.i32(p.feederPendingCount);
  w.i32(p.feederCycleSpeed);
  w.f64(p.collectorNextTime);
  w.f64(p.attachedDeathTime);
  w.i32(p.typeId);
  w.i32(p.resourceGrowerId);
  w.str(p.id);
  writeI32List(w, p.upgrades);
  w.i32(p.siloAmmo.length);
  for (const s of p.siloAmmo) {
    w.str(s.key);
    writeAmmoList(w, s.slots);
    w.u8(0x00);
    w.u8(0x20);
  }
  writeI32List(w, p.siloActivatorIndices);
  w.f32(p.ashUnits);
  if (p.trackedActorIds) {
    w.bool(true);
    writeObjStart(w, 'TRACKEDACTORLIST', 1);
    w.i32(p.trackedActorIds.length);
    for (const id of p.trackedActorIds) w.f64(id);
    writeObjEnd(w);
  } else {
    w.bool(false);
  }
  writeObjEnd(w);
}

// ---------------------------------------------------------------------------
// Actors (read-only, best effort)

function readActors(r: BinaryReader, ranchVersion: number): Actor[] {
  // Skip the remainder of the ranch object: AccessDoorStates, Palettes, RanchFastForward.
  const doors = r.i32();
  for (let i = 0; i < doors; i++) {
    r.str();
    r.i32();
    r.expect(0x00, 0x20);
  }
  const palettes = r.i32();
  for (let i = 0; i < palettes; i++) {
    // RanchV03 stores Dictionary<string,string>, RanchV02 Dictionary<int,int>.
    if (ranchVersion >= 3) {
      r.str();
      r.str();
    } else {
      r.i32();
      r.i32();
    }
    r.expect(0x00, 0x20);
  }
  const ff = r.i32();
  for (let i = 0; i < ff; i++) {
    r.str();
    r.f64();
    r.expect(0x00, 0x20);
  }
  readObjEnd(r);
  r.expect(0x00, 0x10);
  const n = r.i32();
  if (n < 0 || n > 5_000_000) throw new SaveParseError(`unreasonable actor count ${n}`, r.pos - 4);
  const actors: Actor[] = [];
  for (let i = 0; i < n; i++) {
    const h = readObjStart(r, 'SRAD');
    if (h.version < 2 || h.version > 4) throw new SaveParseError(`unsupported actor version ${h.version}`, r.pos);
    const pos = readVec3(r);
    readVec3(r); // rot
    const actorId = Number(r.i64());
    const typeId = r.i32();
    readEmotions(r);
    r.f64(); // transform time
    r.f64(); // reproduce time
    r.f64(); // destroy time
    readObjStart(r, 'SRRCD');
    r.i32();
    r.f64();
    readObjEnd(r);
    if (r.bool()) r.f64(); // disabled at time
    const feral = r.bool();
    readI32List(r); // fashions
    r.bool(); // glitch
    const sceneGroup = r.i32();
    r.bool(); // statue
    r.i64(); // referenced actor id
    r.f64(); // last emotions update
    const se = r.i32();
    for (let j = 0; j < se; j++) {
      readObjStart(r, 'SRSE');
      r.i32();
      r.f64();
      readObjEnd(r);
    }
    readObjStart(r, 'SRSE'); // prisma actor data
    r.f64();
    readObjEnd(r);
    let radiant = false;
    if (h.version >= 3) {
      radiant = r.bool();
      r.bool(); // sleeping
      r.i32(); // radiant type id
      if (h.version >= 4) r.bool(); // collected
    } else {
      r.bool(); // sleeping
    }
    readObjEnd(r);
    actors.push({ actorId, typeId, pos, sceneGroup, feral, radiant });
  }
  return actors;
}

// ---------------------------------------------------------------------------
// Top level

const SUPPORTED_GAME_VERSIONS = new Set([9, 10, 11]);
/** First game version that stores index tables in an INDXTBLLKUP object. */
const INDX_LOOKUP_MIN_GAME_VERSION = 11;

function findAnchor(bytes: Uint8Array, name: string, occurrence: number, from = 0): number {
  const needle = new Uint8Array([name.length, ...new TextEncoder().encode(name)]);
  let at = from - 1;
  for (let i = 0; i < occurrence; i++) {
    at = indexOfBytes(bytes, needle, at + 1);
    if (at < 0) return -1;
  }
  return at;
}

/**
 * INDXTBLLKUP v1: a list of (key string, INDXTBL v1 object) pairs used as
 * index tables in GameV11+ saves.
 */
function readIndxLookup(r: BinaryReader): Map<string, string[]> {
  readObjStart(r, 'INDXTBLLKUP');
  const n = r.i32();
  if (n < 0 || n > 64) throw new SaveParseError(`unreasonable index table count ${n}`, r.pos - 4);
  const tables = new Map<string, string[]>();
  for (let i = 0; i < n; i++) {
    const key = r.str();
    readObjStart(r, 'INDXTBL');
    tables.set(key, readStrList(r));
    readObjEnd(r);
  }
  readObjEnd(r);
  return tables;
}

function lookupTable(tables: Map<string, string[]>, fragment: string): string[] {
  for (const [key, list] of tables) {
    if (key.includes(fragment)) return list;
  }
  return [];
}

/**
 * Index tables from the SRGAME header: standalone named objects before
 * GameV11, entries of an INDXTBLLKUP object from GameV11 on.
 */
function readHeaderIndexTables(r: BinaryReader, gameVersion: number): Map<string, string[]> {
  if (gameVersion >= INDX_LOOKUP_MIN_GAME_VERSION) {
    return readIndxLookup(r);
  }
  const tables = new Map<string, string[]>();
  tables.set('IdentifiableType', readIndexTable(r, 'SRITI'));
  tables.set('ResourceGrowerDefinition', readIndexTable(r, 'SRRGI'));
  tables.set('GameIconDefinition', readIndexTable(r, 'SRGAMEICONINDEX'));
  tables.set('ZoneDefinition', readIndexTable(r, 'SRGZONEINDEX'));
  return tables;
}

export function parseSave(raw: Uint8Array): SaveFile {
  const r = new BinaryReader(raw);
  const game = readObjStart(r);
  // GameV9/V10 name the root object 'SRGAME'; GameV11 leaves it anonymous.
  if (game.name !== 'SRGAME' && game.name !== '') {
    throw new SaveParseError(`not a Slime Rancher 2 save (root object '${game.name}')`, 0);
  }
  if (!SUPPORTED_GAME_VERSIONS.has(game.version)) {
    throw new SaveParseError(
      `unsupported save format version ${game.version} (this editor supports Slime Rancher 2 save versions 9-11)`,
      0,
    );
  }
  const headerTables = readHeaderIndexTables(r, game.version);
  const itemIndex = headerTables.get('IdentifiableType') ?? [];
  const growerIndex = headerTables.get('ResourceGrowerDefinition') ?? [];
  const iconIndex = lookupTable(headerTables, 'GameIconDefinition');
  const zoneIndex = lookupTable(headerTables, 'ZoneDefinition');
  const gameName = r.str();
  const displayName = r.str();
  const saveSlotIndex = r.i32();

  // Game summary: GameSummaryV03 = GameVersion, Currencies, ...
  const sum = readObjStart(r);
  if (sum.name !== '') throw new SaveParseError('expected anonymous game summary object', r.pos);
  r.str(); // game version
  const summaryOffset = r.pos;
  const summaryCurrencies = readCurrencies(r);
  const summaryEnd = r.pos;

  // Player: the first SRCRNCY list after the summary belongs to the player
  // object, whose header is exactly 23 bytes earlier (anonymous header +
  // health/energy/radiation + currency count). Verify by parsing; if the
  // candidate does not decode as a player, keep scanning further SRCRNCY
  // occurrences (defensive against extra currency lists between the two).
  let player: PlayerData | null = null;
  let playerRegion = { start: 0, end: 0 };
  for (let occurrence = 1; ; occurrence++) {
    const at = findAnchor(raw, 'SRCRNCY', occurrence, summaryEnd);
    if (at < 0) throw new SaveParseError('could not locate player data', 0);
    const start = at - 23;
    if (start <= summaryEnd) continue;
    try {
      const pr = new BinaryReader(raw, start);
      const candidate = readPlayer(pr);
      player = candidate;
      playerRegion = { start, end: pr.pos };
      break;
    } catch {
      // Not a player header; try the next occurrence.
    }
  }
  if (!player) throw new SaveParseError('could not locate player data', 0);

  // Ranch
  const ranchStart = findAnchor(raw, 'SRRANCH', 1, playerRegion.end);
  if (ranchStart < 0 || ranchStart < playerRegion.end) throw new SaveParseError('could not locate ranch data', 0);
  const rr = new BinaryReader(raw, ranchStart);
  const ranch = readObjStart(rr, 'SRRANCH');
  if (ranch.version !== 2 && ranch.version !== 3) throw new SaveParseError(`unsupported ranch version ${ranch.version}`, rr.pos);
  const plotCount = rr.i32();
  if (plotCount < 0 || plotCount > 1000) throw new SaveParseError(`unreasonable plot count ${plotCount}`, rr.pos - 4);
  const plots: Plot[] = [];
  for (let i = 0; i < plotCount; i++) plots.push(readPlot(rr));
  const ranchRegion = { start: ranchStart, end: rr.pos };

  let actors: Actor[] = [];
  let actorParseError: string | null = null;
  try {
    actors = readActors(rr, ranch.version);
  } catch (e) {
    actorParseError = e instanceof Error ? e.message : String(e);
  }

  // Upgrade component index (and, in GameV11+ saves, the scene group index)
  // live near the end of the header data; locate by anchor.
  let componentIndex: string[] = [];
  let sceneGroupIndex: string[] = [];
  if (game.version >= INDX_LOOKUP_MIN_GAME_VERSION) {
    // A second INDXTBLLKUP after the game settings carries these tables.
    for (let occurrence = 1; occurrence <= 8; occurrence++) {
      const at = findAnchor(raw, 'INDXTBLLKUP', occurrence, summaryEnd);
      if (at < 0 || at >= playerRegion.end) break;
      try {
        const tables = readIndxLookup(new BinaryReader(raw, at));
        if (tables.has('IdentifiableType')) continue; // a stray header copy
        if (!componentIndex.length) componentIndex = lookupTable(tables, 'UpgradeComponent');
        if (!sceneGroupIndex.length) sceneGroupIndex = lookupTable(tables, 'SceneGroup');
      } catch {
        // Not a readable lookup; keep whatever we have.
      }
      if (componentIndex.length || sceneGroupIndex.length) break;
    }
  } else {
    const uci = findAnchor(raw, 'SRUCI', 1);
    if (uci >= 0) {
      try {
        componentIndex = readIndexTable(new BinaryReader(raw, uci), 'SRUCI');
      } catch {
        componentIndex = [];
      }
    }
  }

  return {
    raw,
    gameVersion: game.version,
    itemIndex,
    growerIndex,
    iconIndex,
    zoneIndex,
    componentIndex,
    sceneGroupIndex,
    gameName,
    saveSlotIndex,
    displayName,
    summary: { currencies: summaryCurrencies, offset: summaryOffset, end: summaryEnd },
    player,
    playerRegion,
    ranchVersion: ranch.version,
    plots,
    ranchRegion,
    actors,
    actorParseError,
  };
}

/**
 * Re-serialize the save. Unparsed regions are copied from the original bytes.
 * The summary currency block is rewritten in place (same size) so the load
 * screen shows the edited money.
 */
export function serializeSave(save: SaveFile): Uint8Array {
  const raw = save.raw;
  const sw = new BinaryWriter();
  writeCurrencies(sw, save.summary.currencies);
  const summaryBytes = sw.toBytes();
  if (summaryBytes.length !== save.summary.end - save.summary.offset) {
    throw new Error('summary currency block size changed');
  }
  const pw = new BinaryWriter();
  writePlayer(pw, save.player);
  const rw = new BinaryWriter();
  writeObjStart(rw, 'SRRANCH', save.ranchVersion);
  rw.i32(save.plots.length);
  for (const p of save.plots) writePlot(rw, p);

  return concatBytes([
    raw.subarray(0, save.summary.offset),
    summaryBytes,
    raw.subarray(save.summary.end, save.playerRegion.start),
    pw.toBytes(),
    raw.subarray(save.playerRegion.end, save.ranchRegion.start),
    rw.toBytes(),
    raw.subarray(save.ranchRegion.end),
  ]);
}

/** Create an empty ammo slot compatible with the given save. */
export function emptyAmmoSlot(version: number): AmmoSlot {
  return {
    id: -1,
    count: 0,
    appearance: 0,
    emotions: [
      [1, 0],
      [2, 0],
      [0, 0],
      [3, 0],
    ],
    radiant: false,
    version,
  };
}

export function itemName(save: SaveFile, id: number): string {
  if (id < 0 || id >= save.itemIndex.length) return id === -1 ? 'Empty' : `#${id}`;
  return save.itemIndex[id];
}
