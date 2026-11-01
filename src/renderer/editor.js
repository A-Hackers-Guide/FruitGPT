// Brain Editor: take out sections, change neurons and wires, turn the brain's dials, switch brains, save presets.
// Edits are sent to the brain thread, which applies them on top of the untouched wiring. Nothing is written to
// disk unless the user saves a preset, so closing FruitGPT restores the original brain.
import * as THREE from "./vendor/three.module.min.js";
import { OrbitControls } from "./vendor/OrbitControls.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (x) => Math.round(x).toLocaleString("en-US");
const blank = () => ({ params: {}, sections: [], neurons: [], links: [], restoreExcluded: false });
const ACTION = { silence: "Silence", tonic: "Force on", gain: "Output ×", flip: "Flip go ↔ stop" };
// superclass -> [colour, legend label]
const GROUPS = [
  [(x) => x.includes("sensory"), "#4ade80", "sensory"], [(x) => x.includes("motor"), "#f59e0b", "motor"],
  [(x) => x.startsWith("descending"), "#f472b6", "descending (brain → body)"], [(x) => x.startsWith("ascending"), "#c084fc", "ascending (body → brain)"],
  [(x) => x.startsWith("ol_") || x.startsWith("visual"), "#5aa9e6", "optic lobes"], [(x) => x.startsWith("cb_"), "#ff6b4a", "central brain"],
  [(x) => x.startsWith("vnc_"), "#ffd166", "nerve cord"], [(x) => x === "worm_interneuron", "#ff6b4a", "interneuron"], [() => true, "#9097a6", "other"],
];
const group = (x) => GROUPS.find(([t]) => t(x));

let labels = {}, edits = blank(), info = null, catalog = null, view = null, applyTimer = null, lastResult = null, onChange = () => {};

export function initEditor({ onEdited, ask }) {
  onChange = onEdited;
  $("#open-editor").onclick = open;
  $("#ed-close").onclick = () => { $("#editor").hidden = true; };
  $("#ed-reset").onclick = () => { if (isEdited() && !confirm("Undo every edit and go back to the original brain?")) return; edits = blank(); renderAll(); apply(); };
  $("#ed-tabs").onclick = (e) => { const t = e.target.dataset.tab; if (!t) return;
    for (const b of $("#ed-tabs").children) b.classList.toggle("on", b.dataset.tab === t);
    for (const p of document.querySelectorAll(".pane")) p.hidden = p.dataset.pane !== t;
    if (t === "presets") renderPresets(); };
  $("#n-action").onchange = () => { $("#n-gain").hidden = $("#n-action").value !== "gain"; };
  $("#n-add").onclick = () => {
    const target = $("#n-target").value.trim(); if (!target) return;
    edits.neurons.push({ target, action: $("#n-action").value, gain: Number($("#n-gain").value) || 1 });
    $("#n-target").value = ""; renderRules(); apply();
  };
  $("#n-target").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#n-add").click(); });
  $("#w-gain").oninput = () => { const v = Number($("#w-gain").value); $("#w-val").textContent = v === 0 ? "0 (cut)" : `×${v}`; };
  $("#w-add").onclick = () => {
    const from = $("#w-from").value.trim(), to = $("#w-to").value.trim(); if (!from || !to) return;
    edits.links.push({ from, to, gain: Number($("#w-gain").value) }); $("#w-from").value = $("#w-to").value = ""; renderRules(); apply();
  };
  $("#ed-excl").onchange = () => { edits.restoreExcluded = $("#ed-excl").checked; apply(); };
  $("#p-save").onclick = async () => {
    const name = $("#p-name").value.trim(); if (!name) return msg("Give the preset a name first.");
    const r = await window.fruit.savePreset({ name, brain: info.id, edits });
    if (r.error) return msg(r.error);
    $("#p-name").value = ""; msg(`Saved “${name}”. It stays on this computer until you delete it.`); renderPresets(r.list);
  };
  $("#ed-test").onclick = async (e) => {
    const s = e.target.dataset.s; if (!s) return;
    $("#ed-result").innerHTML = `<p class="thinking">running the edited brain…</p>`;
    const r = await ask(TEST_PHRASE[s] || `I make you feel ${s}`);
    lastResult = r;
    $("#ed-result").innerHTML = r.error ? `<p>${esc(r.error)}</p>` : `<p>${mini(r.answer || "")}</p><p class="tiny">${fmt(r.responders || 0)} neurons answered.</p>`;
    $(".ed-foot").scrollTop = 0;
  };
}
const TEST_PHRASE = { loom: "Here comes a shadow!", smell: "Smell this!", taste: "Taste this sugar", hearing: "Can you hear this sound?",
  wind: "A gust of wind", touch: "I touch you", heat: "It's getting hot", humidity: "Damp air", tail: "I touch your tail",
  nose: "Something nasty at your nose", vibration: "A vibration" };
