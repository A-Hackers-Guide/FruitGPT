// Presets: saved Brain Editor setups. Example presets ship with the app; the user's own are stored
// in the app's data folder (presets.json). Unsaved edits live only in memory and vanish on quit.
"use strict";
const fs = require("fs");
const path = require("path");

const EXAMPLES = [
  { name: "No escape: Giant Fiber silenced", brain: "malecns", note: "Shadows still reach the brain, but the escape neuron can't fire.",
    edits: { neurons: [{ target: "DNp01", action: "silence" }] } },
  { name: "Blind to danger: looming → Giant Fiber cut", brain: "malecns", note: "Cuts only the wires from the looming detectors to the Giant Fiber.",
    edits: { links: [{ from: "LPLC2", to: "DNp01", gain: 0 }, { from: "LC4", to: "DNp01", gain: 0 }] } },
  { name: "Moonwalker: MDN always on", brain: "malecns", note: "Forces the moonwalker neurons to fire, so the fly walks backward.",
    edits: { neurons: [{ target: "MDN", action: "tonic" }] } },
  { name: "No eyes: optic lobes removed", brain: "malecns", note: "Takes out every optic-lobe neuron; a shadow now goes unseen.",
    edits: { sections: ["eyes"] } },
  { name: "Worm without command neurons", brain: "worm", note: "Removes AVA, AVB, AVD, AVE and PVC: the worm can sense but can't decide which way to crawl.",
    edits: { sections: ["command"] } },
];

const MAX = 200;
class Presets {
  constructor(dir) { this.file = path.join(dir, "presets.json"); }
  read() {
    try { const v = JSON.parse(fs.readFileSync(this.file, "utf8")); return Array.isArray(v) ? v.filter((p) => p && typeof p.name === "string") : []; }
    catch { return []; }
  }
  write(list) { // write-then-rename so a crash never leaves a half-written file
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(list, null, 1)); fs.renameSync(this.file + ".tmp", this.file);
  }
  list() { return [...EXAMPLES.map((p) => ({ ...p, example: true })), ...this.read()]; }
  save(p) {
    const name = String(p.name || "").trim().slice(0, 60);
    if (!name) throw new Error("A preset needs a name.");
    if (EXAMPLES.some((x) => x.name === name)) throw new Error("That name belongs to an example preset.");
    const list = this.read().filter((x) => x.name !== name);
    list.push({ name, brain: String(p.brain), edits: p.edits, saved: new Date().toISOString() });
    this.write(list.slice(-MAX));
    return this.list();
  }
  remove(name) { this.write(this.read().filter((x) => x.name !== name)); return this.list(); }
}

module.exports = { Presets, EXAMPLES };
