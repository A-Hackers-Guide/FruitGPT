"use strict";
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { Worker } = require("worker_threads");
const { lookup } = require("./online");

let win, worker, info = null, nextId = 1;
const pending = new Map();
const dataDir = app.isPackaged ? path.join(process.resourcesPath, "data") : path.join(__dirname, "..", "data");

function startBrain() {
  worker = new Worker(path.join(__dirname, "engine", "worker.js"), { workerData: { dataDir } });
  worker.on("message", (m) => {
    if (m.type === "ready") { info = m; win?.webContents.send("ready", m); }
    else if (m.type === "life") win?.webContents.send("life", m);
    else if (m.type === "chat") { pending.get(m.id)?.(m); pending.delete(m.id); }
  });
  worker.on("error", (e) => console.error("brain error:", e));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 800, minWidth: 720, minHeight: 520, backgroundColor: "#0f1115", title: "FruitGPT",
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
ipcMain.on("poke", (_e, sense) => worker.postMessage({ type: "poke", sense }));
ipcMain.handle("ask", async (_e, { text, online }) => {
  text = String(text || "").slice(0, 1000);
  const id = nextId++;
  const brainReply = new Promise((resolve) => { pending.set(id, resolve); worker.postMessage({ type: "chat", id, text }); });
  // the web lookup runs while the brain thinks; it's only used when the fly has no answer of its own
  const question = /\?\s*$|^(what|who|why|how|when|where|which|is|are|can|do|does|tell|explain)\b/i.test(text.trim());
  const web = online && question ? lookup(text) : Promise.resolve(null);
  const [r, w] = await Promise.all([brainReply, web]);
  return { ...r, web: r.answer ? null : w };
});

app.whenReady().then(() => { startBrain(); createWindow(); if (process.env.FRUITGPT_SELFTEST) selfTest(); });

// Developer self-test: FRUITGPT_SELFTEST="question" FRUITGPT_SHOT=out.png npm start
// asks the question through the real UI, saves a screenshot, and quits.
function selfTest() {
  const waitReady = setInterval(async () => {
    if (!info) return;
    clearInterval(waitReady);
    const q = JSON.stringify(process.env.FRUITGPT_SELFTEST);
    await win.webContents.executeJavaScript(`document.querySelector("#input").value=${q};document.querySelector("#form").requestSubmit();`);
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require("fs").writeFileSync(process.env.FRUITGPT_SHOT || "selftest.png", img.toPNG());
      app.quit();
    }, Number(process.env.FRUITGPT_WAIT || 9000));
  }, 300);
}
app.on("window-all-closed", () => app.quit());