const mini = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");
const msg = (t) => { $("#p-msg").textContent = t; };
const isEdited = () => !!(Object.keys(edits.params).length || edits.sections.length || edits.neurons.length || edits.links.length || edits.restoreExcluded);

// Called whenever a (new) brain is ready: edits never carry over between brains.
export function brainReady(i, senseLabels = labels) {
  labels = senseLabels;
  const changed = !info || info.id !== i.id;
  info = i; catalog = i.catalog;
  if (changed) { edits = blank(); lastResult = null; $("#ed-result").innerHTML = ""; if (view) view.load(); }
  $("#ed-brain").textContent = `${i.name} · ${fmt(i.neurons)} neurons`;
  $("#targets").innerHTML = [...catalog.sections.map((s) => [`section:${s.id}`, s.count]), ...catalog.groups, ...catalog.types]
    .map(([v, c]) => `<option value="${esc(v)}">${fmt(c)}</option>`).join("");
  $("#ed-test").innerHTML = i.senses.map((s) => `<button type="button" data-s="${s}">${senseLabels[s] || s}</button>`).join("");
  $("#n-hint").textContent = i.organism === "worm" ? "Worm examples: AVA (backward command), AVB (forward), ASH (nose pain), AVAL (one named neuron)." :
    "Fly examples: DNp01 (Giant Fiber), MDN (moonwalker), LPLC2 (looming detector), APL.";
  renderAll(); renderBrains(); updateStatus(null);
}

function open() {
  $("#editor").hidden = false;
  if (!view) view = makeView();
  view.resize();
}

function apply() {
  clearTimeout(applyTimer);
  updateStatus("applying…");
  applyTimer = setTimeout(async () => {
    const r = await window.fruit.edit(edits);
    if (r.error) return updateStatus(null, r.error);
    if (view) view.paint(r);
    updateStatus(r.report);
    onChange(isEdited());
  }, 250);
}

function updateStatus(report, error) {
  const ed = isEdited();
  $("#ed-status").textContent = ed ? "edited · not saved" : "original brain";
  $("#ed-status").classList.toggle("edited", ed);
  if (error) { $("#ed-report").innerHTML = `<span class="warn">${esc(error)}</span>`; return; }
  if (typeof report === "string") { $("#ed-report").textContent = report; return; }
  if (!report) { $("#ed-report").textContent = ed ? "" : "No edits: this is the brain exactly as it was mapped."; return; }
  const parts = [];
  if (report.removed) parts.push(`${fmt(report.removed)} neurons taken out`);
  if (report.silenced) parts.push(`${fmt(report.silenced)} silenced`);
  if (report.tonic) parts.push(`${fmt(report.tonic)} forced on`);
  if (report.gain) parts.push(`${fmt(report.gain)} with changed output`);
  if (report.flipped) parts.push(`${fmt(report.flipped)} flipped`);
  const wires = report.links.reduce((a, l) => a + l.edges, 0); if (report.links.length) parts.push(`${fmt(wires)} connections changed`);
  if (Object.keys(edits.params).length) parts.push(`${Object.keys(edits.params).length} dial(s) turned`);
  let html = parts.length ? esc(parts.join(" · ")) : "No edits: this is the brain exactly as it was mapped.";
  if (report.unknown.length) html += `<br><span class="warn">Not found in this brain: ${esc([...new Set(report.unknown)].join(", "))}</span>`;
  $("#ed-report").innerHTML = html;
  renderRules(report);
}

function renderAll() { renderSections(); renderRules(); renderDials(); }

function renderBrains() {
  window.fruit.brains().then((list) => {
    $("#ed-brains").innerHTML = list.map((b) => `<div class="brain-card ${b.id === info.id ? "on" : ""}"><b>${esc(b.name || b.id)}</b>
      <p>${esc(b.parts || "")}</p><p>${esc(b.credit || "")}</p>
      ${b.id === info.id ? "<p><b>Running now</b></p>" : `<button data-b="${esc(b.id)}">Use this brain</button>`}
      ${b.added && b.id !== info.id ? `<button data-rm="${esc(b.id)}">Remove</button>` : ""}</div>`).join("");
    const pick = document.querySelector("#brain-pick"), cur = pick.value;
    pick.innerHTML = list.map((b) => `<option value="${esc(b.id)}">${esc(b.name || b.id)}</option>`).join(""); pick.value = cur || info.id;
  });
  $("#ed-add-brain").onclick = async () => {
    const r = await window.fruit.addBrain(); if (r.canceled) return;
    if (r.error) { $("#ed-report").innerHTML = `<span class="warn">${esc(r.error)}</span>`; return; }
    $("#ed-report").textContent = `Added “${r.name}”.`; renderBrains();
  };
  $("#ed-brains").onclick = async (e) => {
    if (e.target.dataset.rm) { if (confirm("Remove this added brain from FruitGPT?")) { await window.fruit.removeBrain(e.target.dataset.rm); renderBrains(); } return; }
    const id = e.target.dataset.b; if (!id) return;
    if (isEdited() && !confirm("Switching brains clears your unsaved edits. Switch anyway?")) return;
    await switchTo(id);
  };
}

