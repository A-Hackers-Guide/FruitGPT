// The fly's brain: the MaleCNS v1.0 wiring diagram run as a leaky integrate-and-fire network.
// JavaScript port of FruitOS's fruitbrain/brain.py + life.py (same model, same numbers).
// Model after Shiu et al. 2024 (Nature), recalibrated for this dataset; see README "Limits".
"use strict";
const fs = require("fs");
const path = require("path");

const P = {
  V_REST: -52, V_RESET: -52, V_TH: -45, TAU_M: 20, TAU_SYN: 5, T_REF: 2.2,
  W_SYN: 0.15,      // mV per synapse (Shiu et al.: 0.275 on FlyWire; recalibrated for the MaleCNS)
  DELAY: 1.8, DT: 0.1, STIM_HZ: 150,
  ADAPT_MV: 4.0, TAU_ADAPT: 100,   // spike-frequency adaptation keeps this whole-CNS dataset stable
};

// Command neurons whose job was shown in experiments. Behaviour is read only from these.
const BEHAVIOURS = [
  { name: "escape", types: ["DNp01"], does: "jump and take off", hz: 20, cite: "von Reyn et al. 2014" },
  { name: "backward", types: ["MDN"], does: "walk backward", hz: 20, cite: "Bidaye et al. 2014" },
  { name: "turn", types: ["DNa01", "DNa02"], does: "turn", hz: 20, cite: "Rayshubskiy et al. 2020; Yang et al. 2023" },
  { name: "forward", types: ["DNp09"], does: "walk forward", hz: 20, cite: "Bidaye et al. 2020" },
];

