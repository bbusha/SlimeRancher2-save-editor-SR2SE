/**
 * Round-trip check: parse every .sav found under the default save folder (or
 * paths given as arguments), re-serialize without changes and verify the
 * output is byte-identical. Also prints a short summary of what was parsed.
 *
 *   npm run test:parser -- "C:\path\to\file.sav"
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSave, serializeSave, itemName } from '../src/shared/sr2save';

function collect(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(p));
    else if (entry.name.endsWith('.sav')) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const files = args.length
  ? args
  : collect(path.join(os.homedir(), 'AppData', 'LocalLow', 'MonomiPark', 'SlimeRancher2'));

let failures = 0;
for (const file of files) {
  const raw = new Uint8Array(fs.readFileSync(file));
  try {
    const save = parseSave(raw);
    const out = serializeSave(save);
    const same = out.length === raw.length && out.every((b, i) => b === raw[i]);
    const money = save.player.currencies.map((c) => `${c.id}:${c.amount}`).join(',');
    const ammo = save.player.ammo.map((a) => `${itemName(save, a.id)}x${a.count}`).join(' | ');
    console.log(
      `${same ? 'OK  ' : 'DIFF'} ${path.basename(file)} v${save.gameVersion} player v${save.player.version} ` +
        `hp=${save.player.health} money=${money} plots=${save.plots.length} actors=${save.actors.length}` +
        (save.actorParseError ? ` actorErr=${save.actorParseError}` : ''),
    );
    console.log(`      ammo: ${ammo}`);
    if (!same) {
      failures++;
      const firstDiff = out.findIndex((b, i) => b !== raw[i]);
      console.log(`      first difference at 0x${firstDiff.toString(16)} (len ${raw.length} -> ${out.length})`);
    }
  } catch (e) {
    failures++;
    console.log(`FAIL ${path.basename(file)}: ${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failures ? 1 : 0);