export async function switchTo(id) {
  $("#ed-report").textContent = "loading that brain…";
  $("#ed-loading").hidden = false; $("#ed-loading").textContent = "loading brain…";
  const i = await window.fruit.switchBrain(id);
  if (i && i.id) brainReady(i);
  return i;
}

function renderSections() {
  $("#ed-sections").innerHTML = catalog.sections.map((s) => `<label><input type="checkbox" data-sec="${esc(s.id)}" ${edits.sections.includes(s.id) ? "checked" : ""}>
    ${esc(s.name)}<small>${fmt(s.count)}</small></label>`).join("");
  $("#ed-sections").onchange = (e) => {
    const id = e.target.dataset.sec; if (!id) return;
    edits.sections = e.target.checked ? [...edits.sections, id] : edits.sections.filter((x) => x !== id);
    apply();
  };
}

function renderRules(report) {
  const bad = new Set(report ? report.unknown : []);
  $("#n-list").innerHTML = edits.neurons.map((r, k) => `<li class="${bad.has(r.target) ? "bad" : ""}"><span class="what"><b>${esc(r.target)}</b>
    ${esc(ACTION[r.action])}${r.action === "gain" ? ` ${r.gain}` : ""}${bad.has(r.target) ? "<small>not found in this brain</small>" : ""}</span>
    <button data-k="${k}" title="remove">✕</button></li>`).join("") || `<li><span class="what"><small>No neuron changes yet.</small></span></li>`;
  $("#n-list").onclick = (e) => { const k = e.target.dataset.k; if (k === undefined) return; edits.neurons.splice(+k, 1); renderRules(); apply(); };
  const found = new Map((report ? report.links : []).map((l) => [`${l.from}→${l.to}`, l]));
  $("#w-list").innerHTML = edits.links.map((l, k) => { const f = found.get(`${l.from}→${l.to}`);
    return `<li class="${bad.has(l.from) || bad.has(l.to) ? "bad" : ""}"><span class="what"><b>${esc(l.from)} → ${esc(l.to)}</b> ${l.gain === 0 ? "cut" : `×${l.gain}`}
    ${f ? `<small>${fmt(f.edges)} connections, ${fmt(f.synapses)} synapses${f.edges ? "" : " (these don't connect directly)"}</small>` : ""}</span>
    <button data-k="${k}" title="remove">✕</button></li>`; }).join("") || `<li><span class="what"><small>No wire changes yet.</small></span></li>`;
  $("#w-list").onclick = (e) => { const k = e.target.dataset.k; if (k === undefined) return; edits.links.splice(+k, 1); renderRules(); apply(); };
}

function renderDials() {
  $("#ed-dials").innerHTML = Object.entries(catalog.dials).map(([k, d]) => {
    const v = edits.params[k] ?? d.base, step = (d.max - d.min) / 200;
    return `<div class="dial"><div class="top"><span>${esc(d.label)}</span><span><b id="dv-${k}">${+v.toFixed(3)}</b>
      ${edits.params[k] !== undefined ? `<button data-reset="${k}">reset (${d.base})</button>` : `<small class="tiny">normal</small>`}</span></div>
      <input type="range" data-dial="${k}" min="${d.min}" max="${d.max}" step="${+step.toPrecision(2)}" value="${v}"></div>`;
  }).join("");
  $("#ed-dials").oninput = (e) => { const k = e.target.dataset.dial; if (!k) return;
    edits.params[k] = Number(e.target.value); $(`#dv-${k}`).textContent = +edits.params[k].toFixed(3); apply(); };
  $("#ed-dials").onchange = (e) => { if (e.target.dataset.dial) renderDials(); };
  $("#ed-dials").onclick = (e) => { const k = e.target.dataset.reset; if (!k) return; delete edits.params[k]; renderDials(); apply(); };
  $("#ed-excl-row").hidden = !catalog.excluded;
  $("#ed-excl").checked = edits.restoreExcluded;
  $("#ed-excl-text").textContent = `Put back the ${fmt(catalog.excluded)} connections the model leaves out (${catalog.excludeWhy || ""}). Expect runaway activity.`;
}

