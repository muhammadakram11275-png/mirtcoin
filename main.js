/* MirtCoin Desktop: runs the full node (server.js) inside the app and shows the wallet/miner UI
   in a native window, like Bitcoin Core. Chain data lives in %APPDATA%\MirtCoin\data. */
"use strict";
const { app, BrowserWindow, Menu, Tray, shell, dialog, nativeImage, ipcMain, net } = require("electron");
const path = require("path"), fs = require("fs"), http = require("http"), { spawn } = require("child_process");

let PORT = 18332, URL_ = "";
let win = null, tray = null, quitting = false;
const HIDDEN = process.argv.includes("--hidden");
const CF_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
const MIRT_GENESIS = (() => { const M = require("./engine.js"); return new M.Chain(M.GENESIS_OUTS, null).blocks[0].hash; })();

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => showWin());
  app.whenReady().then(main);
}

const dataDir = () => path.join(app.getPath("userData"), "data");
const chainFile = () => path.join(dataDir(), "chain.json");
const icon = () => nativeImage.createFromPath(path.join(__dirname, "build", "icon.png"));

/* ---------- settings ---------- */
let settings = { public: false, consent: false };
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function loadSettings() { try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), "utf8"))); } catch (e) {} }
function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (e) {} }
const loginOn = () => { try { return !!app.getLoginItemSettings({ args: ["--hidden"] }).openAtLogin; } catch (e) { return false; } };
function setAutostart(on) { try { app.setLoginItemSettings({ openAtLogin: !!on, args: ["--hidden"] }); } catch (e) {} buildMenu(); }

/* ---------- local node ---------- */
function getJSON(port, p) {
  return new Promise(ok => {
    const r = http.get({ host: "127.0.0.1", port, path: p, timeout: 800 }, res => {
      let d = ""; res.on("data", c => d += c); res.on("end", () => { try { ok(JSON.parse(d)); } catch (e) { ok("other"); } });
    });
    r.on("error", () => ok(null)); r.on("timeout", () => { r.destroy(); ok(null); });
  });
}
async function waitUp(ms) { const t = Date.now(); while (Date.now() - t < ms) { const j = await getJSON(PORT, "/api/status"); if (j && j.genesis === MIRT_GENESIS) return true; await new Promise(r => setTimeout(r, 250)); } return false; }

async function main() {
  fs.mkdirSync(dataDir(), { recursive: true });
  loadSettings();
  let start = true;
  for (let p = 18332; p < 18352; p++) {      // find a free port, or an already running MirtCoin node (never an old/other coin's node)
    const j = await getJSON(p, "/api/status");
    if (j === null) { PORT = p; break; }
    if (j && j.genesis === MIRT_GENESIS) { PORT = p; start = false; break; }
  }
  URL_ = "http://127.0.0.1:" + PORT;
  if (start) {
    process.env.MIRT_DATA = chainFile();
    process.env.HOST = "127.0.0.1";          // local only
    process.env.PORT = String(PORT);
    try { require("./server.js"); } catch (e) { dialog.showErrorBox("MirtCoin node error", String(e && e.message || e)); }
  }
  if (!(await waitUp(15000))) {
    dialog.showErrorBox("MirtCoin", "MirtCoin node start hoy nai.");
    quitting = true; return app.quit();
  }
  registerIpc(); buildMenu(); buildTray(); createWin();
  if (settings.public && global.__mirt) startTunnel();
}

/* ---------- public node (free Cloudflare quick tunnel) ---------- */
const tun = { proc: null, url: null, status: "off", message: "" };
const setPub = u => { try { return global.__mirt && global.__mirt.setPublicUrl(u); } catch (e) {} };

