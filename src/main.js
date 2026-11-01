"use strict";
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const { lookup } = require("./online");
const { Presets } = require("./presets");
const { packInfo } = require("./engine/brain");

let win, worker, info = null, nextId = 1, brainId = null;
const pending = new Map();
const dataDir = app.isPackaged ? path.join(process.resourcesPath, "data") : path.join(__dirname, "..", "data");
const DEFAULT_BRAIN = "malecns";

// Brains shipped with the app (data/brains/<id>/) plus ones the user added as .fbrain files.
const userBrains = () => path.join(app.getPath("userData"), "brains");
function brains() {
  const out = [];
  for (const [dir, added] of [[path.join(dataDir, "brains"), false], [userBrains(), true]]) {
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
      const p = path.join(dir, f);
      try {
        let c;
        if (f.endsWith(".fbrain")) c = packInfo(p);
        else if (fs.existsSync(path.join(p, "meta.json"))) c = JSON.parse(fs.readFileSync(path.join(p, "config.json"), "utf8"));
        else continue;
        const id = (added ? "added-" : "") + f.replace(/\.fbrain$/, "");
        if (!out.some((b) => b.id === id)) out.push({ id, src: p, added, name: c.name || id, organism: c.organism, parts: c.parts, credit: c.credit });
      } catch (e) { console.error("skipping brain", f, e.message); }
    }
  }
  return out;
}

function request(type, extra = {}) {
  const id = nextId++;
  return new Promise((resolve) => { pending.set(id, resolve); worker.postMessage({ type, id, ...extra }); });
}

function startBrain(id) {
  const all = brains(), b = all.find((x) => x.id === id) || all.find((x) => x.id === DEFAULT_BRAIN) || all[0];
  if (worker) { worker.terminate(); for (const r of pending.values()) r({ error: "The brain was switched." }); pending.clear(); }
  info = null; brainId = b.id;
  worker = new Worker(path.join(__dirname, "engine", "worker.js"), { workerData: { src: b.src, id: b.id } });
  return new Promise((resolve) => {
    worker.on("message", (m) => {
      if (m.type === "ready") { info = m; win?.webContents.send("ready", m); resolve(m); }
      else if (m.type === "life") win?.webContents.send("life", m);
      else if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    worker.on("error", (e) => { console.error("brain error:", e); win?.webContents.send("brain-error", String(e)); });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 720, minHeight: 520, backgroundColor: "#0f1115", title: "FruitGPT",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  const vis = (v) => worker?.postMessage({ type: "visible", value: v });
  win.on("minimize", () => vis(false)); win.on("hide", () => vis(false));
  win.on("restore", () => vis(true)); win.on("show", () => vis(true));
  win.webContents.on("did-finish-load", () => info && win.webContents.send("ready", info));
}

ipcMain.handle("info", () => info);
ipcMain.handle("brains", () => brains().map(({ src, ...b }) => b));
ipcMain.handle("switch", async (_e, id) => (id === brainId && info ? info : startBrain(String(id))));
ipcMain.handle("points", () => request("points"));
ipcMain.handle("add-brain", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Add a brain", filters: [{ name: "FruitGPT brain", extensions: ["fbrain"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  try {
    const c = packInfo(r.filePaths[0]);
    const name = path.basename(r.filePaths[0]).replace(/[^\w.-]+/g, "_");
    fs.mkdirSync(userBrains(), { recursive: true });
    fs.copyFileSync(r.filePaths[0], path.join(userBrains(), name));
    return { id: "added-" + name.replace(/\.fbrain$/, ""), name: c.name };
  } catch (e) { return { error: `That file isn't a brain FruitGPT can use: ${e.message}` }; }
});
ipcMain.handle("remove-brain", (_e, id) => {
  const b = brains().find((x) => x.id === id && x.added); if (!b) return false;
  if (id === brainId) return false;
  fs.rmSync(b.src); return true;
});
ipcMain.handle("edit", (_e, edits) => request("edits", { edits }));
ipcMain.on("poke", (_e, sense) => worker?.postMessage({ type: "poke", sense }));
ipcMain.handle("ask", async (_e, { text, online }) => {
  text = String(text || "").slice(0, 1000);
  const brainReply = request("chat", { text });
  // the web lookup runs while the brain thinks; it's only used when the brain has no answer of its own
  const question = /\?\s*$|^(what|who|why|how|when|where|which|is|are|can|do|does|tell|explain)\b/i.test(text.trim());
  const web = online && question ? lookup(text) : Promise.resolve(null);
  const [r, w] = await Promise.all([brainReply, web]);
  return { ...r, web: r.answer ? null : w };
});

let presets;
ipcMain.handle("presets", () => presets.list());
ipcMain.handle("preset-save", (_e, p) => { try { return { list: presets.save(p) }; } catch (e) { return { error: e.message }; } });
ipcMain.handle("preset-delete", (_e, name) => presets.remove(String(name)));

app.whenReady().then(() => {
  presets = new Presets(process.env.FRUITGPT_PRESETS_DIR || app.getPath("userData"));
  startBrain(DEFAULT_BRAIN); createWindow();
  if (process.env.FRUITGPT_SELFTEST) selfTest();
});

// Developer self-test: FRUITGPT_SELFTEST="question" FRUITGPT_SHOT=out.png npm start
// runs FRUITGPT_SELFTEST_JS (if set) in the page, asks the question through the real UI, saves a screenshot, and quits.
function selfTest() {
  win.webContents.on("console-message", (e) => console.log("[page]", e.level, e.message, e.sourceId ? `${path.basename(e.sourceId)}:${e.lineNumber}` : ""));
  const waitReady = setInterval(async () => {
    if (!info) return;
    clearInterval(waitReady);
    if (process.env.FRUITGPT_SELFTEST_JS) { await win.webContents.executeJavaScript(process.env.FRUITGPT_SELFTEST_JS); await new Promise((r) => setTimeout(r, Number(process.env.FRUITGPT_SETUP_WAIT || 3000))); }
    if (process.env.FRUITGPT_SELFTEST !== "-") {
      const q = JSON.stringify(process.env.FRUITGPT_SELFTEST);
      await win.webContents.executeJavaScript(`document.querySelector("#input").value=${q};document.querySelector("#form").requestSubmit();`);
    }
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.FRUITGPT_SHOT || "selftest.png", img.toPNG());
      app.quit();
    }, Number(process.env.FRUITGPT_WAIT || 9000));
  }, 300);
}
app.on("window-all-closed", () => app.quit());
