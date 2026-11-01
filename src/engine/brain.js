// A brain: a real wiring diagram (connectome) run as a leaky integrate-and-fire network.
// Same model as FruitOS's fruitbrain/brain.py + life.py, after Shiu et al. 2024 (Nature).
// Which senses, command neurons and sections a brain has comes from its config.json (see tools/).
// Edits from the Brain Editor are a layer on top: the wiring loaded from disk is never changed.
"use strict";
const fs = require("fs");
const path = require("path");

const P = {
  V_REST: -52, V_RESET: -52, V_TH: -45, TAU_M: 20, TAU_SYN: 5, T_REF: 2.2,
  W_SYN: 0.15,      // mV per synapse (Shiu et al.: 0.275 on FlyWire; recalibrated for the MaleCNS)
  DELAY: 1.8, DT: 0.1, STIM_HZ: 150,
  ADAPT_MV: 4.0, TAU_ADAPT: 100,   // spike-frequency adaptation keeps this whole-CNS dataset stable
  NOISE_HZ: 1.0,    // background trickle into sensory neurons while the animal lives
};

// What the Brain Editor's dials may change, and how far.
const DIALS = {
  W_SYN: { min: 0.01, max: 3, label: "Synapse strength (mV per synapse)" },
  V_TH: { min: -51, max: -35, label: "Firing threshold (mV)" },
  TAU_M: { min: 5, max: 50, label: "Membrane memory (ms)" },
  ADAPT_MV: { min: 0, max: 15, label: "Fatigue per spike (mV)" },
  TAU_ADAPT: { min: 10, max: 500, label: "Fatigue recovery (ms)" },
  STIM_HZ: { min: 0, max: 400, label: "Sense strength (Hz)" },
  NOISE_HZ: { min: 0, max: 10, label: "Background noise (Hz)" },
};

// The MaleCNS fly, used when a data folder has no config.json (older exports, tests).
const FLY_CONFIG = require("../brains/malecns.json");
// kept for older callers
const STIMULI = FLY_CONFIG.stimuli, BEHAVIOURS = FLY_CONFIG.behaviours;

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const TYPES = { u32: Uint32Array, u16: Uint16Array, i8: Int8Array, u8: Uint8Array, f32: Float32Array };
const ARRAYS = { indptr: "u32", indices: "u32", weight: "u16", sign: "i8", pos: "f32", measured: "u8",
  superclass: "u16", cls: "u16", subclass: "u16", nt: "u16", side: "u16" };

// A brain is either a folder of .bin arrays + meta.json (+ config.json), or one .fbrain pack file:
// "FBRAIN1\n", a 4-byte little-endian header length, a JSON header, then the arrays (8-byte aligned).
function loadSource(src) {
  if (src.endsWith(".fbrain")) {
    const buf = fs.readFileSync(src);
    if (buf.toString("latin1", 0, 8) !== "FBRAIN1\n") throw new Error("not a FruitGPT brain pack");
    const hlen = buf.readUInt32LE(8), head = JSON.parse(buf.toString("utf8", 12, 12 + hlen)), base = 12 + hlen;
    const arrays = {};
    for (const [k, a] of Object.entries(head.arrays)) {
      const T = TYPES[a.type], at = base + a.offset;
      if (!T || at % T.BYTES_PER_ELEMENT || at + a.length * T.BYTES_PER_ELEMENT > buf.length) throw new Error(`bad array ${k}`);
      arrays[k] = new T(buf.buffer, buf.byteOffset + at, a.length);
    }
    return { arrays, meta: head.meta, config: head.config };
  }
  const arrays = {};
  for (const [k, t] of Object.entries(ARRAYS)) {
    const b = fs.readFileSync(path.join(src, `${k}.bin`)), T = TYPES[t];
    arrays[k] = new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
  }
  const meta = JSON.parse(fs.readFileSync(path.join(src, "meta.json"), "utf8"));
  const cfgPath = path.join(src, "config.json");
  const config = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : FLY_CONFIG;
  return { arrays, meta, config };
}

