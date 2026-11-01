// The animal talks back, and its neural activity gets translated into English.
// It can't read words, so every message is *felt*: a sense word drives that sense, anything else
// reaches it through its fallback sense (a fly hears it, a worm feels a vibration). The brain runs, and
// this file turns what its neurons did into plain English. Facts come only from the connectome.
"use strict";

const FLY_KNOWN = {
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
  glutamate: "in a fly's brain mostly a 'stop' signal (it opens chloride channels), though it excites muscles",
  histamine: "what a fly's photoreceptors release; it inhibits the next cells",
  dopamine: "a modulator for reward, punishment and learning",
  serotonin: "a slow modulator of feeding, sleep and mood-like states",
  octopamine: "an insect's version of adrenaline: it gets the body ready for action",
};
const FRIENDLY = {
  ol_intrinsic: "optic-lobe", cb_intrinsic: "central-brain", vnc_intrinsic: "nerve-cord", visual_projection: "visual projection",
  descending_neuron: "descending (brain-to-body command)", ascending_neuron: "ascending (body-to-brain)", vnc_motor: "motor",
  cb_sensory: "head sensory", vnc_sensory: "body sensory", ol_sensory: "eye sensory", visual_centrifugal: "visual feedback",
  worm_sensory: "sensory", worm_interneuron: "interneuron", worm_motor: "motor",
};
const friendly = (s) => FRIENDLY[s] || s.replaceAll("_", " ");
// "a central-brain neuron", "an interneuron"
const kind = (sc) => { const x = friendly(sc); return `${/^[aeiou]/.test(x) ? "an" : "a"} ${x}${/neuron$/.test(x) ? "" : " neuron"}`; };
const ntName = (s) => (s === "gaba" ? "GABA" : s);
const fmt = (x) => Math.round(x).toLocaleString("en-US");
// default words for each sense; a brain's config can give its own ("words")
const SENSE_WORDS = {
  loom: "shadow|loom|swat|hand|threat|predator|scare|attack|danger",
  smell: "smell|scent|odou?r|sniff|perfume|banana|fruit",
  taste: "taste|sugar|food|lick|eat|hungry",
  wind: "wind|blow|breeze|gust",
  touch: "touch|poke|tickle|pet|stroke|tap",
  heat: "heat|warm|hot|temperature",
  humidity: "humid|damp|moist|wet|rain",
  hearing: "sound|hear|buzz|sing|song|noise|music|loud",
};

class Fly {
  constructor(brain, life = null) {
    this.b = brain; this.life = life;
    const c = brain.config;
    this.isFly = c.organism === "fruit fly";
    this.known = { ...(this.isFly ? FLY_KNOWN : {}), ...(c.known || {}) };
    this.words = Object.entries(brain.stimuli).map(([k, s]) => [k, new RegExp(s.words || SENSE_WORDS[k] || k)]);
    this.typesByLength = [...brain.typeIndex.keys()].sort((a, b) => b.length - a.length);
  }

