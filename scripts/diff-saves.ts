/** Print the semantic differences between two save files (player + plots). */
import fs from 'node:fs';
import { parseSave, itemName } from '../src/shared/sr2save';
import type { Plot } from '../src/shared/sr2save';

const [a, b] = process.argv.slice(2);
const A = parseSave(new Uint8Array(fs.readFileSync(a)));
const B = parseSave(new Uint8Array(fs.readFileSync(b)));

function j(x: unknown): string {
  return JSON.stringify(x);
}
const pa = A.player;
const pb = B.player;
for (const k of Object.keys(pa) as Array<keyof typeof pa>) {
  if (j(pa[k]) !== j(pb[k])) {
    if (k === 'ammo') {
      console.log('ammo:', pa.ammo.map((s) => `${itemName(A, s.id)}x${s.count}`).join(' | '), '\n   ->', pb.ammo.map((s) => `${itemName(B, s.id)}x${s.count}`).join(' | '));
    } else console.log(`player.${k}:`, j(pa[k]), '->', j(pb[k]));
  }
}
if (j(A.summary.currencies) !== j(B.summary.currencies)) console.log('summary:', j(A.summary.currencies), '->', j(B.summary.currencies));
const plotStr = (s: typeof A, p: Plot): string =>
  `type=${p.typeId} grower=${p.resourceGrowerId} upg=[${p.upgrades}] silo=${p.siloAmmo.map((x) => `${x.key.slice(0, 4)}:[${x.slots.map((sl) => `${itemName(s, sl.id)}x${sl.count}`)}]`)} act=[${p.siloActivatorIndices}] tracked=${p.trackedActorIds?.length ?? 'null'}`;
A.plots.forEach((p, i) => {
  const q = B.plots[i];
  if (!q) return;
  const sa = plotStr(A, p);
  const sb = plotStr(B, q);
  if (sa !== sb) console.log(`plot ${p.id}:\n   ${sa}\n   -> ${sb}`);
});
console.log('sizes', A.raw.length, '->', B.raw.length, '| actors', A.actors.length, '->', B.actors.length, B.actorParseError ?? '');
// Everything after the ranch plots must be identical apart from the shift.
const tailA = A.raw.subarray(A.ranchRegion.end);
const tailB = B.raw.subarray(B.ranchRegion.end);
console.log('tail identical:', tailA.length === tailB.length && tailA.every((v, i) => v === tailB[i]));
const midA = A.raw.subarray(A.playerRegion.end, A.ranchRegion.start);
const midB = B.raw.subarray(B.playerRegion.end, B.ranchRegion.start);
console.log('middle identical:', midA.length === midB.length && midA.every((v, i) => v === midB[i]));
const headA = A.raw.subarray(0, A.summary.offset);
const headB = B.raw.subarray(0, B.summary.offset);
console.log('head identical:', headA.length === headB.length && headA.every((v, i) => v === headB[i]));