// Just the header of a .fbrain pack (name, organism, ...), without reading the arrays.
function packInfo(file) {
  const fd = fs.openSync(file, "r");
  try {
    const pre = Buffer.alloc(12); fs.readSync(fd, pre, 0, 12, 0);
    if (pre.toString("latin1", 0, 8) !== "FBRAIN1\n") throw new Error("not a FruitGPT brain pack");
    const hlen = pre.readUInt32LE(8); if (hlen > 64 * 2 ** 20) throw new Error("brain pack header too large");
    const h = Buffer.alloc(hlen); fs.readSync(fd, h, 0, hlen, 12);
    const head = JSON.parse(h.toString("utf8"));
    if (!head.config || !head.meta || !head.arrays) throw new Error("brain pack is missing parts");
    for (const k of Object.keys(ARRAYS)) if (!head.arrays[k]) throw new Error(`brain pack has no ${k}`);
    return head.config;
  } finally { fs.closeSync(fd); }
}

// Write a brain folder as one .fbrain pack (used by tools/pack_brain.js).
function writePack(dir, out) {
  const { arrays, meta, config } = loadSource(dir);
  const head = { arrays: {}, meta, config }; let off = 0; const parts = [];
  for (const [k, a] of Object.entries(arrays)) {
    const pad = (8 - (off % 8)) % 8; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    head.arrays[k] = { type: ARRAYS[k], offset: off, length: a.length };
    const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength); parts.push(b); off += b.length;
  }
  let json = Buffer.from(JSON.stringify(head));
  const pad = (8 - ((12 + json.length) % 8)) % 8; json = Buffer.concat([json, Buffer.from(" ".repeat(pad))]);
  const pre = Buffer.alloc(12); pre.write("FBRAIN1\n", 0, "latin1"); pre.writeUInt32LE(json.length, 8);
  fs.writeFileSync(out, Buffer.concat([pre, json, ...parts]));
}

class Brain {
  constructor(src) {
    const { arrays, meta, config } = loadSource(src);
    Object.assign(this, arrays);
    this.config = { ...FLY_CONFIG, ...config };
    this.vocab = meta.vocab; this.bodyId = meta.body_id; this.type = meta.type; this.instance = meta.instance;
    this.n = this.bodyId.length;
    this.typeIndex = new Map();
    this.type.forEach((t, i) => { if (t) { const k = t.toLowerCase(); if (!this.typeIndex.has(k)) this.typeIndex.set(k, []); this.typeIndex.get(k).push(i); } });
    this.bodyIndex = new Map(this.bodyId.map((b, i) => [String(b), i]));
    this.instanceIndex = new Map(); this.instance.forEach((x, i) => { if (x) { const k = x.toLowerCase(); if (!this.instanceIndex.has(k)) this.instanceIndex.set(k, []); this.instanceIndex.get(k).push(i); } });
    const n = this.n;
    this.inSyn = new Float64Array(n); this.inDeg = new Uint32Array(n); this.outSyn = new Float64Array(n);
    let synTotal = 0;
    for (let i = 0; i < n; i++) for (let e = this.indptr[i]; e < this.indptr[i + 1]; e++) {
      const w = this.weight[e]; this.outSyn[i] += w; this.inSyn[this.indices[e]] += w; this.inDeg[this.indices[e]]++; synTotal += w;
    }
    this.synapses = synTotal;
    // Connections the model leaves out (the data keeps them), e.g. the fly's KC->KC synapses.
    const ex = this.config.simExclude, excluded = [];
    if (ex && ex.typePrefix) {
      const isEx = new Uint8Array(n); this.type.forEach((t, i) => { if (t && t.startsWith(ex.typePrefix)) isEx[i] = 1; });
      for (let i = 0; i < n; i++) if (isEx[i]) for (let e = this.indptr[i]; e < this.indptr[i + 1]; e++) if (isEx[this.indices[e]]) excluded.push(e);
    }
    this.excluded = Uint32Array.from(excluded);
    this.kcRemoved = excluded.length;
    this.simWeight = new Uint16Array(this.weight.length);
    this._rev = null;
    this.setEdits(null);
  }