async function renderPresets(list) {
  list = list || (await window.fruit.presets());
  const names = Object.fromEntries((await window.fruit.brains()).map((b) => [b.id, b.name || b.id]));
  $("#p-list").innerHTML = list.map((p, k) => `<li><span class="what"><b>${esc(p.name)}</b>${p.example ? `<span class="tag">example</span>` : ""}
    <small>${esc(names[p.brain] || p.brain)}${p.note ? ` · ${esc(p.note)}` : ""}${p.saved ? ` · saved ${esc(new Date(p.saved).toLocaleString())}` : ""}</small></span>
    <button data-load="${k}">Load</button>${p.example ? "" : `<button data-del="${k}" title="delete">✕</button>`}</li>`).join("");
  $("#p-list").onclick = async (e) => {
    const L = e.target.dataset.load, D = e.target.dataset.del;
    if (L !== undefined) {
      const p = list[+L];
      if (isEdited() && !confirm(`Load “${p.name}”? Your current unsaved edits will be replaced.`)) return;
      if (p.brain !== info.id) await switchTo(p.brain);
      edits = { ...blank(), ...JSON.parse(JSON.stringify(p.edits || {})) };
      renderAll(); apply(); msg(`Loaded “${p.name}”.`);
    }
    if (D !== undefined && confirm(`Delete the preset “${list[+D].name}”?`)) renderPresets(await window.fruit.deletePreset(list[+D].name));
  };
}

// ---- 3D view: one point per neuron at its real position
function makeView() {
  const canvas = $("#view");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 0, 2.2);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  let points = null, base = null;
  async function load() {
    $("#ed-loading").hidden = false; $("#ed-loading").textContent = "loading 3D brain…";
    if (points) { scene.remove(points); points.geometry.dispose(); points = null; }
    const r = await window.fruit.points(); if (r.error) return;
    const n = r.sc.length, pos = new Float32Array(r.pos), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i * 3 + a]); hi[a] = Math.max(hi[a], pos[i * 3 + a]); }
    const c = lo.map((x, a) => (x + hi[a]) / 2), s = 1.6 / Math.max(...hi.map((x, a) => x - lo[a]));
    for (let i = 0; i < n; i++) { pos[i * 3] = (pos[i * 3] - c[0]) * s; pos[i * 3 + 1] = -(pos[i * 3 + 1] - c[1]) * s; pos[i * 3 + 2] = -(pos[i * 3 + 2] - c[2]) * s; }
    const cols = r.superclasses.map((x) => new THREE.Color(group(x)[1]));
    base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = cols[r.sc[i]]; base[i * 3] = k.r; base[i * 3 + 1] = k.g; base[i * 3 + 2] = k.b; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(base.slice(), 3));
    const size = n > 5000 ? 0.006 : 0.03;
    points = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: n > 5000 ? 0.55 : 0.95, depthWrite: false, blending: n > 5000 ? THREE.AdditiveBlending : THREE.NormalBlending }));
    scene.add(points);
    const present = new Set(r.sc), legend = new Map();
    r.superclasses.forEach((x, k) => { if (present.has(k) && x !== "unknown") { const [, col, label] = group(x); legend.set(label, col); } });
    $("#ed-legend").replaceChildren(...[...legend].map(([l, col]) => { // no inline styles: the page's CSP forbids them
      const el = document.createElement("span"); el.textContent = l; el.style.setProperty("--c", col); return el; }));
    const rest = new THREE.Vector3(0, 0, 2.2); camera.position.copy(rest); controls.target.set(0, 0, 0); controls.update();
    $("#ed-loading").hidden = true;
    if (isEdited()) apply();
  }
  function paint(r) {
    if (!points || !r.silent) return;
    const col = points.geometry.attributes.color, a = col.array, n = r.silent.length, ghost = n > 5000 ? 0.012 : 0.12; // points add up, so dense regions need a tiny value
    for (let i = 0; i < n; i++) {
      let R = base[i * 3], G = base[i * 3 + 1], B = base[i * 3 + 2];
      if (r.silent[i]) { R = G = B = ghost; } else if (r.tonic[i]) { R = 1; G = 0.95; B = 0.3; } else if (r.gain[i]) { R = 1; G = 0.45; B = 0.1; }
      a[i * 3] = R; a[i * 3 + 1] = G; a[i * 3 + 2] = B;
    }
    col.needsUpdate = true;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  (function loop() { requestAnimationFrame(loop); if ($("#editor").hidden) return; controls.update(); renderer.render(scene, camera); })();
  load();
  return { load, paint, resize };
}
