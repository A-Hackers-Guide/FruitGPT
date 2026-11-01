"""Turn the C. elegans hermaphrodite wiring diagram into the same prepared format as prepare_data.py.

    python3 tools/prepare_worm.py --raw RAW_DIR --out OUT_DIR

RAW_DIR comes from tools/fetch_worm.sh. Wiring: Varshney, Chen, Paniagua, Hall & Chklovskii 2011
(PLoS Comput Biol, CC BY), via OpenWorm's ConnectomeToolbox. Positions: OpenWorm c302 (MIT).
"""
import argparse
import json
import os
import re

import numpy as np
import pandas as pd
from scipy import sparse

# GABAergic neurons (McIntire et al. 1993): the only ones treated as inhibitory. All others push
# their partners up, a simplification: C. elegans glutamate and acetylcholine can also inhibit.
GABA = {f"DD{i}" for i in range(1, 7)} | {f"VD{i}" for i in range(1, 14)} | {"RMED", "RMEL", "RMER", "RMEV", "AVL", "DVB", "RIS"}


def neuron_class(name):
    """AVAL -> AVA, VA12 -> VA, RMED -> RME, AS1 -> AS"""
    base = re.sub(r"\d+$", "", name)
    if base != name:
        return base
    if len(name) >= 4 and name[-1] in "LR":
        name = name[:-1]
        if len(name) >= 4 and name[-1] in "DV":  # e.g. SMDDL -> SMD
            name = name[:-1]
    elif len(name) >= 4 and name[-1] in "DV":
        name = name[:-1]
    return name


def soma(path):
    with open(path) as f:
        m = re.search(r'<proximal x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"', f.read())
    return [float(m.group(i)) for i in (1, 2, 3)] if m else None


def codes(values):
    vocab = sorted(set(values))
    lut = {v: i for i, v in enumerate(vocab)}
    return np.array([lut[v] for v in values], dtype=np.uint16), vocab


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    con = pd.read_excel(os.path.join(args.raw, "NeuronConnect.xls"), engine="xlrd")
    con.columns = ["a", "b", "kind", "n"]
    con = con[con.kind.isin(["S", "Sp", "EJ"])].copy()
    for c in ("a", "b"):  # VA01 -> VA1, the usual spelling
        con[c] = con[c].astype(str).str.strip().str.replace(r"(?<=[A-Z])0(\d)$", r"\1", regex=True)
    names = sorted(set(con.a) | set(con.b))
    idx = {x: i for i, x in enumerate(names)}
    n = len(names)
    info = pd.read_csv(os.path.join(args.raw, "all_cell_info.csv"), usecols=range(5), on_bad_lines="skip").drop_duplicates("Cell name").set_index("Cell name")

    def role(x):
        t = str(info.Type.get(x, "")).lower()
        return "worm_motor" if "motor" in t else "worm_interneuron" if "interneuron" in t else "worm_sensory"

    gaba = np.array([x in GABA for x in names])
    # chemical synapses: "S"/"Sp" rows are neuron a sending to b. Gap junctions ("EJ", listed both ways) are
    # electrical and pass current both ways: modelled as weak excitatory links, left out for GABA neurons.
    rows = con[(con.kind != "EJ") | ~con.a.map(lambda x: x in GABA)]
    W = sparse.csr_matrix((rows.n.to_numpy(np.float32), (rows.a.map(idx).to_numpy(), rows.b.map(idx).to_numpy())), shape=(n, n))
    W.sum_duplicates()
    W.setdiag(0); W.eliminate_zeros()
    print(f"neurons: {n}  connections: {W.nnz:,}  synapses + gap junctions: {int(W.data.sum()):,}")

    pos = np.zeros((n, 3), np.float32); measured = np.zeros(n, bool)
    for x, i in idx.items():
        p = os.path.join(args.raw, "cells", f"{x}.cell.nml")
        if os.path.exists(p) and (s := soma(p)):
            pos[i] = [s[1], s[2], s[0]]; measured[i] = True  # body axis (y) along x for viewing
    print(f"positions: {int(measured.sum())} of {n}")

    sides = []
    for x in names:
        partner = x[:-1] + ("R" if x[-1] == "L" else "L")
        sides.append(x[-1] if x[-1] in "LR" and partner in idx else "M")
    sc, sc_vocab = codes([role(x) for x in names])
    cls = [neuron_class(x) for x in names]
    cl, cl_vocab = codes([str(info.Type.get(x, "unknown")).split(";")[0].strip().strip('"') or "unknown" for x in names])
    sub, sub_vocab = codes(["unknown"] * n)
    ntc, nt_vocab = codes(["gaba" if g else "unknown" for g in gaba])
    sd, side_vocab = codes(sides)
    sign = np.where(gaba, -1, 1).astype(np.int8)

    np.savez(os.path.join(args.out, "brain.npz"),
             indptr=W.indptr.astype(np.int64), indices=W.indices.astype(np.int32),
             weight=np.minimum(W.data, 65535).astype(np.uint16), sign=sign, pos=pos,
             measured=measured, superclass=sc, cls=cl, subclass=sub, nt=ntc, side=sd)
    meta = {"source": "C. elegans hermaphrodite, Varshney et al. 2011 (CC BY) via OpenWorm",
            "vocab": {"superclass": sc_vocab, "cls": cl_vocab, "subclass": sub_vocab, "nt": nt_vocab, "side": side_vocab},
            "body_id": list(range(n)), "type": cls, "instance": names}
    with open(os.path.join(args.out, "meta.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