  get stimuli() { return this.config.stimuli; }
  get behaviours() { return this.config.behaviours; }
  label(kind, i) { return this.vocab[kind][this[kind][i]]; }
  ofType(name) { return this.typeIndex.get(String(name).toLowerCase()) || []; }
  codes(kind, values) { return new Set(this.vocab[kind].flatMap((v, k) => (values.includes(v) ? [k] : []))); }
  where(kind, values) { const c = this.codes(kind, values); const out = []; for (let i = 0; i < this.n; i++) if (c.has(this[kind][i])) out.push(i); return out; }

  // Neurons matching a rule: types / superclass / cls / subclass / side lists, all given ones must match.
  matchRule(r) {
    const tests = [];
    for (const kind of ["superclass", "cls", "subclass", "side", "nt"]) if (r[kind]) { const c = this.codes(kind, r[kind]); tests.push((i) => c.has(this[kind][i])); }
    if (r.superclassContains) { const c = new Set(this.vocab.superclass.flatMap((v, k) => (v.includes(r.superclassContains) ? [k] : []))); tests.push((i) => c.has(this.superclass[i])); }
    if (r.typePrefix) tests.push((i) => r.typePrefix.some((p) => this.type[i].startsWith(p)));
    const out = [];
    if (r.types) {
      const pool = new Set(); for (const t of r.types) for (const i of this.ofType(t)) pool.add(i);
      for (const i of [...pool].sort((a, b) => a - b)) if (tests.every((t) => t(i))) out.push(i);
    } else if (tests.length) for (let i = 0; i < this.n; i++) if (tests.every((t) => t(i))) out.push(i);
    return out;
  }

  stimSet(sense) { const s = this.stimuli[sense]; return s ? this.matchRule(s).slice(0, s.cap || 200) : []; }
  section(id) { const s = this.config.sections.find((x) => x.id === id); return s ? this.matchRule(s) : []; }

  // What a Brain Editor target names: "section:eyes", "superclass:x", "class:x", "nt:gaba", a body ID, or a cell type.
  select(target) {
    const t = String(target || "").trim(), m = t.match(/^(section|superclass|class|subclass|nt|side):(.+)$/i);
    if (m) { const kind = m[1].toLowerCase(), v = m[2].trim();
      if (kind === "section") return this.section(v);
      return this.matchRule({ [kind === "class" ? "cls" : kind]: [v] }); }
    if (/^\d+$/.test(t) && this.bodyIndex.has(t)) return [this.bodyIndex.get(t)];
    const byType = this.ofType(t);
    return byType.length ? byType : this.instanceIndex.get(t.toLowerCase()) || [];
  }

  // Everything the editor's search box can suggest.
  catalog() {
    const types = [...this.typeIndex.values()].map((idx) => [this.type[idx[0]], idx.length]).sort((a, b) => a[0].localeCompare(b[0]));
    const groups = [];
    for (const kind of ["superclass", "cls", "nt"]) {
      const count = new Uint32Array(this.vocab[kind].length); for (let i = 0; i < this.n; i++) count[this[kind][i]]++;
      this.vocab[kind].forEach((v, k) => { if (count[k] && v !== "unknown") groups.push([`${kind === "cls" ? "class" : kind}:${v}`, count[k]]); });
    }
    return { types, groups, sections: this.config.sections.map((s) => ({ id: s.id, name: s.name, count: this.section(s.id).length })),
      dials: Object.fromEntries(Object.entries(DIALS).map(([k, d]) => [k, { ...d, base: this.base[k] }])),
      excluded: this.excluded.length, excludeWhy: this.config.simExclude?.why || null };
  }

