"""Convert the prepared brain (brain.npz + meta.json from prepare_data.py) into flat little-endian
binary files the JavaScript engine can load straight into typed arrays.

    python3 tools/export_js.py --prepared PREPARED_DIR --out data
"""
import argparse
import json
import os
import shutil

import numpy as np

FILES = {  # name -> dtype the JS side expects
    "indptr": "<u4", "indices": "<u4", "weight": "<u2", "sign": "<i1", "pos": "<f4",
    "measured": "u1", "superclass": "<u2", "cls": "<u2", "subclass": "<u2", "nt": "<u2", "side": "<u2",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prepared", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    z = np.load(os.path.join(a.prepared, "brain.npz"))
    assert z["indptr"][-1] < 2**32
    for name, dt in FILES.items():
        z[name].astype(dt).tofile(os.path.join(a.out, f"{name}.bin"))
    shutil.copy(os.path.join(a.prepared, "meta.json"), os.path.join(a.out, "meta.json"))
    total = sum(os.path.getsize(os.path.join(a.out, f)) for f in os.listdir(a.out))
    print(f"exported {len(FILES)} arrays + meta.json, {total / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