// What the learner can make the fly feel: one real receptor cell type per sense.
const STIMULI = {
  smell: { types: ["ORN_DA1"], say: "a puff of fly scent (my DA1 smell channel)", cap: 100 },
  taste: { types: ["claw_tpGRN"], say: "something touching the taste hairs on my feet", cap: 60 },
  loom: { types: ["LPLC2", "LC4"], say: "a dark shadow rushing toward me", cap: 150 },
  hearing: { subclass: ["auditory"], say: "a sound near my antennae", cap: 100 },
  wind: { subclass: ["wind_gravity"], say: "a gust of wind", cap: 100 },
  touch: { types: ["SNta29"], say: "a touch on my body hairs", cap: 100 },
  heat: { cls: ["thermosensory"], say: "a warm spot", cap: 25 },
  humidity: { cls: ["hygrosensory"], say: "damp air", cap: 66 },
};

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class Brain {
  constructor(dataDir) {
    const load = (name, T) => { const b = fs.readFileSync(path.join(dataDir, `${name}.bin`));
      return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
    this.indptr = load("indptr", Uint32Array);
    this.indices = load("indices", Uint32Array);
    this.weight = load("weight", Uint16Array);
    this.sign = load("sign", Int8Array);
    this.pos = load("pos", Float32Array);
    this.measured = load("measured", Uint8Array);
    for (const k of ["superclass", "cls", "subclass", "nt", "side"]) this[k] = load(k, Uint16Array);
    const meta = JSON.parse(fs.readFileSync(path.join(dataDir, "meta.json"), "utf8"));
    this.vocab = meta.vocab; this.bodyId = meta.body_id; this.type = meta.type; this.instance = meta.instance;
    this.n = this.bodyId.length;
    this.typeIndex = new Map();
    this.type.forEach((t, i) => { if (t) { const k = t.toLowerCase(); if (!this.typeIndex.has(k)) this.typeIndex.set(k, []); this.typeIndex.get(k).push(i); } });
    const n = this.n;
    this.inSyn = new Float64Array(n); this.inDeg = new Uint32Array(n); this.outSyn = new Float64Array(n);
    let synTotal = 0;
    for (let i = 0; i < n; i++) for (let e = this.indptr[i]; e < this.indptr[i + 1]; e++) {
      const w = this.weight[e]; this.outSyn[i] += w; this.inSyn[this.indices[e]] += w; this.inDeg[this.indices[e]]++; synTotal += w;
    }
    this.synapses = synTotal;
    // Kenyon cell -> Kenyon cell synapses (mostly axo-axonal) make point-neuron models run away:
    // the simulation leaves them out, the data keeps them.
    const isKC = new Uint8Array(n); this.type.forEach((t, i) => { if (t.startsWith("KC")) isKC[i] = 1; });
    this.simWeight = new Uint16Array(this.weight);
    let removed = 0;
    for (let i = 0; i < n; i++) if (isKC[i]) for (let e = this.indptr[i]; e < this.indptr[i + 1]; e++)
      if (isKC[this.indices[e]]) { this.simWeight[e] = 0; removed++; }
    this.kcRemoved = removed;
    this._rev = null;
  }

  label(kind, i) { return this.vocab[kind][this[kind][i]]; }
  ofType(name) { return this.typeIndex.get(String(name).toLowerCase()) || []; }
  codes(kind, values) { return new Set(this.vocab[kind].flatMap((v, k) => (values.includes(v) ? [k] : []))); }
  where(kind, values) { const c = this.codes(kind, values); const out = []; for (let i = 0; i < this.n; i++) if (c.has(this[kind][i])) out.push(i); return out; }

  stimSet(sense) {
    const s = STIMULI[sense]; let idx = [];
    if (s.types) for (const t of s.types) idx.push(...this.ofType(t));
    if (s.cls) idx.push(...this.where("cls", s.cls));
    if (s.subclass) idx.push(...this.where("subclass", s.subclass));
    return idx.slice(0, s.cap);
  }

  outputs(i) { const a = this.indptr[i], b = this.indptr[i + 1]; return [this.indices.subarray(a, b), this.weight.subarray(a, b)]; }
  inputs(i) {
    if (!this._rev) { // reverse index built once, on first use
      const n = this.n, ptr = new Uint32Array(n + 1);
      for (let k = 0; k < n; k++) ptr[k + 1] = ptr[k] + this.inDeg[k];
      const fill = ptr.slice(0, n), pre = new Uint32Array(this.indices.length), w = new Uint16Array(this.indices.length);
      for (let s = 0; s < n; s++) for (let e = this.indptr[s]; e < this.indptr[s + 1]; e++) { const t = this.indices[e], at = fill[t]++; pre[at] = s; w[at] = this.weight[e]; }
      this._rev = { ptr, pre, w };
    }
    const { ptr, pre, w } = this._rev;
    return [pre.subarray(ptr[i], ptr[i + 1]), w.subarray(ptr[i], ptr[i + 1])];
  }
  topPartners(i, dir = "out", k = 6) {
    const [idx, w] = dir === "out" ? this.outputs(i) : this.inputs(i);
    return Array.from(w.keys()).sort((a, b) => w[b] - w[a]).slice(0, k).map((j) => ({ index: idx[j], type: this.type[idx[j]] || "(untyped)", synapses: w[j] }));
  }
  describe(i) {
    return { index: i, bodyId: this.bodyId[i], type: this.type[i], instance: this.instance[i], superclass: this.label("superclass", i),
      transmitter: this.label("nt", i), inputs: this.inDeg[i], outputs: this.indptr[i + 1] - this.indptr[i],
      inputSynapses: this.inSyn[i], outputSynapses: this.outSyn[i] };
  }

  // one-off experiment from a resting brain
  simulate(stim, ms = 300, seed = 1) { return new SimState(this, seed).run(ms, stim); }

  summarize(res, stim, top = 8) {
    const isStim = new Uint8Array(this.n); for (const i of stim) isStim[i] = 1;
    const resp = []; const bySc = {};
    for (let i = 0; i < this.n; i++) if (res.counts[i] > 0 && !isStim[i]) { resp.push(i); const s = this.label("superclass", i); bySc[s] = (bySc[s] || 0) + 1; }
    resp.sort((a, b) => res.counts[b] - res.counts[a]);
    const hz = (i) => Math.round((res.counts[i] / (res.ms / 1000)) * 10) / 10;
    const fmt = (i) => ({ index: i, type: this.type[i] || "(untyped)", superclass: this.label("superclass", i), hz: hz(i) });
    const dn = resp.filter((i) => this.label("superclass", i) === "descending_neuron");
    return { stimulated: stim.length, responders: resp.length, bySuperclass: Object.entries(bySc).sort((a, b) => b[1] - a[1]),
      top: resp.slice(0, top).map(fmt), descending: dn.slice(0, top).map(fmt), timeline: res.timeline };
  }
}

class SimState {
  constructor(brain, seed = 1) {
    const n = brain.n; this.b = brain; this.rand = rng(seed);
    this.dsteps = Math.max(1, Math.round(P.DELAY / P.DT));
    this.v = new Float32Array(n).fill(P.V_REST); this.g = new Float32Array(n); this.th = new Float32Array(n);
    this.refr = new Int16Array(n); this.pending = new Float32Array(this.dsteps * n); this.t = 0;
    this.sw = new Float32Array(n); for (let i = 0; i < n; i++) this.sw[i] = brain.sign[i] * P.W_SYN;
  }

  // Advance `ms` of brain time. `stim` neurons get Poisson input; `noise` neurons a background trickle.
  run(ms, stim = [], noise = null, noiseHz = 0, binMs = 10) {
    const b = this.b, n = b.n, { v, g, th, refr, pending, sw } = this;
    const steps = Math.round(ms / P.DT), ref = Math.round(P.T_REF / P.DT);
    const am = P.DT / P.TAU_M, as = Math.exp(-P.DT / P.TAU_SYN), aa = Math.exp(-P.DT / P.TAU_ADAPT);
    const pStim = (P.STIM_HZ * P.DT) / 1000, pNoise = (noiseHz * P.DT) / 1000;
    const counts = new Uint16Array(n), binSteps = Math.round(binMs / P.DT), timeline = [];
    const spk = new Uint32Array(n); let binCount = 0;
    for (let s = 0; s < steps; s++) {
      const slot = this.t % this.dsteps, off = slot * n; this.t++;
      let ns = 0;
      for (let i = 0; i < n; i++) {
        g[i] += pending[off + i]; pending[off + i] = 0;
        v[i] += am * (P.V_REST - v[i] + g[i]); g[i] *= as; th[i] *= aa;
        if (refr[i] > 0) refr[i]--; else if (v[i] >= P.V_TH + th[i]) spk[ns++] = i;
      }
      for (const i of stim) if (refr[i] <= 0 && v[i] < P.V_TH + th[i] && this.rand() < pStim) spk[ns++] = i;
      if (noise) for (const i of noise) if (refr[i] <= 0 && this.rand() < pNoise) spk[ns++] = i;
      for (let k = 0; k < ns; k++) {
        const i = spk[k];
        if (refr[i] > 0) continue; // already counted this step (noise + threshold)
        v[i] = P.V_RESET; refr[i] = ref; th[i] += P.ADAPT_MV; counts[i]++; binCount++;
        const w = sw[i];
        if (w !== 0) for (let e = b.indptr[i], end = b.indptr[i + 1]; e < end; e++) pending[off + b.indices[e]] += b.simWeight[e] * w;
        // writing into the slot just read means it arrives exactly `dsteps` steps later = the synaptic delay
      }
      if ((s + 1) % binSteps === 0) { timeline.push(binCount); binCount = 0; }
    }
    return { counts, ms, timeline };
  }
}

// The always-on fly: runs in small chunks; behaviour is decided by the command neurons only.
class Life {
  constructor(brain, seed = 7) {
    this.b = brain; this.state = new SimState(brain, seed);
    const sens = brain.codes("superclass", brain.vocab.superclass.filter((s) => s.includes("sensory")));
    this.noise = []; for (let i = 0; i < brain.n; i++) if (sens.has(brain.superclass[i])) this.noise.push(i);
    this.groups = BEHAVIOURS.map((g) => ({ ...g, idx: g.types.flatMap((t) => brain.ofType(t)) }));
    this.stim = Object.fromEntries(Object.keys(STIMULI).map((s) => [s, brain.stimSet(s)]));
    this.recent = []; this.queue = []; this.behaviour = "rest"; this.side = null; this.because = null;
    this.commands = []; this.active = 0; this.brainMs = 0; this.rates = {};
  }
  poke(sense, ms = 500) { if (STIMULI[sense]) this.queue.push([sense, ms]); }
  step(chunk = 100) {
    const sense = this.queue.length ? this.queue[0][0] : null;
    if (this.queue.length && (this.queue[0][1] -= chunk) <= 0) this.queue.shift();
    const out = this.state.run(chunk, sense ? this.stim[sense] : [], this.noise, 1.0, chunk);
    this.recent.push(out.counts); if (this.recent.length > 3) this.recent.shift();
    this.brainMs += chunk; this.active = out.timeline[0] || 0;
    const secs = (this.recent.length * chunk) / 1000, total = (i) => this.recent.reduce((s, c) => s + c[i], 0) / secs;
    let chosen = "rest", side = null;
    for (const g of this.groups) {
      if (!g.idx.length) continue;
      const r = g.idx.map(total), mean = r.reduce((a, x) => a + x, 0) / r.length; this.rates[g.name] = mean;
      if (chosen === "rest" && mean >= g.hz) {
        chosen = g.name;
        if (g.name === "turn") { let L = 0, R = 0; g.idx.forEach((i, k) => (this.b.label("side", i) === "L" ? (L += r[k]) : (R += r[k]))); side = L > R ? "left" : "right"; }
      }
    }
    if (chosen !== this.behaviour) this.because = sense;
    this.behaviour = chosen; this.side = side;
    return this.snapshot();
  }
  snapshot() {
    const g = this.groups.find((x) => x.name === this.behaviour);
    return { behaviour: this.behaviour, side: this.side, because: this.because, does: g ? g.does : "rest",
      types: g ? g.types : [], cite: g ? g.cite : null, active: this.active, brainMs: this.brainMs,
      feeling: this.queue.length ? this.queue[0][0] : null };
  }
}

module.exports = { Brain, SimState, Life, STIMULI, BEHAVIOURS, P };