  // Apply Brain Editor edits (or null to restore the original brain). Returns a report of what changed.
  setEdits(raw) {
    const e = Brain.clean(raw), n = this.n;
    this.base = { ...P, ...(this.config.params || {}) };
    this.p = { ...this.base, ...e.params };
    this.outGain = new Float32Array(n).fill(1); this.silent = new Uint8Array(n);
    const tonic = new Uint8Array(n), report = { removed: 0, silenced: 0, tonic: 0, gain: 0, flipped: 0, links: [], unknown: [] };
    for (const id of e.sections) { const idx = this.section(id); if (!idx.length) report.unknown.push(`section:${id}`); for (const i of idx) this.silent[i] = 1; }
    for (let i = 0; i < n; i++) report.removed += this.silent[i];
    for (const r of e.neurons) {
      const idx = this.select(r.target); if (!idx.length) { report.unknown.push(r.target); continue; }
      for (const i of idx) {
        if (r.action === "silence") this.silent[i] = 1;
        else if (r.action === "tonic") tonic[i] = 1;
        else if (r.action === "flip") this.outGain[i] *= -1;
        else this.outGain[i] *= r.gain;
      }
      report[{ silence: "silenced", tonic: "tonic", flip: "flipped", gain: "gain" }[r.action]] += idx.length;
    }
    this.tonic = []; for (let i = 0; i < n; i++) if (tonic[i] && !this.silent[i]) this.tonic.push(i);
    // connections: original weights, minus the excluded ones (unless restored), then link edits
    this.simWeight.set(this.weight);
    if (!e.restoreExcluded) for (const k of this.excluded) this.simWeight[k] = 0;
    const toMask = new Uint8Array(n);
    for (const l of e.links) {
      const from = this.select(l.from), to = this.select(l.to);
      if (!from.length || !to.length) { report.unknown.push(!from.length ? l.from : l.to); continue; }
      for (const j of to) toMask[j] = 1;
      let edges = 0, syn = 0;
      for (const i of from) for (let k = this.indptr[i]; k < this.indptr[i + 1]; k++) if (toMask[this.indices[k]]) {
        this.simWeight[k] = Math.min(65535, Math.round(this.simWeight[k] * l.gain)); edges++; syn += this.weight[k];
      }
      for (const j of to) toMask[j] = 0;
      report.links.push({ from: l.from, to: l.to, gain: l.gain, edges, synapses: syn });
    }
    this.edits = e;
    report.edited = Brain.isEdited(e);
    this.report = report;
    return report;
  }

