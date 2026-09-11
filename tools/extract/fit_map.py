import json, sys, os
import numpy as np
d = os.path.dirname(__file__)
plots = json.load(open(os.path.join(d, 'plot_table.json')))

def fit(scene_name, squares_file, init, label):
    sq = np.array([[s[0], s[1]] for s in json.load(open(os.path.join(d, squares_file)))])
    ps = [p for p in plots if p['scene'] == scene_name]
    W = np.array([[p['x'], p['z']] for p in ps])
    a, b, c = init  # u = a*x + b ; v = c - a*z
    for it in range(5):
        U = np.stack([a * W[:, 0] + b, c - a * W[:, 1]], axis=1)
        # nearest neighbour
        dists = np.linalg.norm(U[:, None, :] - sq[None, :, :], axis=2)
        idx = dists.argmin(axis=1)
        matched = sq[idx]
        # least squares for a,b,c : minimize |a*x+b-u|^2 + |c-a*z-v|^2
        A = np.zeros((2 * len(W), 3)); y = np.zeros(2 * len(W))
        A[0::2, 0] = W[:, 0]; A[0::2, 1] = 1; y[0::2] = matched[:, 0]
        A[1::2, 0] = -W[:, 1]; A[1::2, 2] = 1; y[1::2] = matched[:, 1]
        sol, *_ = np.linalg.lstsq(A, y, rcond=None)
        a, b, c = sol
    U = np.stack([a * W[:, 0] + b, c - a * W[:, 1]], axis=1)
    res = np.linalg.norm(U - matched, axis=1)
    print(f"{label}: a={a:.4f} b={b:.2f} c={c:.2f}  max residual={res.max():.1f}px mean={res.mean():.1f}px  unique matches={len(set(idx))}/{len(W)}")
    for p, r_, m in zip(ps, res, matched):
        if r_ > 8: print('   big residual', p['id'], p['cell'], round(r_, 1))
    return {'a': round(float(a), 5), 'b': round(float(b), 2), 'c': round(float(c), 2)}

out = {}
out['fields'] = fit('conservatoryfields', 'squares_fields.json', (4.02, 220.6, 3150.2), 'Map_Fields')
# sanctuary: initial guess via centroids with same scale
sq = np.array([[s[0], s[1]] for s in json.load(open(os.path.join(d, 'squares_sanctuary.json')))])
ps = [p for p in plots if p['scene'] == 'sanctuary']
W = np.array([[p['x'], p['z']] for p in ps])
best = None
for a0 in np.arange(3.0, 6.0, 0.1):
    b0 = sq[:, 0].mean() - a0 * W[:, 0].mean(); c0 = sq[:, 1].mean() + a0 * W[:, 1].mean()
    U = np.stack([a0 * W[:, 0] + b0, c0 - a0 * W[:, 1]], axis=1)
    dists = np.linalg.norm(U[:, None, :] - sq[None, :, :], axis=2).min(axis=1).sum()
    if best is None or dists < best[0]: best = (dists, a0, b0, c0)
print('sanctuary init', best)
out['sanctuary'] = fit('sanctuary', 'squares_sanctuary.json', best[1:], 'Map_Sanctuary')
json.dump(out, open(os.path.join(d, 'map_transforms.json'), 'w'), indent=1)
print(out)

