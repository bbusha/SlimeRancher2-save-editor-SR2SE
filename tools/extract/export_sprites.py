"""Export sprites listed in a TSV (from list_all.py) filtered by regex on name, to out dir.
usage: export_sprites.py all_sprites.tsv outdir regex [maxsize]
"""
import sys, os, re
from collections import defaultdict
import UnityPy

AA = r"E:\SteamLibrary\steamapps\common\Slime Rancher 2\SlimeRancher2_Data\StreamingAssets\aa\StandaloneWindows64"
tsv, outdir, rx = sys.argv[1], sys.argv[2], re.compile(sys.argv[3])
maxsize = int(sys.argv[4]) if len(sys.argv) > 4 else 0
os.makedirs(outdir, exist_ok=True)
want = defaultdict(set)
for line in open(tsv, encoding='utf-8'):
    t, name, size, pid, bundle = line.rstrip('\n').split('\t')
    if t == 'Sprite' and rx.search(name):
        want[bundle].add(int(pid))
done = set()
for bundle, pids in want.items():
    env = UnityPy.load(os.path.join(AA, bundle))
    for obj in env.objects:
        if obj.type.name == 'Sprite' and obj.path_id in pids:
            d = obj.read()
            name = d.m_Name
            safe = re.sub(r'[^A-Za-z0-9_\-]+', '_', name)
            if safe in done:
                continue
            try:
                img = d.image
                if maxsize and max(img.size) > maxsize:
                    img.thumbnail((maxsize, maxsize))
                img.save(os.path.join(outdir, safe + '.png'))
                done.add(safe)
                print('ok', name, img.size)
            except Exception as e:
                print('FAIL', name, e)
print('exported', len(done))

