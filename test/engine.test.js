// Engine tests on a tiny hand-made brain, so CI needs no 1 GB download.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { Brain } = require("../src/engine/brain");
const { Fly } = require("../src/engine/talk");

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
  return new Brain(d);
}
const b = tinyBrain();

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
  assert.match(f.answer("how many neurons do you have?"), /\*\*5\*\* fully traced neurons/);
  assert.match(f.answer("tell me about DNp01"), /Giant Fiber/);
  assert.strictEqual(f.answer("what is the capital of France?"), null);
});
test("messages are felt as senses", () => {
  const f = new Fly(b);
  assert.deepStrictEqual(f.sense("here comes a shadow"), { sense: "loom", literal: true });
  assert.deepStrictEqual(f.sense("hello there"), { sense: "hearing", literal: false });
});