async function ensureCloudflared() {
  const f = path.join(app.getPath("userData"), "cloudflared.exe");
  if (fs.existsSync(f) && fs.statSync(f).size > 5e6) return f;
  tun.status = "downloading"; tun.message = "Downloading the tunnel program (one time)...";
  const r = await net.fetch(CF_URL);
  if (!r.ok) throw new Error("Download failed (HTTP " + r.status + ")");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5e6 || buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error("Downloaded file is not a valid program");
  fs.writeFileSync(f + ".part", buf); fs.renameSync(f + ".part", f);
  return f;
}
async function startTunnel() {
  if (tun.proc || !global.__mirt) return;
  try {
    const f = await ensureCloudflared();
    if (!settings.public || quitting) return;
    tun.status = "starting"; tun.message = "Opening the tunnel...";
    const p = spawn(f, ["tunnel", "--url", URL_, "--no-autoupdate"], { windowsHide: true });
    tun.proc = p;
    const onData = d => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !tun.url) { tun.url = m[0]; tun.status = "on"; tun.message = "Your node is public. Others can connect to it."; setPub(tun.url); buildMenu(); }
    };
    p.stdout.on("data", onData); p.stderr.on("data", onData);
    p.on("error", e => { tun.proc = null; tun.status = "error"; tun.message = "Could not start the tunnel: " + e.message; });
    p.on("exit", code => {
      tun.proc = null; tun.url = null; setPub(null);
      if (settings.public && !quitting) {
        tun.status = "starting"; tun.message = "Tunnel dropped (code " + code + "), retrying...";
        setTimeout(() => { if (settings.public && !tun.proc && !quitting) startTunnel(); }, 15000);
      } else tun.status = "off";
    });
  } catch (e) { tun.status = "error"; tun.message = String(e.message || e); }
}
function stopTunnel() {
  const p = tun.proc; tun.proc = null; tun.url = null; tun.status = "off"; tun.message = ""; setPub(null);
  if (p) { try { p.kill(); } catch (e) {} }
}
async function setPublic(on) {
  if (on) {
    if (!global.__mirt) return { ...state(), error: "This app is using a node that was already running. Close it and restart MirtCoin." };
    if (!settings.consent) {
      const r = await dialog.showMessageBox(win, {
        type: "question", buttons: ["Make my node public", "Cancel"], defaultId: 1, cancelId: 1, title: "Make my node public?",
        message: "Open a free public link to your node?",
        detail: "MirtCoin will download Cloudflare's free tunnel program (cloudflared) from github.com and open a public https link to your node, so other MirtCoin nodes can connect to you.\n\nYour wallet keys stay on your PC. Your node's chain data and website become visible through that link. Free Cloudflare tunnels are meant for testing and have no uptime guarantee."
      });
      if (r.response !== 0) return state();
      settings.consent = true;
    }
    settings.public = true; saveSettings(); startTunnel();
  } else { settings.public = false; saveSettings(); stopTunnel(); }
  buildMenu(); return state();
}
const state = () => ({ desktop: true, public: !!settings.public, status: tun.status, message: tun.message, url: tun.url, canPublic: !!global.__mirt, autostart: loginOn(), dataDir: dataDir(), version: app.getVersion() });

function registerIpc() {
  const guard = e => { if (!e.senderFrame || !String(e.senderFrame.url).startsWith(URL_)) throw new Error("denied"); };
  ipcMain.handle("net:state", e => { guard(e); return state(); });
  ipcMain.handle("net:setPublic", (e, on) => { guard(e); return setPublic(!!on); });
  ipcMain.handle("net:setAutostart", (e, on) => { guard(e); setAutostart(!!on); return state(); });
  ipcMain.handle("app:openData", e => { guard(e); shell.openPath(dataDir()); return true; });
}

/* ---------- window, tray, menu ---------- */
function createWin() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600, show: false, backgroundColor: "#030303",
    title: "MirtCoin Core", icon: icon(), autoHideMenuBar: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.js") }
  });
  win.once("ready-to-show", () => { if (!HIDDEN) win.show(); });
  win.on("page-title-updated", e => e.preventDefault());
  win.loadURL(URL_);
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(URL_)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(URL_)) { e.preventDefault(); shell.openExternal(url); } });
  win.on("close", e => { if (!quitting) { e.preventDefault(); win.hide(); } });   // close = keep node and mining running in tray
}
function showWin() { if (!win) return createWin(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function openPage(p) { showWin(); win.loadURL(URL_ + p); }

function buildTray() {
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.setToolTip("MirtCoin node is running");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open MirtCoin", click: showWin },
    { label: "Network & peers", click: () => openPage("/network.html") },
    { label: "Open data folder", click: () => shell.openPath(dataDir()) },
    { type: "separator" },
    { label: "Quit (stop node)", click: quit }
  ]));
  tray.on("double-click", showWin);
  const tick = async () => { const j = await getJSON(PORT, "/api/stats"); if (j && j.height !== undefined) tray.setToolTip("MirtCoin | block " + j.height + " | " + j.peers + " peer" + (j.peers === 1 ? "" : "s") + (tun.url ? " | public" : "")); };
  tick(); setInterval(tick, 15000);
}

