#!/usr/bin/env bash
# Download the FlyWire whole-brain connectome, release 783 (~850 MB): connections from Zenodo, cell annotations
# from the flywire_annotations repository (pinned). Data licence: CC BY 4.0 (see DATA_LICENSE.md).
set -euo pipefail
dest="${1:-raw_flywire}"; mkdir -p "$dest"
curl -fL --retry 5 -C - -o "$dest/proofread_connections_783.feather" \
  "https://zenodo.org/records/10676866/files/proofread_connections_783.feather?download=1"
curl -fL --retry 5 -o "$dest/Supplemental_file1_neuron_annotations.tsv" \
  "https://raw.githubusercontent.com/flyconnectome/flywire_annotations/a83b2776d60d5764cef36b927f5f9679c16c47a2/supplemental_files/Supplemental_file1_neuron_annotations.tsv"
