import { initEditor, brainReady, switchTo } from "./editor.js";
const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// tiny, safe markdown: **bold**, *italic*, [text](https://link), paragraphs
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>")
  .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

const SUGGEST = {
  "fruit fly": [
    ["Here comes a shadow!", "watch the escape circuit fire"], ["What are you?", "meet the fly"],
    ["Tell me about your giant fiber", "a real neuron, from the data"], ["What happens when you smell banana?", "send a smell into the brain"],
    ["How does this simulation work?", "the honest version"], ["What is dopamine?", "brain chemistry"]],
  worm: [
    ["Something nasty at your nose!", "watch the reversal neurons fire"], ["What are you?", "meet the worm"],
    ["Tell me about AVA", "a famous command neuron"], ["I touch your tail", "the touch circuit"],
    ["How does this simulation work?", "the honest version"], ["How many neurons do you have?", "the whole nervous system"]],
};
const SENSES = { loom: "🖐️ shadow", smell: "👃 smell", taste: "👅 taste", hearing: "🔊 sound", wind: "💨 wind", touch: "🪶 touch", heat: "🔥 heat",
  humidity: "💧 humidity", tail: "🪶 tail touch", nose: "⚠️ nose", vibration: "〰️ vibration" };
const EMOJI = { "fruit fly": "🪰", worm: "🪱" };
let organism = "fruit fly", neurons = 0, brainId = null;

let chats = load(), current = null, ready = false, busy = false;
function load() { try { return JSON.parse(localStorage.getItem("fruitgpt-chats") || "[]"); } catch { return []; } }
function save() { try { localStorage.setItem("fruitgpt-chats", JSON.stringify(chats.slice(0, 50))); } catch {} }

function renderHistory() {
  $("#history").innerHTML = chats.map((c, i) => `<button data-i="${i}" class="${c === current ? "on" : ""}">${esc(c.title)}</button>`).join("");
}
function openChat(c) {
  current = c; $("#msgs").innerHTML = ""; $("#empty").style.display = c && c.msgs.length ? "none" : "block";
  if (c) for (const m of c.msgs) m.role === "me" ? addMe(m.text) : addBot(m);
  renderHistory();
}
function addMe(text) { const d = document.createElement("div"); d.className = "me"; d.textContent = text; $("#msgs").appendChild(d); scroll(); }
function spark(t) {
  if (!t || !t.length) return "";
  const max = Math.max(1, ...t), w = 600, h = 44, step = w / (t.length - 1 || 1);
  const pts = t.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="spikes per 10 ms"><polyline points="${pts}" fill="none" stroke="#ff6b4a" stroke-width="2"/></svg>`;
}
function addBot(m, typing = false) {
  const d = document.createElement("div"); d.className = "bot";
  const main = m.answer || (m.web ? `${m.web.extract}` : null) ||
    "I don't know that from my own brain. Ask me about my neurons, my senses or how I work, or switch on Online answers for general questions.";
  const src = m.web && !m.answer ? `<div class="source">From Wikipedia: <a href="${esc(m.web.url)}" target="_blank" rel="noreferrer">${esc(m.web.title)}</a> (CC BY-SA 4.0). Not from the fly's brain.</div>` : "";
  const regions = (m.regions || []).map(([k, v]) => `<span class="chip">${esc(k)}: ${v.toLocaleString()}</span>`).join("");
  d.innerHTML = `<div class="avatar">${EMOJI[m.organism] || "🪰"}</div><div class="body"><div class="text"></div>${src}
    ${m.translation ? `<details class="neuro"${typing ? " open" : ""}><summary>🧠 Fly → English: what my neurons did</summary>${md(m.translation)}${spark(m.timeline)}<div class="chips">${regions}</div></details>` : ""}</div>`;
  $("#msgs").appendChild(d);
  const el = d.querySelector(".text");
  if (!typing) { el.innerHTML = md(main); return scroll(); }
  const words = main.split(/(\s+)/); let k = 0;
  const t = setInterval(() => { k += 3; el.innerHTML = md(words.slice(0, k).join("")); scroll(); if (k >= words.length) clearInterval(t); }, 18);
}
function scroll() { $("#chat").scrollTop = $("#chat").scrollHeight; }

