# FruitGPT

[![Download FruitGPT](https://img.shields.io/sourceforge/dt/fruitgpt.svg?label=SourceForge%20downloads)](https://sourceforge.net/projects/fruitgpt/files/latest/download) [![Download FruitGPT](https://a.fsdn.com/con/app/sf-download-button)](https://sourceforge.net/projects/fruitgpt/files/latest/download)


**Chat with real brains, and edit them.** FruitGPT is a desktop app with a chat interface that runs complete
wiring diagrams (connectomes) on your own computer and translates what their neurons do into English. It ships with three brains:

| Brain | Neurons | Connections | Source |
|---|---|---|---|
| Male fruit fly, whole nervous system (default) | 165,122 | 25.6 million | MaleCNS v1.0 |
| Female fruit fly, whole brain | 139,248 | 2.7 million (≥ 5 synapses) | FlyWire v783 |
| Worm (*C. elegans*) | 279 | 2,924 | Varshney et al. 2011 |

**Website:** https://a-hackers-guide.github.io/FruitGPT/ · **Download:** [Releases](../../releases/latest) (Linux AppImage, macOS .app, Windows .exe)

Related project: [FruitOS](https://github.com/A-Hackers-Guide/FruitOS), a whole live Linux system built around the same brain.

## How it works (honestly)

A fly can't read. So FruitGPT does three things with every message:

1. **The fly feels it.** Sense words drive that sense through a real receptor cell type: "shadow" → looming
   detectors, "smell" → the DA1 olfactory channel, "touch" → body bristles, and so on. Anything else reaches the fly
   as a sound near its antennae, the way a real fly would sense your voice.
2. **The brain runs.** 300 ms of the full 165,122-neuron leaky integrate-and-fire network, on your CPU.
3. **Fly → English.** FruitGPT reports what happened: how many neurons answered, in which brain regions, and
   which command neurons sent orders to the body (DNp01 Giant Fiber = escape jump, MDN = walk backward, …).

Answers about the fly itself ("how many neurons do you have?", "tell me about MDN", "what is GABA?") are computed
from the connectome. **Online answers** (on by default, switch in the sidebar) look up general questions on
Wikipedia, sending only the question's keywords; those answers are labelled as not coming from the fly. There is
**no language model**: nothing is generated or made up.

Meanwhile the fly lives in the background. Its brain keeps running, and the header shows what it's doing:
resting, or escaping when the Giant Fiber fires.

## Brain Editor

Open **🧠 Brain Editor** in the sidebar to change the brain while it runs, and watch the result in a 3D view of every neuron:

* **Brains:** switch between the fly, the FlyWire fly and the worm, or **add a brain file** (`.fbrain`, see below).
* **Sections:** take out whole parts, e.g. the optic lobes, the mushroom bodies, the nerve cord or one half. Their neurons go silent.
* **Neurons:** silence a cell type, force it on, multiply its output or flip it from "go" to "stop", by type (`DNp01`),
  group (`nt:gaba`, `class:CX`), section (`section:eyes`) or ID.
* **Wires:** cut or strengthen the connections from one group to another (`LPLC2` → `DNp01`, strength 0 = cut).
* **Dials:** synapse strength, firing threshold, membrane memory, fatigue, sense strength, background noise.
* **Test** buttons run the edited brain at once, and the chat uses it too (each reply says which edits are in effect).

**Edits are temporary:** close FruitGPT and the brain is back to the original. **Save a preset** to keep an edit:
presets are stored on your computer (`presets.json` in FruitGPT's app-data folder) and load with one click. A few
example presets come built in, such as *No escape: Giant Fiber silenced*, which stops the fly jumping away from a shadow.

## Download

| System | File | Notes |
|---|---|---|
| Linux | `FruitGPT-*-linux-x86_64.AppImage` | `chmod +x` it, then run |
| macOS | `FruitGPT-*-mac-arm64.dmg` (Apple silicon) or `-x64.dmg` (Intel) | Not notarized yet: right-click → Open the first time |
| Windows | `FruitGPT-*-windows-x64.exe` | Portable, no install. Not code-signed: SmartScreen → More info → Run anyway |

Needs about 1 GB of free RAM (only one brain is loaded at a time). No GPU and no account needed; works offline (except Online answers).

## Gentle on your computer

- The background fly uses at most **~30% of one CPU core**, and **nothing while the window is minimised**.
- The brain runs in its own thread, so the window never freezes.
- Each chat reply simulates 300 ms of brain time, about 1.5 to 2.5 seconds on a laptop core.

## The model and its limits

Leaky integrate-and-fire neurons after Shiu et al. 2024 (*Nature*), with spike-frequency adaptation (4 mV, 100 ms).

* **MaleCNS fly:** 0.15 mV per synapse (recalibrated for this larger dataset), and the 642,932 Kenyon-cell-to-Kenyon-cell
  synapses left out of the simulation (kept in the data; the Dials tab can put them back).
* **FlyWire fly:** 0.275 mV per synapse, Shiu et al.'s original value. A shadow fires its Giant Fiber too.
* **Worm:** 1.5 mV per synapse, gap junctions as weak excitatory links, only the 26 GABA neurons inhibitory. Worm neurons
  mostly use graded signals rather than spikes, so this is a rough model: it reproduces "nasty thing at the nose → reverse"
  (ASH/FLP → AVA/AVD/AVE), but gentle head and tail touch don't give a clear direction.

Not modelled: neuromodulators, neuron shapes, a body, learning. Ask "how does this simulation work?" for the brain's own explanation.

## Build from source

```bash
pip install numpy scipy pandas pyarrow xlrd
bash tools/fetch_data.sh raw                                   # MaleCNS, 1.1 GB from Janelia's public bucket
python3 tools/prepare_data.py --raw raw --out prepared
python3 tools/export_js.py --prepared prepared --out data/brains/malecns --config src/brains/malecns.json
bash tools/fetch_flywire.sh raw_flywire                        # FlyWire, 850 MB
python3 tools/prepare_flywire.py --raw raw_flywire --out prepared_flywire
python3 tools/export_js.py --prepared prepared_flywire --out data/brains/flywire --config src/brains/flywire.json
bash tools/fetch_worm.sh raw_worm                              # worm, < 5 MB
python3 tools/prepare_worm.py --raw raw_worm --out prepared_worm
python3 tools/export_js.py --prepared prepared_worm --out data/brains/worm --config src/brains/worm.json
npm ci && node node_modules/electron/install.js
npm start                     # run it
npm test                      # engine tests (tiny synthetic brain)
npm run dist:linux            # or dist:mac / dist:win
```

Pushing a tag `v*` makes GitHub Actions build all three apps and attach them to a Release.

### Adding another brain

Any connectome can become a FruitGPT brain: write it in the prepared format (`brain.npz` + `meta.json`, see
`tools/prepare_worm.py` for a small example), add a config (senses, command neurons, sections; see `src/brains/*.json`),
export it with `tools/export_js.py`, then pack it into one file:

```bash
node tools/pack_brain.js data/brains/worm worm.fbrain
```

Anyone can load that file with **Brain Editor → Brains → Add a brain file…**. Only share brain files whose data licence allows it.

## Licences

Code: MIT. Brain data: **CC BY 4.0**: MaleCNS v1.0 by HHMI Janelia (FlyEM), Google and collaborators
(https://male-cns.janelia.org); FlyWire v783 by the FlyWire Consortium (Dorkenwald et al. 2024, Schlegel et al. 2024);
C. elegans wiring by Varshney et al. 2011 via OpenWorm (positions: OpenWorm c302, MIT). 3D view: three.js (MIT).
Online answers: Wikipedia, CC BY-SA 4.0. Details: [DATA_LICENSE.md](DATA_LICENSE.md).
FruitGPT is not affiliated with OpenAI, Janelia, Google, FlyWire, OpenWorm or Wikimedia.
