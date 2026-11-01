"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("fruit", {
  ask: (text, online) => ipcRenderer.invoke("ask", { text, online }),
  poke: (sense) => ipcRenderer.send("poke", sense),
  onLife: (fn) => ipcRenderer.on("life", (_e, s) => fn(s)),
  onReady: (fn) => ipcRenderer.on("ready", (_e, s) => fn(s)),
  info: () => ipcRenderer.invoke("info"),
  brains: () => ipcRenderer.invoke("brains"),
  switchBrain: (id) => ipcRenderer.invoke("switch", id),
  points: () => ipcRenderer.invoke("points"),
  addBrain: () => ipcRenderer.invoke("add-brain"),
  removeBrain: (id) => ipcRenderer.invoke("remove-brain", id),
  edit: (edits) => ipcRenderer.invoke("edit", edits),
  presets: () => ipcRenderer.invoke("presets"),
  savePreset: (p) => ipcRenderer.invoke("preset-save", p),
  deletePreset: (name) => ipcRenderer.invoke("preset-delete", name),
});
