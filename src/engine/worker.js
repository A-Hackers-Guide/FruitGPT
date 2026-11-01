// Brain thread: keeps the simulation off the window's thread so the UI never freezes.
// One brain is loaded at a time; switching brains starts a fresh worker.
"use strict";
const { parentPort, workerData } = require("worker_threads");
const { Brain, Life } = require("./brain");
const { Fly } = require("./talk");

const brain = new Brain(workerData.src);
const life = new Life(brain);
let fly = new Fly(brain, life);
let visible = true, busy = false;
const CPU_SHARE = 0.3; // the always-on animal uses at most ~30% of one core, and none while hidden

const c = brain.config;
parentPort.postMessage({ type: "ready", id: workerData.id, name: c.name, organism: c.organism, credit: c.credit, licence: c.licence, url: c.url,
  neurons: brain.n, connections: brain.indices.length, synapses: brain.synapses, senses: Object.keys(brain.stimuli),
  behaviours: brain.behaviours.map((g) => ({ name: g.name, word: g.word || g.does, alarm: !!g.alarm })), catalog: brain.catalog() });

function editNote() { const e = brain.editSummary(); return e ? `\n\n*Brain Editor changes in effect: ${e.join("; ")}.*` : ""; }

parentPort.on("message", (m) => {
  if (m.type === "visible") visible = m.value;
  if (m.type === "points") { // 3D layout for the editor, sent once on request
    const pos = Float32Array.from(brain.pos), sc = Uint8Array.from(brain.superclass, (x) => Math.min(255, x));
    parentPort.postMessage({ type: "points", id: m.id, pos, sc, superclasses: brain.vocab.superclass }, [pos.buffer, sc.buffer]);
  }
  if (m.type === "edits") {
    busy = true;
    try {
      const report = brain.setEdits(m.edits); life.edited();
      const silent = Uint8Array.from(brain.silent), tonic = new Uint8Array(brain.n), gain = new Uint8Array(brain.n);
      for (const i of brain.tonic) tonic[i] = 1;
      for (let i = 0; i < brain.n; i++) if (brain.outGain[i] !== 1) gain[i] = 1;
      parentPort.postMessage({ type: "edited", id: m.id, report, edits: brain.edits, silent, tonic, gain }, [silent.buffer, tonic.buffer, gain.buffer]);
    } catch (e) { parentPort.postMessage({ type: "edited", id: m.id, error: String(e) }); }
    busy = false;
  }
  if (m.type === "chat") {
    busy = true;
    try {
      const felt = fly.feel(m.text);
      const answer = fly.answer(m.text) || felt.reaction;
      parentPort.postMessage({ type: "chat", id: m.id, answer, translation: felt.translation + editNote(), sense: felt.sense,
        timeline: felt.summary.timeline, regions: fly.regions(felt.summary), responders: felt.summary.responders, brain: workerData.id });
    } catch (e) { parentPort.postMessage({ type: "chat", id: m.id, error: String(e) }); }
    busy = false;
  }
  if (m.type === "poke") life.poke(m.sense);
});

function tick() {
  if (!visible || busy) return setTimeout(tick, 500);
  const t0 = Date.now();
  const s = life.step(100);
  parentPort.postMessage({ type: "life", brain: workerData.id, ...s });
  const spent = Date.now() - t0;
  setTimeout(tick, Math.max(20, (spent * (1 - CPU_SHARE)) / CPU_SHARE));
}
setTimeout(tick, 1000);
