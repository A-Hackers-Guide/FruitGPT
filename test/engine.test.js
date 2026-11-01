// Engine tests on a tiny hand-made brain, so CI needs no 1 GB download.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { Brain, Life, writePack } = require("../src/engine/brain");
const { Fly } = require("../src/engine/talk");
const { Presets } = require("../src/presets");

// 0 sensory -> 1 relay -> 2 command (DNp01); 3 inhibits 2; 4 isolated
function tinyBrain() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "fruitgpt-"));
  const w = (name, arr) => fs.writeFileSync(path.join(d, `${name}.bin`), Buffer.from(arr.buffer));
  w("indptr", new Uint32Array([0, 1, 2, 2, 3, 3])); w("indices", new Uint32Array([1, 2, 2])); w("weight", new Uint16Array([200, 200, 400]));
  w("sign", new Int8Array([1, 1, 1, -1, 1])); w("pos", new Float32Array(15)); w("measured", new Uint8Array([1, 1, 1, 1, 1]));
  w("superclass", new Uint16Array([1, 0, 2, 0, 0])); w("cls", new Uint16Array([0, 1, 1, 1, 1])); w("subclass", new Uint16Array(5));
  w("nt", new Uint16Array([0, 0, 0, 1, 0])); w("side", new Uint16Array(5));
  fs.writeFileSync(path.join(d, "meta.json"), JSON.stringify({
    vocab: { superclass: ["cb_intrinsic", "cb_sensory", "descending_neuron"], cls: ["gustatory", "unknown"], subclass: ["unknown"], nt: ["acetylcholine", "gaba"], side: ["L", "R"] },
    body_id: [10, 11, 12, 13, 14], type: ["GRN_x", "relay", "DNp01", "inhib", "lonely"], instance: ["", "", "", "", ""] }));
  return d;
}
const dir = tinyBrain();
const b = new Brain(dir);

test("quiet without input", () => assert.strictEqual(b.simulate([], 50).counts.reduce((a, x) => a + x, 0), 0));
test("signal reaches the command neuron", () => {
  const c = b.simulate([0], 200).counts;
  assert.ok(c[1] > 0 && c[2] > 0); assert.strictEqual(c[4], 0);
});
test("inhibition suppresses", () => assert.ok(b.simulate([0, 3], 200, 5).counts[2] < b.simulate([0], 200, 5).counts[2]));
test("partners", () => {
  assert.strictEqual(b.topPartners(2, "in")[0].type, "inhib");
  assert.strictEqual(b.topPartners(0, "out")[0].type, "relay");
});
test("fly answers from data", () => {
  const f = new Fly(b);
  assert.match(f.answer("how many neurons do you have?"), /\*\*5\*\* mapped neurons/);
  assert.match(f.answer("tell me about DNp01"), /Giant Fiber/);
  assert.strictEqual(f.answer("what is the capital of France?"), null);
});
test("messages are felt as senses", () => {
  const f = new Fly(b);
  assert.deepStrictEqual(f.sense("here comes a shadow"), { sense: "loom", literal: true });
  assert.deepStrictEqual(f.sense("hello there"), { sense: "hearing", literal: false });
});

// ---- Brain Editor
const spikes = (stim, seed = 5) => b.simulate(stim, 200, seed).counts;
test("silencing a neuron stops it and what it drives", () => {
  b.setEdits({ neurons: [{ target: "relay", action: "silence" }] });
  const c = spikes([0]); assert.strictEqual(c[1], 0); assert.strictEqual(c[2], 0);
  b.setEdits(null); assert.ok(spikes([0])[2] > 0);
});
test("cutting a wire stops the signal; strengthening it adds spikes", () => {
  const before = spikes([0])[2];
  b.setEdits({ links: [{ from: "relay", to: "DNp01", gain: 0 }] }); assert.strictEqual(spikes([0])[2], 0);
  assert.deepStrictEqual(b.report.links[0], { from: "relay", to: "DNp01", gain: 0, edges: 1, synapses: 200 });
  b.setEdits({ links: [{ from: "relay", to: "DNp01", gain: 3 }] }); assert.ok(spikes([0])[2] >= before);
  b.setEdits(null); assert.strictEqual(b.simWeight[1], 200); // original wiring untouched
});
test("taking out a section silences all of it", () => {
  const r = b.setEdits({ sections: ["descending"] });
  assert.strictEqual(r.removed, 1); assert.strictEqual(spikes([0])[2], 0); b.setEdits(null);
});
test("forcing a neuron on makes it fire with no input", () => {
  b.setEdits({ neurons: [{ target: "lonely", action: "tonic" }] }); assert.ok(spikes([])[4] > 5); b.setEdits(null);
});
test("flipping makes an inhibitor excite", () => {
  b.setEdits({ neurons: [{ target: "inhib", action: "flip" }] });
  assert.ok(b.simulate([3], 200, 5).counts[2] > 0); b.setEdits(null);
});
test("dials are clamped and unknown targets reported", () => {
  const r = b.setEdits({ params: { W_SYN: 99, V_TH: "x" }, neurons: [{ target: "nope", action: "silence" }] });
  assert.strictEqual(b.p.W_SYN, 3); assert.strictEqual(b.p.V_TH, -45); assert.deepStrictEqual(r.unknown, ["nope"]);
  assert.match(new Fly(b).answer("what did you change in the brain editor?"), /silenced nope/);
  b.setEdits(null); assert.strictEqual(b.p.W_SYN, 0.15); assert.strictEqual(b.editSummary(), null);
});
test("the living animal picks up edits", () => {
  const life = new Life(b); b.setEdits({ neurons: [{ target: "DNp01", action: "tonic" }] }); life.edited();
  let s; for (let k = 0; k < 4; k++) s = life.step(100);
  assert.strictEqual(s.behaviour, "escape"); b.setEdits(null);
});
test("presets are saved to disk and examples can't be overwritten", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "fruitgpt-p-")), p = new Presets(d);
  p.save({ name: "mine", brain: "malecns", edits: { sections: ["eyes"] } });
  const again = new Presets(d).list().find((x) => x.name === "mine");
  assert.deepStrictEqual(again.edits, { sections: ["eyes"] });
  assert.throws(() => p.save({ name: "No escape: Giant Fiber silenced", brain: "malecns", edits: {} }));
  p.remove("mine"); assert.ok(!new Presets(d).list().some((x) => x.name === "mine"));
});
test("a brain packed into one .fbrain file loads the same", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fruitgpt-k-")), "tiny.fbrain");
  writePack(dir, f); const k = new Brain(f);
  assert.strictEqual(k.n, b.n); assert.deepStrictEqual([...k.weight], [...b.weight]);
  assert.deepStrictEqual([...k.simulate([0], 200, 5).counts], [...b.simulate([0], 200, 5).counts]);
});
