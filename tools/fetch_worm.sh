#!/usr/bin/env bash
# Download the C. elegans wiring (Varshney et al. 2011) and neuron positions (OpenWorm c302), pinned to commits.
# Usage: bash tools/fetch_worm.sh RAW_DIR
set -euo pipefail
out="${1:-raw_worm}"; mkdir -p "$out/cells"
CECT=https://raw.githubusercontent.com/openworm/ConnectomeToolbox/ffe570268b7cffb9329cd009a1bb37d60db2d465/cect/data
C302=https://raw.githubusercontent.com/openworm/c302/d542a44bf2662f79e0ad23342a959a181a920877/c302/NeuroML2
curl -fsSL -o "$out/NeuronConnect.xls" "$CECT/NeuronConnect.xls"
curl -fsSL -o "$out/all_cell_info.csv" "$CECT/all_cell_info.csv"
tail -n +2 "$out/all_cell_info.csv" | cut -d, -f1 | while read -r cell; do
  [ -n "$cell" ] && curl -fsSL -o "$out/cells/$cell.cell.nml" "$C302/$cell.cell.nml" || true
done
ls "$out/cells" | wc -l
