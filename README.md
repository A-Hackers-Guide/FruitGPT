# FruitGPT

**Chat with a real fruit fly brain.** FruitGPT is a desktop app with a chat interface that runs the complete
wiring diagram of a male fruit fly's nervous system (**165,122 neurons, 25.6 million connections**) on your own computer,
and translates what its neurons do into English.

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

## Download

| System | File | Notes |
|---|---|---|
| Linux | `FruitGPT-*-linux-x86_64.AppImage` | `chmod +x` it, then run |
| macOS | `FruitGPT-*-mac-arm64.dmg` (Apple silicon) or `-x64.dmg` (Intel) | Not notarized yet: right-click → Open the first time |
| Windows | `FruitGPT-*-windows-x64.exe` | Portable, no install. Not code-signed: SmartScreen → More info → Run anyway |

Needs about 1 GB of free RAM. No GPU and no account needed; works offline (except Online answers).

## Gentle on your computer

- The background fly uses at most **~30% of one CPU core**, and **nothing while the window is minimised**.
- The brain runs in its own thread, so the window never freezes.
- Each chat reply simulates 300 ms of brain time, about 1.5 to 2.5 seconds on a laptop core.

## The model and its limits

Leaky integrate-and-fire neurons after Shiu et al. 2024 (*Nature*), with the same recalibration as FruitOS:
0.15 mV per synapse, spike-frequency adaptation (4 mV, 100 ms), and the 642,932 Kenyon-cell-to-Kenyon-cell synapses
left out of the simulation (kept in the data). Not modelled: neuromodulators, gap junctions, neuron shapes, a body,
learning. Ask the fly "how does this simulation work?" for its own explanation.

## Build from source

```bash
pip install numpy scipy pandas pyarrow
bash tools/fetch_data.sh raw                                   # 1.1 GB, Janelia's public bucket
python3 tools/prepare_data.py --raw raw --out prepared
python3 tools/export_js.py --prepared prepared --out data      # 162 MB of brain arrays
npm ci && node node_modules/electron/install.js
npm start                     # run it
npm test                      # engine tests (tiny synthetic brain)
npm run dist:linux            # or dist:mac / dist:win
```

Pushing a tag `v*` makes GitHub Actions build all three apps and attach them to a Release.

## Licences

Code: MIT. Brain data: **CC BY 4.0**, MaleCNS v1.0 by HHMI Janelia (FlyEM), Google and collaborators,
https://male-cns.janelia.org. Online answers: Wikipedia, CC BY-SA 4.0. Details: [DATA_LICENSE.md](DATA_LICENSE.md).
FruitGPT is not affiliated with OpenAI, Janelia, Google or Wikimedia.
