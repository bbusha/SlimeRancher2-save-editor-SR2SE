import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

img = Image.open(sys.argv[1]).convert('RGBA')
a = np.array(img).astype(int)
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
# plot squares: light lavender fill. sample color threshold
mask = (r > 225) & (g > 225) & (b > 225) & (al > 200)
lab, n = ndimage.label(mask)
objs = ndimage.find_objects(lab)
out = []
for i, sl in enumerate(objs):
    h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
    area = (lab[sl] == i + 1).sum()
    if 40 <= w <= 80 and 40 <= h <= 80 and abs(w - h) <= 10 and 0.2 * w * h < area < 0.7 * w * h:
        cy = (sl[0].start + sl[0].stop) / 2; cx = (sl[1].start + sl[1].stop) / 2
        out.append((round(cx, 1), round(cy, 1), w, h))
out.sort()
print(len(out))
for o in out: print(o)
json.dump(out, open(sys.argv[2], 'w'))