function backupChain() {
  const d = new Date().toISOString().slice(0, 10);
  dialog.showSaveDialog(win, { title: "Backup chain", defaultPath: path.join(app.getPath("documents"), "mirtcoin-chain-" + d + ".json"), filters: [{ name: "JSON", extensions: ["json"] }] })
    .then(r => { if (!r.canceled) { try { fs.copyFileSync(chainFile(), r.filePath); } catch (e) { dialog.showErrorBox("Backup failed", e.message); } } });
}

function resync() {
  dialog.showMessageBox(win, { type: "warning", buttons: ["Resync from network", "Cancel"], defaultId: 1, cancelId: 1, title: "Resync chain",
    message: "Delete the local chain copy and download it again from the network?",
    detail: "Use this if your node is stuck on a different chain. Your wallet is not affected (keys come from your recovery phrase). A backup of the old chain stays in the data folder. You need at least one reachable peer, otherwise you start again from block 0." })
    .then(r => {
      if (r.response !== 0) return;
      try { const f = chainFile(); if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(dataDir(), "chain.backup-" + Date.now() + ".json")); fs.unlinkSync(f); } }
      catch (e) { dialog.showErrorBox("Resync failed", e.message); return; }
      quitting = true; stopTunnel(); app.relaunch(); app.exit(0);
    });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [
      { label: "Backup chain...", click: backupChain },
      { label: "Open data folder", click: () => shell.openPath(dataDir()) },
      { label: "Resync chain from network...", click: resync },
      { type: "separator" },
      { label: "Quit", accelerator: "Ctrl+Q", click: quit }
    ] },
    { label: "View", submenu: [
      { label: "Wallet / Home", click: () => openPage("/") },
      { label: "Network & peers", accelerator: "Ctrl+N", click: () => openPage("/network.html") },
      { type: "separator" },
      { role: "reload" }, { role: "forceReload" }, { type: "separator" },
      { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "togglefullscreen" }
    ] },
    { label: "Network", submenu: [
      { label: "Make my node public (free tunnel)", type: "checkbox", checked: !!settings.public, click: mi => setPublic(mi.checked).then(r => { if (r && r.error) dialog.showErrorBox("MirtCoin", r.error); }) },
      { label: "Start with Windows (in tray)", type: "checkbox", checked: loginOn(), click: mi => setAutostart(mi.checked) },
      { type: "separator" },
      { label: "Connected peers (JSON)", click: () => shell.openExternal(URL_ + "/api/peers") },
      { label: "Node status (JSON)", click: () => shell.openExternal(URL_ + "/api/stats") }
    ] },
    { label: "Window", submenu: [
      { label: "Debug console", accelerator: "Ctrl+Shift+I", click: () => win && win.webContents.toggleDevTools() },
      { role: "minimize" }
    ] },
    { label: "Help", submenu: [
      { label: "About MirtCoin", click: () => dialog.showMessageBox(win, { type: "info", title: "MirtCoin", message: "MirtCoin ($MIRT) Core " + app.getVersion(), detail: "Full node + wallet + miner.\nData: " + dataDir() }) }
    ] }
  ]));
}

function quit() { quitting = true; app.quit(); }
app.on("before-quit", () => { quitting = true; stopTunnel(); });
app.on("will-quit", () => { try { process.emit("SIGTERM"); } catch (e) {} });   // server.js saves the chain on SIGTERM
app.on("window-all-closed", () => {});
