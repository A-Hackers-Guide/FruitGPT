// Optional online answers from Wikipedia (text CC BY-SA 4.0). Only the question's keywords are sent,
// and only when the user has "Online answers" switched on.
"use strict";
const UA = "FruitGPT/0.1 (https://github.com/A-Hackers-Guide/FruitGPT)";
const STOP = /\b(what|whats|who|whom|why|how|when|where|which|is|are|was|were|do|does|did|can|could|would|should|tell|me|about|the|a|an|of|please|explain|your|you|i|my)\b/g;

async function get(url, ms = 5000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA }, signal: ctl.signal }); return r.ok ? r.json() : null; }
  finally { clearTimeout(t); }
}

async function lookup(question) {
  const q = question.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(STOP, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return null;
  try {
    const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(q)}`);
    const title = s?.query?.search?.[0]?.title;
    if (!title) return null;
    const p = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`);
    if (!p?.extract) return null;
    // only keep a page that actually mentions what was asked about
    const hay = `${p.title} ${p.extract}`.toLowerCase();
    const words = q.split(" ").filter((w) => w.length > 3);
    if (words.length && !words.some((w) => hay.includes(w))) return null;
    return { title: p.title, extract: p.extract, url: p.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  } catch { return null; }
}

module.exports = { lookup };
