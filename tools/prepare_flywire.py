"""Turn the FlyWire whole-brain connectome (release 783) into the same prepared format as prepare_data.py.

    python3 tools/prepare_flywire.py --raw RAW_DIR --out OUT_DIR

RAW_DIR must hold the files in RAW_FILES (download with tools/fetch_flywire.sh).
Data: FlyWire Consortium, Dorkenwald et al. 2024 and Schlegel et al. 2024 (Nature), CC BY 4.0.
"""
import argparse
import json
import os

import numpy as np
import pandas as pd
import pyarrow.ipc as ipc
from scipy import sparse

RAW_FILES = {"w": "proofread_connections_783.feather", "ann": "Supplemental_file1_neuron_annotations.tsv"}
MIN_SYN = 5  # FlyWire's usual threshold: weaker pairs are mostly reconstruction noise
VOXEL_UM = np.array([0.004, 0.004, 0.040])  # FlyWire coordinates are 4 x 4 x 40 nm voxels
NT_SIGN = {"acetylcholine": 1, "gaba": -1, "glutamate": -1, "histamine": -1,
           "dopamine": 0, "serotonin": 0, "octopamine": 0, "unknown": 1}
# FlyWire super classes renamed to the MaleCNS names, so both flies share sections and wording
SUPER = {"central": "cb_intrinsic", "optic": "ol_intrinsic", "descending": "descending_neuron",
         "ascending": "ascending_neuron", "motor": "cb_motor", "endocrine": "cb_endocrine"}


def codes(series):
    s = series.fillna("unknown").astype(str)
    vocab = sorted(s.unique())
    lut = {v: i for i, v in enumerate(vocab)}
    return np.array([lut[v] for v in s], dtype=np.uint16), vocab


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    ann = pd.read_csv(os.path.join(args.raw, RAW_FILES["ann"]), sep="\t", low_memory=False)
    ann = ann.drop_duplicates("root_id").sort_values("root_id").reset_index(drop=True)
    ids = ann.root_id.to_numpy(np.int64)
    n = ids.size
    print(f"neurons: {n:,}")

    # ---- edges: synapse counts summed over neuropils, then thresholded
    pres, posts, ws = [], [], []
    reader = ipc.open_file(os.path.join(args.raw, RAW_FILES["w"]))
    for i in range(reader.num_record_batches):
        b = reader.get_batch(i)
        pre = b.column("pre_pt_root_id").to_numpy()
        post = b.column("post_pt_root_id").to_numpy()
        w = b.column("syn_count").to_numpy()
        pi = np.searchsorted(ids, pre).clip(0, n - 1)
        qi = np.searchsorted(ids, post).clip(0, n - 1)
        keep = (ids[pi] == pre) & (ids[qi] == post) & (pi != qi)
        pres.append(pi[keep].astype(np.int32)); posts.append(qi[keep].astype(np.int32)); ws.append(w[keep].astype(np.float32))
    W = sparse.csr_matrix((np.concatenate(ws), (np.concatenate(pres), np.concatenate(posts))), shape=(n, n))
    W.sum_duplicates()
    W.data[W.data < MIN_SYN] = 0
    W.eliminate_zeros()
    W.data = np.minimum(W.data, 65535)
    print(f"connections (>= {MIN_SYN} synapses): {W.nnz:,}  synapses: {int(W.data.sum()):,}")

    # ---- positions: soma where known, else FlyWire's representative point on the neuron
    soma = ann[["soma_x", "soma_y", "soma_z"]].to_numpy(np.float64)
    point = ann[["pos_x", "pos_y", "pos_z"]].to_numpy(np.float64)
    measured = ~np.isnan(soma[:, 0])
    pos = np.where(measured[:, None], soma, point) * VOXEL_UM
    pos[np.isnan(pos[:, 0])] = np.nanmean(pos, axis=0)
    print(f"positions: {int(measured.sum()):,} somata, {int((~measured).sum()):,} from a point on the neuron")

    # ---- transmitter: a confirmed one when the annotation names it first, else the prediction
    known = ann.known_nt.fillna("").str.split(r"[;,]").str[0].str.strip()
    nt = known.where(known.isin(list(NT_SIGN)), ann.top_nt).fillna("unknown")
    sup = ann.super_class.map(lambda s: SUPER.get(s, s))
    is_eye = (ann.super_class == "sensory") & ann.cell_class.isin(["visual", "ocellar"])
    sup = sup.where(~(ann.super_class == "sensory"), np.where(is_eye, "ol_sensory", "cb_sensory"))
    side = ann.side.map({"left": "L", "right": "R", "center": "M"})

    sc, sc_vocab = codes(sup)
    cl, cl_vocab = codes(ann.cell_class)
    sub, sub_vocab = codes(ann.cell_sub_class)
    ntc, nt_vocab = codes(nt)
    sd, side_vocab = codes(side)
    sign = np.array([NT_SIGN.get(v, 1) for v in nt], dtype=np.int8)

    np.savez(os.path.join(args.out, "brain.npz"),
             indptr=W.indptr.astype(np.int64), indices=W.indices.astype(np.int32),
             weight=W.data.astype(np.uint16), sign=sign, pos=pos.astype(np.float32),
             measured=measured, superclass=sc, cls=cl, subclass=sub, nt=ntc, side=sd)
    meta = {
        "source": "FlyWire whole-brain connectome v783 (FlyWire Consortium), CC BY 4.0",
        "vocab": {"superclass": sc_vocab, "cls": cl_vocab, "subclass": sub_vocab, "nt": nt_vocab, "side": side_vocab},
        "body_id": [str(x) for x in ids],
        "type": ann.cell_type.fillna(ann.hemibrain_type).fillna("").astype(str).tolist(),
        "instance": (ann.cell_type.fillna("").astype(str) + "_" + side.fillna("")).str.strip("_").tolist(),
    }
    with open(os.path.join(args.out, "meta.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
