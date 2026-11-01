// The fly talks back, and its neural activity gets translated into English.
// A fly can't read words, so every message is *felt*: a sense word drives that sense, anything else
// reaches the fly as a sound (the way a real fly would sense your voice). The brain runs, and this file
// turns what its neurons did into plain English. Facts come only from the connectome.
"use strict";
const { STIMULI } = require("./brain");

const KNOWN = {
  DNp01: ["my Giant Fiber", "it makes me jump and take off to escape (von Reyn et al. 2014)"],
  MDN: ["a moonwalker neuron", "it makes me walk backward (Bidaye et al. 2014)"],
  DNp09: ["a forward-walking command neuron", "it makes me walk forward (Bidaye et al. 2020)"],
  DNa01: ["a steering neuron", "it helps me turn while walking (Rayshubskiy et al. 2020)"],
  DNa02: ["a steering neuron", "it makes me turn toward its side (Rayshubskiy et al. 2020)"],
  LPLC2: ["a looming detector", "it fires when something dark grows quickly in my view (Ache et al. 2019)"],
  LC4: ["a looming detector", "it signals how fast a threat approaches (von Reyn et al. 2017)"],
  APL: ["my mushroom-body brake", "it inhibits my Kenyon cells so only a few fire, keeping memories distinct"],
};
const ALIASES = { "giant fiber": "DNp01", "giant fibre": "DNp01", moonwalker: "MDN", apl: "APL" };
const NT_TEXT = {
  acetylcholine: "my main 'go' signal: it excites the next neuron",
  gaba: "a 'stop' signal: it inhibits the next neuron",
  glutamate: "in my brain mostly a 'stop' signal (it opens chloride channels), though it excites my muscles",
  histamine: "what my eyes' photoreceptors release; it inhibits the next cells",
  dopamine: "a modulator for reward, punishment and learning, especially in my mushroom body",
  serotonin: "a slow modulator of feeding, sleep and mood-like states",
  octopamine: "my version of adrenaline: it gets me ready for action",
};
const FRIENDLY = {
  ol_intrinsic: "optic-lobe", cb_intrinsic: "central-brain", vnc_intrinsic: "nerve-cord", visual_projection: "visual projection",
  descending_neuron: "descending (brain-to-body command)", ascending_neuron: "ascending (body-to-brain)", vnc_motor: "motor",
  cb_sensory: "head sensory", vnc_sensory: "body sensory", ol_sensory: "eye sensory", visual_centrifugal: "visual feedback",
};
const friendly = (s) => FRIENDLY[s] || s.replaceAll("_", " ");
const ntName = (s) => (s === "gaba" ? "GABA" : s);
const fmt = (x) => Math.round(x).toLocaleString("en-US");
const SENSE_WORDS = [
  ["loom", /shadow|loom|swat|hand|threat|predator|scare|attack|danger/],
  ["smell", /smell|scent|odou?r|sniff|perfume|banana|fruit/],
  ["taste", /taste|sugar|food|lick|eat|hungry/],
  ["wind", /wind|blow|breeze|gust/],
  ["touch", /touch|poke|tickle|pet|stroke|tap/],
  ["heat", /heat|warm|hot|temperature/],
  ["humidity", /humid|damp|moist|wet|rain/],
  ["hearing", /sound|hear|buzz|sing|song|noise|music|loud/],
];

class Fly {
  constructor(brain, life = null) {
    this.b = brain; this.life = life;
    this.typesByLength = [...brain.typeIndex.keys()].sort((a, b) => b.length - a.length);
  }

  // What the fly physically senses from a message.
  sense(text) {
    const low = text.toLowerCase();
    const hit = SENSE_WORDS.find(([, re]) => re.test(low));
    return hit ? { sense: hit[0], literal: true } : { sense: "hearing", literal: false };
  }

  // Run the brain on the felt message, then translate the activity into English.
  feel(text) {
    const { sense, literal } = this.sense(text);
    if (this.life) this.life.poke(sense, 500);
    const stim = this.life ? this.life.stim[sense] : this.b.stimSet(sense);
    const res = this.b.simulate(stim, 300, (text.length * 2654435761) >>> 0);
    const sm = this.b.summarize(res, stim, 8);
    return { sense, literal, summary: sm, translation: this.translate(sense, literal, sm), reaction: literal ? this.react(sense, sm) : null };
  }