  static clean(raw) {
    const r = raw && typeof raw === "object" ? raw : {}, str = (s) => String(s ?? "").trim().slice(0, 120);
    const num = (x, lo, hi, d) => { x = Number(x); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
    const params = {};
    for (const [k, d] of Object.entries(DIALS)) if (r.params && r.params[k] !== undefined && r.params[k] !== null && r.params[k] !== "") params[k] = num(r.params[k], d.min, d.max, undefined);
    for (const k of Object.keys(params)) if (params[k] === undefined) delete params[k];
    const list = (a) => (Array.isArray(a) ? a.slice(0, 200) : []);
    return {
      params,
      sections: [...new Set(list(r.sections).map(str).filter(Boolean))],
      neurons: list(r.neurons).map((x) => ({ target: str(x && x.target), action: ["silence", "tonic", "gain", "flip"].includes(x && x.action) ? x.action : "gain",
        gain: num(x && x.gain, 0, 10, 1) })).filter((x) => x.target),
      links: list(r.links).map((x) => ({ from: str(x && x.from), to: str(x && x.to), gain: num(x && x.gain, 0, 10, 0) })).filter((x) => x.from && x.to),
      restoreExcluded: !!r.restoreExcluded,
    };
  }
  static isEdited(e) { return !!(Object.keys(e.params).length || e.sections.length || e.neurons.length || e.links.length || e.restoreExcluded); }

  // Plain-English list of the current edits, for the fly to mention.
  editSummary() {
    const e = this.edits; if (!Brain.isEdited(e)) return null;
    const out = [];
    for (const id of e.sections) out.push(`removed my ${(this.config.sections.find((s) => s.id === id) || { name: id }).name.toLowerCase()}`);
    for (const r of e.neurons) out.push({ silence: `silenced ${r.target}`, tonic: `made ${r.target} fire non-stop`, flip: `flipped ${r.target} from go to stop (or back)`,
      gain: `set ${r.target}'s output to ×${r.gain}` }[r.action]);
    for (const l of e.links) out.push(l.gain === 0 ? `cut ${l.from} → ${l.to}` : `set ${l.from} → ${l.to} to ×${l.gain}`);
    for (const [k, v] of Object.entries(e.params)) out.push(`${DIALS[k].label[0].toLowerCase() + DIALS[k].label.slice(1)}: ${this.base[k]} → ${v}`);
    if (e.restoreExcluded) out.push("put back the connections the model normally leaves out");
    return out;
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
    const cmd = new Set(this.behaviours.flatMap((b) => b.types));
    const dn = resp.filter((i) => this.label("superclass", i) === "descending_neuron" || cmd.has(this.type[i]));
    return { stimulated: stim.filter((i) => !this.silent[i]).length, responders: resp.length, bySuperclass: Object.entries(bySc).sort((a, b) => b[1] - a[1]),
      top: resp.slice(0, top).map(fmt), descending: dn.slice(0, top).map(fmt), timeline: res.timeline };
  }
}

class SimState {
  constructor(brain, seed = 1) {
    const n = brain.n; this.b = brain; this.rand = rng(seed);
    this.dsteps = Math.max(1, Math.round(P.DELAY / P.DT));
    this.v = new Float32Array(n).fill(brain.p.V_REST); this.g = new Float32Array(n); this.th = new Float32Array(n);
    this.refr = new Int16Array(n); this.pending = new Float32Array(this.dsteps * n); this.t = 0;
    this.sw = new Float32Array(n); this.refresh();
  }
  // re-read the brain's (possibly edited) settings
  refresh() { const b = this.b; for (let i = 0; i < b.n; i++) this.sw[i] = b.sign[i] * b.outGain[i] * b.p.W_SYN; }