async function send(text) {
  text = text.trim(); if (!text || busy || !ready) return;
  if (!current) { current = { title: text.slice(0, 40), msgs: [] }; chats.unshift(current); }
  $("#empty").style.display = "none"; current.msgs.push({ role: "me", text }); addMe(text); renderHistory();
  busy = true; $("#send").disabled = true;
  const wait = document.createElement("div"); wait.className = "bot"; wait.innerHTML = `<div class="avatar">${EMOJI[organism] || "🧠"}</div><div class="body thinking">feeling your message with ${neurons.toLocaleString()} neurons…</div>`;
  $("#msgs").appendChild(wait); scroll();
  const r = await window.fruit.ask(text, $("#online").checked);
  wait.remove();
  const m = r.error ? { role: "bot", answer: `My brain hit an error: ${r.error}` } : { role: "bot", organism, ...r };
  current.msgs.push(m); save(); addBot(m, true);
  busy = false; $("#send").disabled = false;
}

$("#cards").onclick = (e) => { const b = e.target.closest("button"); if (b) send(b.dataset.q); };
$("#senses").onclick = (e) => { const s = e.target.dataset.s; if (s) { window.fruit.poke(s); } };
$("#history").onclick = (e) => { const i = e.target.dataset.i; if (i !== undefined) openChat(chats[+i]); };
$("#new").onclick = () => openChat(null);
$("#form").onsubmit = (e) => { e.preventDefault(); const v = $("#input").value; $("#input").value = ""; autosize(); send(v); };
$("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form").requestSubmit(); } });
const autosize = () => { const t = $("#input"); t.style.height = "auto"; t.style.height = Math.min(180, t.scrollHeight) + "px"; };
$("#input").addEventListener("input", autosize);
try { $("#online").checked = localStorage.getItem("fruitgpt-online") !== "off"; } catch {}
$("#online").onchange = () => { try { localStorage.setItem("fruitgpt-online", $("#online").checked ? "on" : "off"); } catch {} };

const onReady = (i) => {
  if (!i) return;
  ready = true; neurons = i.neurons; organism = i.organism;
  $("#model").textContent = `${i.neurons.toLocaleString()} neurons · ${i.connections.toLocaleString()} connections`;
  $("#empty-title").textContent = `Talk to a real ${i.organism} brain`;
  $("#empty-sub").textContent = `${i.neurons.toLocaleString()} neurons mapped from a real ${i.organism}, running on your computer. Every reply shows what its neurons did, translated into English.`;
  $(".logo").textContent = EMOJI[organism] || "🧠";
  $("#credit").textContent = `Brain: ${i.credit} · ${i.licence}`;
  $("#input").placeholder = `Message the ${i.organism}…`;
  const sug = SUGGEST[organism] || SUGGEST["fruit fly"];
  $("#cards").innerHTML = sug.map(([q, s]) => `<button data-q="${esc(q)}"><b>${esc(q)}</b><span>${esc(s)}</span></button>`).join("");
  $("#senses").innerHTML = i.senses.map((k) => `<button type="button" data-s="${k}" title="make it feel this">${SENSES[k] || k}</button>`).join("");
  if (i.id !== brainId) { brainId = i.id; $("#brain-pick").value = i.id; $("#fly").textContent = "waking up"; $("#edited-badge").hidden = true; }
  brainReady(i, SENSES);
};
window.fruit.onReady(onReady); window.fruit.info().then(onReady);
window.fruit.brains().then((list) => {
  $("#brain-pick").innerHTML = list.map((b) => `<option value="${esc(b.id)}">${esc(b.name || b.id)}</option>`).join("");
  if (brainId) $("#brain-pick").value = brainId;
});
$("#brain-pick").onchange = async () => {
  const id = $("#brain-pick").value;
  if (!$("#edited-badge").hidden && !confirm("Switching brains clears your unsaved Brain Editor edits. Switch anyway?")) { $("#brain-pick").value = brainId; return; }
  ready = false; $("#model").textContent = "waking the brain…";
  await switchTo(id);
};
window.fruit.onLife((s) => {
  if (s.brain !== brainId) return;
  $("#dot").className = `dot ${s.behaviour === "rest" ? "rest" : s.alarm ? "escape" : "move"}`;
  $("#fly").textContent = `${s.word}${s.side ? " " + s.side : ""} · ${s.active.toLocaleString()} neurons firing`;
});
initEditor({ onEdited: (on) => { $("#edited-badge").hidden = !on; }, ask: (text) => window.fruit.ask(text, false) });
renderHistory(); openChat(null);