  // What the animal physically senses from a message.
  sense(text) {
    const low = text.toLowerCase();
    const hit = this.words.find(([, re]) => re.test(low));
    return hit ? { sense: hit[0], literal: true } : { sense: this.b.config.fallbackSense, literal: false };
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

  // Which known behaviour the command neurons in this result call for.
  decide(sm) {
    const hz = new Map(); for (const d of sm.descending) hz.set(d.type, Math.max(hz.get(d.type) || 0, d.hz));
    const hits = this.b.behaviours.map((g) => ({ g, hz: Math.max(0, ...g.types.map((t) => hz.get(t) || 0)) })).filter((x) => x.hz > 0);
    if (!hits.length) return null;
    return this.b.config.decide === "strongest" ? hits.sort((a, b) => b.hz - a.hz)[0].g : hits[0].g;
  }

  // The animal's first-person reaction to a sensation, decided by which command neurons fired.
  react(sense, sm) {
    const felt = `I felt ${this.b.stimuli[sense].say}.`;
    if (!sm.stimulated) return `${felt} Well, I would have, but those sensory neurons have been taken out of my brain, so I felt nothing at all.`;
    const g = this.decide(sm);
    if (g) {
      const t = g.types[0], who = g.types.length === 1 && this.known[t] ? `${this.known[t][0].replace(/^(a|an|my) /, "")} (${t})` : `${g.types.join(" / ")} command neurons`;
      return `${g.alarm ? "**Whoa!** " : ""}${felt} My ${who} fired, so I ${g.does}! Nobody scripted that; my own wiring decided it.`;
    }
    const dns = [...new Set(sm.descending.map((d) => d.type))];
    if (dns.length) return `${felt} ${fmt(sm.responders)} of my neurons are buzzing and my brain sent orders down ${dns.slice(0, 3).join(", ")}, command neurons whose jobs science hasn't worked out yet. So I'm not making a movement anyone could predict.`;
    return `${felt} ${fmt(sm.responders)} of my neurons noticed, but none of my command neurons fired, so I'm staying still.`;
  }

  regions(sm) { return sm.bySuperclass.slice(0, 5).map(([k, v]) => [friendly(k), v]); }

  translate(sense, literal, sm) {
    const felt = literal ? `I felt ${this.b.stimuli[sense].say}.` : this.b.config.fallbackSay;
    const regions = sm.bySuperclass.slice(0, 3).map(([k, v]) => `${fmt(v)} ${friendly(k)}`).join(", ");
    let out = `${felt} ${sm.stimulated} of my sensory neurons fired, and within 300 ms ${fmt(sm.responders)} more neurons answered` +
      (regions ? ` (${regions}).` : ".");
    const dns = [...new Set(sm.descending.map((d) => d.type))].slice(0, 4);
    if (dns.length) {
      const known = dns.filter((d) => this.known[d]).map((d) => `**${d}**: ${this.known[d][1]}`);
      out += ` My brain sent commands to my body through ${dns.join(", ")}.`;
      out += known.length ? ` ${known.join(". ")}.` : " Science doesn't know yet exactly what those command neurons do.";
    } else out += " No command neurons fired, so my body stays still.";
    const peak = Math.max(...sm.timeline), at = sm.timeline.indexOf(peak) * 10;
    if (peak > 0) out += ` Activity peaked ${at} ms after it started.`;
    return out;
  }

  // Facts the animal knows about itself. Returns markdown, or null if the question isn't about its brain.
  answer(text) {
    const t = text.trim(), low = t.toLowerCase(), b = this.b, c = b.config;
    const me = `a ${c.organism}, *${c.latin}*`;
    if (/^(hi|hello|hey|yo|howdy|greetings)\b/.test(low) || /who are you|^what are you\??$/.test(low))
      return `Hello! I'm ${me}. All **${fmt(b.n)} neurons** and **${fmt(b.synapses)} synapses** of my ${c.parts} were mapped from a real animal (${c.credit}), and my brain is running right now on your computer. Ask me about my brain, or make me feel something: try ${Object.keys(b.stimuli).slice(0, 3).map((s) => `*${s}*`).join(", ")}.`;
    if (/(brain )?editor|edited|what did (you|i) change|changes? to your brain|are you (changed|normal)/.test(low)) {
      const e = b.editSummary();
      return e ? `My brain has been edited in the Brain Editor: ${e.join("; ")}. Close FruitGPT without saving a preset and I'm back to normal next time.`
        : "My brain is exactly as it was mapped: nothing has been changed in the Brain Editor.";
    }
    if (/what are you doing|why did you|how are you/.test(low) && this.life) {
      const s = this.life.snapshot();
      if (s.behaviour === "rest") return "I'm resting: my command neurons are quiet. Make me feel something and see what my brain decides!";
      return `I'm about to **${s.does}${s.side ? ` to the ${s.side}` : ""}**${s.because ? ` because I felt ${b.stimuli[s.because].say}` : ""}! My ${s.types.join("/")} command neurons are firing (${s.cite}).`;
    }
    if (/how (do|does) (you|this|it) work|simulat|are you real|accurate|model/.test(low)) {
      const ex = b.kcRemoved ? ` The ${fmt(b.kcRemoved)} ${c.simExclude.typePrefix}-to-${c.simExclude.typePrefix} connections are left out of the simulation (${c.simExclude.why}).` : "";
      return `Honest answer: I'm the real wiring diagram of ${me}, run as a simplified model. Each of my ${fmt(b.n)} neurons is a *leaky integrate-and-fire* unit; each synapse pushes the next neuron up (excitatory) or down (inhibitory, e.g. GABA). The method follows Shiu et al. 2024 (*Nature*), here with ${b.p.W_SYN} mV per synapse and spike-frequency adaptation.${ex}${c.simNote ? ` ${c.simNote}` : ""} Not modelled: slow chemicals like dopamine, neuron shapes, my body, and learning. And I don't understand language: FruitGPT translates what my neurons *do* into English.`;
    }
    if (/human|people|compare/.test(low))
      return `A human brain has about **86 billion** neurons; I have **${fmt(b.n)}** mapped ones, so you have roughly ${fmt(86e9 / b.n)} times more. Yet my small nervous system is enough to sense, move and survive, and every connection in it has been mapped.`;
    if (/how many|number of/.test(low)) {
      if (/synap/.test(low)) return `I have **${fmt(b.synapses)}** synapses between my mapped neurons.`;
      if (/connect/.test(low)) return `My neurons make **${fmt(b.indices.length)}** neuron-to-neuron connections from ${fmt(b.synapses)} synapses.`;
      if (/type|kind/.test(low)) return `My neurons come in **${fmt(b.typeIndex.size)}** named cell types.`;
      return `I have **${fmt(b.n)}** mapped neurons, linked by ${fmt(b.indices.length)} connections and ${fmt(b.synapses)} synapses.`;
    }
    if (/most connected|biggest neuron|hub/.test(low)) {
      let best = 0; for (let i = 0; i < b.n; i++) if (b.inSyn[i] + b.outSyn[i] > b.inSyn[best] + b.outSyn[best]) best = i;
      const d = b.describe(best);
      return `My most connected neuron is **${d.type}** (${d.instance}), ${kind(d.superclass)}: ${fmt(d.inputSynapses)} synapses in and ${fmt(d.outputSynapses)} out.`;
    }
    for (const [nt, desc] of Object.entries(NT_TEXT)) if (low.includes(nt)) {
      const n = b.where("nt", [nt]).length;
      return `**${ntName(nt)[0].toUpperCase() + ntName(nt).slice(1)}** is ${desc}. ${fmt(n)} of my neurons (${((100 * n) / b.n).toFixed(1)}%) are ${n ? "labelled as using it" : "labelled as using it in my data"}.`;
    }
    if (this.isFly && /mushroom|kenyon|memory|learn|remember/.test(low)) {
      const kc = b.type.filter((x) => x.startsWith("KC")).length;
      return `My mushroom bodies are where I learn and remember, especially smells. They hold **${fmt(kc)} Kenyon cells**; each odour switches on only a few percent of them, and my APL neuron enforces that sparse code by inhibiting them all. Dopamine neurons label memories as good or bad. (My simulation doesn't change synapses, so I don't form new memories while we chat.)`;
    }
    if (/descending|command neuron|control your body/.test(low)) {
      const list = b.behaviours.map((g) => `${g.types.join("/")} (${g.does})`).join(", ");
      const dn = b.where("superclass", ["descending_neuron"]).length;
      return `${dn ? `Orders travel from my brain to my body through **${fmt(dn)} descending neurons**. ` : ""}Scientists know the jobs of only some command neurons: ${list}. In FruitGPT, those decide what I do.`;
    }
    // a specific neuron type (or a named neuron, like the worm's AVAL)
    let name = Object.entries(ALIASES).find(([a]) => low.includes(a))?.[1];
    const words = new Set(low.match(/[a-z0-9_+\-,()]+/g) || []);
    if (!name) name = this.typesByLength.find((x) => x.length > 2 && words.has(x));
    let idx = name ? b.ofType(name) : [];
    if (!idx.length) { const w = [...words].find((x) => b.instanceIndex.has(x)); if (w) idx = b.instanceIndex.get(w); }
    if (idx.length) {
      const i = idx[0], d = b.describe(i), k = this.known[d.type];
      const ins = b.topPartners(i, "in", 4).map((p) => `${p.type} (${p.synapses})`).join(", ");
      const outs = b.topPartners(i, "out", 4).map((p) => `${p.type} (${p.synapses})`).join(", ");
      const edited = b.silent[i] ? " (In the Brain Editor it's been silenced or taken out.)" : "";
      return `**${d.type}**${k ? ` is ${k[0]}: ${k[1]}.` : "."} I have ${idx.length} of them. It's ${kind(d.superclass)}${d.transmitter !== "unknown" ? ` using ${ntName(d.transmitter)}${NT_TEXT[d.transmitter] ? ` (${NT_TEXT[d.transmitter]})` : ""}` : ""}. One of them receives ${fmt(d.inputSynapses)} synapses and makes ${fmt(d.outputSynapses)}. Biggest inputs: ${ins || "none"}. It talks most to: ${outs || "none"}.${edited}`;
    }
    return null;
  }
}

module.exports = { Fly, friendly };
