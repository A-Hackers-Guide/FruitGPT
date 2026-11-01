// Brain thread: keeps the 165,122-neuron simulation off the window's thread so the UI never freezes.
"use strict";
const { parentPort, workerData } = require("worker_threads");
const { Brain, Life } = require("./brain");
const { Fly } = require("./talk");

const brain = new Brain(workerData.dataDir);
const life = new Life(brain);
const fly = new Fly(brain, life);
let visible = true, busy = false;
const CPU_SHARE = 0.3; // the always-on fly uses at most ~30% of one core, and none while hidden

parentPort.postMessage({ type: "ready", neurons: brain.n, connections: brain.indices.length, synapses: brain.synapses });

parentPort.on("message", (m) => {
  if (m.type === "visible") visible = m.value;
  if (m.type === "chat") {
    busy = true;
    try {
      const felt = fly.feel(m.text);
      const answer = fly.answer(m.text) || felt.reaction;
      parentPort.postMessage({ type: "chat", id: m.id, answer, translation: felt.translation, sense: felt.sense,
        timeline: felt.summary.timeline, regions: fly.regions(felt.summary), responders: felt.summary.responders });
    } catch (e) { parentPort.postMessage({ type: "chat", id: m.id, error: String(e) }); }
    busy = false;
  }
  if (m.type === "poke") life.poke(m.sense);
});

function tick() {
  if (!visible || busy) return setTimeout(tick, 500);
  const t0 = Date.now();
  const s = life.step(100);
  parentPort.postMessage({ type: "life", ...s });
  const spent = Date.now() - t0;
  setTimeout(tick, (spent * (1 - CPU_SHARE)) / CPU_SHARE);
}
setTimeout(tick, 1000);