  // The fly's first-person reaction to a sensation, decided by which command neurons fired.
  react(sense, sm) {
    const dns = new Set(sm.descending.map((d) => d.type));
    const felt = `I felt ${STIMULI[sense].say}.`;
    if (dns.has("DNp01")) return `**Whoa!** ${felt} My Giant Fiber (DNp01) fired: I'm jumping away! Nobody scripted that; my own wiring decided it.`;
    if (dns.has("MDN")) return `${felt} My moonwalker neurons fired, so I'm backing away.`;
    if (dns.has("DNa01") || dns.has("DNa02")) return `${felt} My steering neurons fired, so I'm turning.`;
    if (dns.has("DNp09")) return `${felt} My forward-walking neurons fired, so I'm walking.`;
    if (dns.size) return `${felt} ${fmt(sm.responders)} of my neurons are buzzing and my brain sent orders down ${[...dns].slice(0, 3).join(", ")}, command neurons whose jobs science hasn't worked out yet. So I'm not making a movement anyone could predict.`;
    return `${felt} ${fmt(sm.responders)} of my neurons noticed, but none of my command neurons fired, so I'm staying still.`;
  }

  regions(sm) { return sm.bySuperclass.slice(0, 5).map(([k, v]) => [friendly(k), v]); }

  translate(sense, literal, sm) {
    const felt = literal ? `I felt ${STIMULI[sense].say}.` : "I can't read words; to me your message was a sound near my antennae.";
    const regions = sm.bySuperclass.slice(0, 3).map(([k, v]) => `${fmt(v)} ${friendly(k)}`).join(", ");
    let out = `${felt} ${sm.stimulated} of my sensory neurons fired, and within 300 ms ${fmt(sm.responders)} more neurons answered` +
      (regions ? ` (${regions}).` : ".");
    const dns = [...new Set(sm.descending.map((d) => d.type))].slice(0, 4);
    if (dns.length) {
      const known = dns.filter((d) => KNOWN[d]).map((d) => `**${d}**: ${KNOWN[d][1]}`);
      out += ` My brain sent commands to my body through ${dns.join(", ")}.`;
      out += known.length ? ` ${known.join(". ")}.` : " Science doesn't know yet exactly what those command neurons do.";
    } else out += " No command neurons fired, so my body stays still.";
    const peak = Math.max(...sm.timeline), at = sm.timeline.indexOf(peak) * 10;
    if (peak > 0) out += ` Activity peaked ${at} ms after it started.`;
    return out;
  }

