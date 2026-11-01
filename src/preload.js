"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("fruit", {
  ask: (text, online) => ipcRenderer.invoke("ask", { text, online }),
  poke: (sense) => ipcRenderer.send("poke", sense),
  onLife: (fn) => ipcRenderer.on("life", (_e, s) => fn(s)),
  onReady: (fn) => ipcRenderer.on("ready", (_e, s) => fn(s)),
  info: () => ipcRenderer.invoke("info"),
});
