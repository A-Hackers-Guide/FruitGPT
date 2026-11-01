// Pack a brain folder (the .bin arrays + meta.json + config.json written by tools/export_js.py) into one
// .fbrain file that anyone can add to FruitGPT with "Add a brain file…".
//   node tools/pack_brain.js data/brains/worm worm.fbrain
"use strict";
const { writePack, Brain } = require("../src/engine/brain");
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error("usage: node tools/pack_brain.js BRAIN_DIR OUT.fbrain"); process.exit(1); }
writePack(dir, out);
const b = new Brain(out);
console.log(`${out}: ${b.config.name}, ${b.n.toLocaleString()} neurons, ${b.indices.length.toLocaleString()} connections`);