  // Advance `ms` of brain time. `stim` neurons get Poisson input; `noise` neurons a background trickle.
  run(ms, stim = [], noise = null, noiseHz = 0, binMs = 10) {
    const b = this.b, n = b.n, p = b.p, { v, g, th, refr, pending, sw } = this, silent = b.silent, drive = b.tonic;
    const steps = Math.round(ms / p.DT), ref = Math.round(p.T_REF / p.DT);
    const am = p.DT / p.TAU_M, as = Math.exp(-p.DT / p.TAU_SYN), aa = Math.exp(-p.DT / p.TAU_ADAPT);
    const pStim = (p.STIM_HZ * p.DT) / 1000, pNoise = (noiseHz * p.DT) / 1000, pTonic = (Math.max(p.STIM_HZ, 150) * p.DT) / 1000;
    const counts = new Uint16Array(n), binSteps = Math.round(binMs / p.DT), timeline = [];
    const spk = new Uint32Array(n); let binCount = 0;
    for (let s = 0; s < steps; s++) {
      const slot = this.t % this.dsteps, off = slot * n; this.t++;
      let ns = 0;
      for (let i = 0; i < n; i++) {
        g[i] += pending[off + i]; pending[off + i] = 0;
        v[i] += am * (p.V_REST - v[i] + g[i]); g[i] *= as; th[i] *= aa;
        if (refr[i] > 0) refr[i]--; else if (v[i] >= p.V_TH + th[i] && !silent[i]) spk[ns++] = i;
      }
      for (const i of stim) if (refr[i] <= 0 && !silent[i] && v[i] < p.V_TH + th[i] && this.rand() < pStim) spk[ns++] = i;
      for (const i of drive) if (refr[i] <= 0 && v[i] < p.V_TH + th[i] && this.rand() < pTonic) spk[ns++] = i;
      if (noise) for (const i of noise) if (refr[i] <= 0 && !silent[i] && this.rand() < pNoise) spk[ns++] = i;
      for (let k = 0; k < ns; k++) {
        const i = spk[k];
        if (refr[i] > 0) continue; // already counted this step (noise + threshold)
        v[i] = p.V_RESET; refr[i] = ref; th[i] += p.ADAPT_MV; counts[i]++; binCount++;
        const w = sw[i];
        if (w !== 0) for (let e = b.indptr[i], end = b.indptr[i + 1]; e < end; e++) pending[off + b.indices[e]] += b.simWeight[e] * w;
        // writing into the slot just read means it arrives exactly `dsteps` steps later = the synaptic delay
      }
      if ((s + 1) % binSteps === 0) { timeline.push(binCount); binCount = 0; }
    }
    return { counts, ms, timeline };
  }
}

// The always-on animal: runs in small chunks; behaviour is decided by the command neurons only.
class Life {
  constructor(brain, seed = 7) {
    this.b = brain; this.state = new SimState(brain, seed);
    const sens = brain.codes("superclass", brain.vocab.superclass.filter((s) => s.includes("sensory")));
    this.noise = []; for (let i = 0; i < brain.n; i++) if (sens.has(brain.superclass[i])) this.noise.push(i);
    this.groups = brain.behaviours.map((g) => ({ ...g, idx: g.types.flatMap((t) => brain.ofType(t)) }));
    this.stim = Object.fromEntries(Object.keys(brain.stimuli).map((s) => [s, brain.stimSet(s)]));
    this.recent = []; this.queue = []; this.behaviour = "rest"; this.side = null; this.because = null;
    this.commands = []; this.active = 0; this.brainMs = 0; this.rates = {};
  }
  edited() { this.state.refresh(); }
  poke(sense, ms = 500) { if (this.b.stimuli[sense]) this.queue.push([sense, ms]); }
  step(chunk = 100) {
    const sense = this.queue.length ? this.queue[0][0] : null;
    if (this.queue.length && (this.queue[0][1] -= chunk) <= 0) this.queue.shift();
    const out = this.state.run(chunk, sense ? this.stim[sense] : [], this.noise, this.b.p.NOISE_HZ, chunk);
    this.recent.push(out.counts); if (this.recent.length > 3) this.recent.shift();
    this.brainMs += chunk; this.active = out.timeline[0] || 0;
    const secs = (this.recent.length * chunk) / 1000, total = (i) => this.recent.reduce((s, c) => s + c[i], 0) / secs;
    // "first": the first group over threshold wins (escape beats walking); "strongest": the busiest group wins
    const strongest = this.b.config.decide === "strongest";
    let chosen = "rest", side = null, best = 0;
    for (const g of this.groups) {
      if (!g.idx.length) continue;
      const r = g.idx.map(total), mean = r.reduce((a, x) => a + x, 0) / r.length; this.rates[g.name] = mean;
      if ((strongest ? mean > best : chosen === "rest") && mean >= g.hz) {
        chosen = g.name; best = mean; side = null;
        if (g.sided) { let L = 0, R = 0; g.idx.forEach((i, k) => (this.b.label("side", i) === "L" ? (L += r[k]) : (R += r[k]))); side = L > R ? "left" : "right"; }
      }
    }
    if (chosen !== this.behaviour) this.because = sense;
    this.behaviour = chosen; this.side = side;
    return this.snapshot();
  }
  snapshot() {
    const g = this.groups.find((x) => x.name === this.behaviour);
    return { behaviour: this.behaviour, side: this.side, because: this.because, does: g ? g.does : "rest", word: g ? g.word || g.does : "resting",
      alarm: !!(g && g.alarm), types: g ? g.types : [], cite: g ? g.cite : null, active: this.active, brainMs: this.brainMs,
      feeling: this.queue.length ? this.queue[0][0] : null };
  }
}

module.exports = { Brain, SimState, Life, STIMULI, BEHAVIOURS, P, DIALS, FLY_CONFIG, loadSource, writePack, packInfo };
