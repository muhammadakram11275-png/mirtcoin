"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("mirtDesktop", {
  getState: () => ipcRenderer.invoke("net:state"),
  setPublic: on => ipcRenderer.invoke("net:setPublic", !!on),
  setAutostart: on => ipcRenderer.invoke("net:setAutostart", !!on),
  openData: () => ipcRenderer.invoke("app:openData")
});