  // Facts the fly knows about itself. Returns markdown, or null if the question isn't about its brain.
  answer(text) {
    const t = text.trim(), low = t.toLowerCase(), b = this.b;
    if (/^(hi|hello|hey|yo|howdy|greetings)\b/.test(low) || /who are you|^what are you\??$/.test(low))
      return `Hello! I'm a male fruit fly, *Drosophila melanogaster*. All **${fmt(b.n)} neurons** and **${fmt(b.synapses)} synapses** of my nervous system were mapped from a real fly by HHMI Janelia, Google and their partners, and my brain is running right now on your computer. Ask me about my brain, or make me feel something: "here comes a shadow!"`;
    if (/what are you doing|why did you|how are you/.test(low) && this.life) {
      const s = this.life.snapshot();
      if (s.behaviour === "rest") return "I'm resting: my escape, walking and steering command neurons are quiet. Wave a shadow at me and see what my brain decides!";
      return `I'm about to **${s.does}${s.side ? ` to the ${s.side}` : ""}**${s.because ? ` because I felt ${STIMULI[s.because].say}` : ""}! My ${s.types.join("/")} command neurons are firing (${s.cite}).`;
    }
    if (/how (do|does) (you|this|it) work|simulat|are you real|accurate|model/.test(low))
      return `Honest answer: I'm the real wiring diagram of a fly run as a simplified model. Each of my ${fmt(b.n)} neurons is a *leaky integrate-and-fire* unit; each synapse pushes the next neuron up (acetylcholine) or down (GABA, glutamate, histamine). The method follows Shiu et al. 2024 (*Nature*), retuned for this larger dataset: 0.15 mV per synapse, spike-frequency adaptation, and the ${fmt(b.kcRemoved)} Kenyon-cell-to-Kenyon-cell connections left out of the simulation. Not modelled: dopamine and other slow chemicals, gap junctions, neuron shapes, my body, and learning. And I don't understand language: FruitGPT translates what my neurons *do* into English.`;
    if (/human|people|compare/.test(low))
      return `A human brain has about **86 billion** neurons; I have **${fmt(b.n)}** traced ones, so you have roughly ${fmt(86e9 / b.n)} times more. Yet my brain sees, smells, flies, walks, courts, learns and remembers, and it's small enough that every connection has been mapped.`;
    if (/how many|number of/.test(low)) {
      if (/synap/.test(low)) return `I have **${fmt(b.synapses)}** synapses between my traced neurons.`;
      if (/connect/.test(low)) return `My neurons make **${fmt(b.indices.length)}** neuron-to-neuron connections from ${fmt(b.synapses)} synapses.`;
      if (/type|kind/.test(low)) return `My neurons come in **${fmt(b.typeIndex.size)}** named cell types.`;
      return `I have **${fmt(b.n)}** fully traced neurons, linked by ${fmt(b.indices.length)} connections and ${fmt(b.synapses)} synapses.`;
    }
    if (/most connected|biggest neuron|hub/.test(low)) {
      let best = 0; for (let i = 0; i < b.n; i++) if (b.inSyn[i] + b.outSyn[i] > b.inSyn[best] + b.outSyn[best]) best = i;
      const d = b.describe(best);
      return `My most connected neuron is **${d.type}** (${d.instance}) in my ${friendly(d.superclass)} region: ${fmt(d.inputSynapses)} synapses in and ${fmt(d.outputSynapses)} out.`;
    }
    for (const [nt, desc] of Object.entries(NT_TEXT)) if (low.includes(nt)) {
      const c = b.where("nt", [nt]).length;
      return `**${ntName(nt)[0].toUpperCase() + ntName(nt).slice(1)}** is ${desc}. ${fmt(c)} of my neurons (${((100 * c) / b.n).toFixed(1)}%) are predicted to use it.`;
    }
    if (/mushroom|kenyon|memory|learn|remember/.test(low)) {
      const kc = b.type.filter((x) => x.startsWith("KC")).length;
      return `My mushroom bodies are where I learn and remember, especially smells. They hold **${fmt(kc)} Kenyon cells**; each odour switches on only a few percent of them, and my APL neuron enforces that sparse code by inhibiting them all. Dopamine neurons label memories as good or bad. (My simulation doesn't change synapses, so I don't form new memories while we chat.)`;
    }
    if (/descending|command neuron|control your body/.test(low))
      return `Orders travel from my brain to my body through **${fmt(b.where("superclass", ["descending_neuron"]).length)} descending neurons**. Scientists know the jobs of only some: DNp01 (escape jump), MDN (walk backward), DNp09 (walk forward), DNa01/DNa02 (steering). In FruitGPT, those decide what I do.`;
    // a specific neuron type
    let name = Object.entries(ALIASES).find(([a]) => low.includes(a))?.[1];
    if (!name) { const words = new Set(low.match(/[a-z0-9_+\-,()]+/g) || []); name = this.typesByLength.find((x) => x.length > 2 && words.has(x)); }
    if (name) {
      const idx = b.ofType(name), i = idx[0], d = b.describe(i), k = KNOWN[d.type];
      const ins = b.topPartners(i, "in", 4).map((p) => `${p.type} (${p.synapses})`).join(", ");
      const outs = b.topPartners(i, "out", 4).map((p) => `${p.type} (${p.synapses})`).join(", ");
      return `**${d.type}**${k ? ` is ${k[0]}: ${k[1]}.` : "."} I have ${idx.length} of them. It's a ${friendly(d.superclass)} neuron using ${ntName(d.transmitter)}${NT_TEXT[d.transmitter] ? ` (${NT_TEXT[d.transmitter]})` : ""}. One of them receives ${fmt(d.inputSynapses)} synapses and makes ${fmt(d.outputSynapses)}. Biggest inputs: ${ins || "none"}. It talks most to: ${outs || "none"}.`;
    }
    return null;
  }
}

module.exports = { Fly };
