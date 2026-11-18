/* MirtCoin node v2.2. No npm packages needed, only Node.js 18 or newer.
   Run:  node server.js        Open:  http://localhost:8332
   Keeps the chain in data/chain.json (with rolling backups), serves the website from site/,
   and answers /api/*, /health and a live /api/events stream. */
"use strict";
if (+process.versions.node.split(".")[0] < 18) { console.error("Node.js 18+ required. Install from https://nodejs.org"); process.exit(1); }
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib");
const M = require(process.env.MIRT_ENGINE || "./engine.js");
const VERSION = "4.3.0", STARTED = Date.now();
const PORT = +process.env.PORT || 8332;
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1"); // cloud hosts set PORT -> listen publicly
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const DATA = process.env.MIRT_DATA || path.join(__dirname, "data", "chain.json");
const SITE_DIR = path.join(__dirname, "site");
const MAX_BODY = 2 * 1024 * 1024, BACKUP_EVERY = 25, BACKUP_KEEP = 5;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp" };

fs.mkdirSync(path.dirname(DATA), { recursive: true });
const store = {
  getItem() { try { return fs.readFileSync(DATA, "utf8"); } catch (e) { return null; } },
  setItem(_k, v) { const t = DATA + ".tmp"; fs.writeFileSync(t, v); fs.renameSync(t, DATA); },
};
const chain = new M.Chain(M.GENESIS_OUTS, store);
const log = (...a) => console.log(new Date().toISOString(), ...a);
log("MirtCoin node v" + VERSION, "| genesis", chain.blocks[0].hash.slice(0, 16) + "... | height", chain.tip.height, "| mempool", chain.mempool.length);

/* rolling backups of the chain file */
function backup() {
  try {
    const dir = path.join(path.dirname(DATA), "backup"); fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(DATA, path.join(dir, "chain-" + String(chain.tip.height).padStart(8, "0") + ".json"));
    fs.readdirSync(dir).filter(f => /^chain-\d+\.json$/.test(f)).sort().slice(0, -BACKUP_KEEP).forEach(f => fs.unlinkSync(path.join(dir, f)));
  } catch (e) { log("backup failed:", e.message); }
}

/* rate limits: 240 req/min per IP, 40 writes/min per IP */
const hits = new Map(), writes = new Map();
setInterval(() => { hits.clear(); writes.clear(); }, 60000).unref();
const over = (m, ip, max) => { const n = (m.get(ip) || 0) + 1; m.set(ip, n); return n > max; };

/* live events (Server-Sent Events) */
const clients = new Set();
const emit = (ev, data) => { const s = "event: " + ev + "\ndata: " + JSON.stringify(data) + "\n\n"; for (const c of clients) c.write(s); };
setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 25000).unref();

/* ---------- P2P: peer list, chain sync (pull), gossip (push) ---------- */
const G = chain.blocks[0].hash;
const ALLOW_LOCAL = process.env.ALLOW_LOCAL_PEERS === "1";
const SYNC_MS = +process.env.SYNC_MS || 20000;
const origin = u => { try { return new URL(u).origin; } catch (e) { return null; } };
let SELF = origin(PUBLIC_URL);
const PEERS_FILE = path.join(path.dirname(DATA), "peers.json");
chain.checkpoints = {};
let cpConflict = null;
function checkCp() { cpConflict = null; for (const [h, x] of Object.entries(chain.checkpoints)) { const b = chain.blocks[+h]; if (b && b.hash !== x) { cpConflict = +h; log("WARNING: your chain conflicts with the checkpoint at height " + h + ". Use File > Resync chain from network."); break; } } }
function addCheckpoints(o) { if (!o || typeof o !== "object") return; for (const [h, x] of Object.entries(o)) if (/^\d{1,9}$/.test(h) && /^[0-9a-f]{64}$/.test(String(x))) chain.checkpoints[h] = String(x); checkCp(); }
try { addCheckpoints(JSON.parse(fs.readFileSync(path.join(__dirname, "checkpoints.json"), "utf8")).checkpoints); } catch (e) {}
const peers = new Map(), seedSet = new Set();
let seedCfg = { seeds: [], seedsUrl: "" };
try { Object.assign(seedCfg, JSON.parse(fs.readFileSync(path.join(__dirname, "seeds.json"), "utf8"))); } catch (e) {}
addCheckpoints(seedCfg.checkpoints);
const privateHost = h => /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i.test(h) || h.endsWith(".local");
function normUrl(u) { try { const x = new URL(String(u)); if (!/^https?:$/.test(x.protocol)) return null; if (!ALLOW_LOCAL && privateHost(x.hostname)) return null; return x.origin; } catch (e) { return null; } }
function addPeer(u, isSeed) { const n = normUrl(u); if (!n || n === SELF) return false; if (isSeed) seedSet.add(n); if (!peers.has(n) && peers.size < 80) peers.set(n, { fails: 0, lastOk: 0, height: 0 }); return peers.has(n); }
function loadPeers() {
  try { (JSON.parse(fs.readFileSync(PEERS_FILE, "utf8")).peers || []).forEach(u => addPeer(u)); } catch (e) {}
  (seedCfg.seeds || []).concat((process.env.MIRT_SEEDS || "").split(",").map(x => x.trim())).forEach(u => u && addPeer(u, true));
}
const savePeers = () => { try { fs.writeFileSync(PEERS_FILE, JSON.stringify({ peers: [...peers.keys()] })); } catch (e) {} };
const livePeers = () => [...peers].filter(([, p]) => p.lastOk && p.fails < 3).map(([u]) => u);
async function jget(url, ms) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms || 6000), redirect: "error", headers: { "User-Agent": "mirtcoin-node/" + VERSION } });
  if (!r.ok) throw new Error("http " + r.status);
  const t = await r.text(); if (t.length > 30e6) throw new Error("too big"); return JSON.parse(t);
}
const jpost = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000), redirect: "error" }).catch(() => {});
function gossip(p, body) { const l = livePeers().sort(() => Math.random() - 0.5).slice(0, 8); l.forEach(u => jpost(u + p, body)); }

async function pullFrom(base) {
  let got = 0, fork = false;
  for (;;) {
    const j = await jget(base + "/api/blocks?from=" + chain.blocks.length + "&limit=300", 20000), bl = j.blocks || [];
    if (!bl.length) break;
    const st = chain.store; chain.store = null; let ok = true;       // no awaits in this block: nothing can interleave
    try { for (const b of bl) { const r = chain.accept(b); if (r !== true) { ok = false; if (got === 0 && /wrong (parent|height)/.test(r)) fork = true; break; } got++; } }
    finally { chain.store = st; }
    if (!ok || bl.length < 300) break;
  }
  if (got) { chain.save(); log("synced +" + got + " blocks from " + base + " -> #" + chain.tip.height); emit("block", { height: chain.tip.height, hash: chain.tip.hash }); if (chain.tip.height % BACKUP_EVERY === 0) backup(); }
  if (fork && !got) {                                                // peer is on a different branch: take it only if it has more work
    const all = [];
    for (let from = 0; ; from += 300) { const j = await jget(base + "/api/blocks?from=" + from + "&limit=300", 20000), b = j.blocks || []; all.push(...b); if (b.length < 300 || all.length > 2e6) break; }
    const r = chain.tryReplace(all);
    if (r === true) { log("reorg: switched to heavier chain from " + base + " -> #" + chain.tip.height); emit("block", { height: chain.tip.height, hash: chain.tip.hash }); }
  }
}
let syncing = false;
async function syncOnce() {
  if (syncing) return; syncing = true;
  try {
    for (const [url, p] of [...peers]) {
      try {
        const st = await jget(url + "/api/status");
        if (!st || st.genesis !== G) throw new Error("not MirtCoin");
        p.fails = 0; p.lastOk = Date.now(); p.height = st.height;
        const better = st.work ? BigInt(st.work) > chain.work() : st.height > chain.tip.height;
        if (better) await pullFrom(url);
        if (st.pool !== pool()) { const mp = await jget(url + "/api/mempool"); for (const t of (mp.txs || []).slice(0, 200)) if (!chain.mempool.some(m => m.id === t.id) && chain.submit(t) === true) emit("tx", { id: t.id, pool: chain.mempool.length }); }
        const pj = await jget(url + "/api/peers"); (pj.peers || []).slice(0, 30).forEach(u => addPeer(u));
      } catch (e) { p.fails++; if (p.fails >= 30 && !seedSet.has(url)) peers.delete(url); }
    }
  } finally { syncing = false; savePeers(); }
}
async function refreshSeeds() { if (seedCfg.seedsUrl) { try { const j = await jget(seedCfg.seedsUrl); (j.seeds || []).forEach(u => addPeer(u, true)); addCheckpoints(j.checkpoints); } catch (e) {} } }
const announce = () => { if (SELF) new Set([...seedSet, ...livePeers()]).forEach(u => jpost(u + "/api/peers", { url: SELF })); };
/* hook for the desktop app: it opens a tunnel at runtime and tells the node its public address */
global.__mirt = { setPublicUrl(u) { SELF = u ? origin(u) : null; if (SELF) announce(); return SELF; }, publicUrl: () => SELF };
loadPeers();
refreshSeeds().then(() => { announce(); syncOnce(); });
setInterval(syncOnce, SYNC_MS); setInterval(() => refreshSeeds().then(announce), 600000);
log("p2p: " + peers.size + " peer(s) configured" + (SELF ? " | public url " + SELF : " | outbound only"));

/* recent block time -> rough network hashrate */
function stats() {
  const b = chain.blocks, n = Math.min(10, b.length - 1), t = chain.tip;
  let avg = 0, hps = 0;
  if (n > 0) { avg = (t.time - b[b.length - 1 - n].time) / n; if (avg > 0) hps = Math.pow(2, t.bits) / avg; }
  return { version: VERSION, height: t.height, tip: t.hash, bits: t.bits, nextBits: chain.nextBits(), reward: chain.mempool ? M.reward(t.height + 1) : 0,
    avgBlockSec: Math.round(avg), hashrate: Math.round(hps), mempool: chain.mempool.length, supply: chain.supply(), maxSupply: M.MAXSUP,
    uptimeSec: Math.floor((Date.now() - STARTED) / 1000), subscribers: clients.size, peers: livePeers().length };
}
const pool = () => crypto.createHash("sha256").update(chain.mempool.map(t => t.id).join(",")).digest("hex").slice(0, 16);

const SEC = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "SAMEORIGIN", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" };
function reply(req, res, code, type, body, extra) {
  const h = Object.assign({ "Content-Type": type }, SEC, extra || {});
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (buf.length > 1024 && /gzip/.test(req.headers["accept-encoding"] || "") && /json|html|text|javascript|css|svg/.test(type)) {
    h["Content-Encoding"] = "gzip"; h.Vary = "Accept-Encoding"; res.writeHead(code, h); return res.end(zlib.gzipSync(buf, { level: 6 }));
  }
  res.writeHead(code, h); res.end(buf);
}
const send = (req, res, code, obj) => reply(req, res, code, "application/json", JSON.stringify(obj),
  { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" });
const readJson = req => new Promise((ok, no) => {
  let n = 0; const parts = [];
  req.on("data", c => { n += c.length; if (n > MAX_BODY) { no(new Error("body too large")); req.destroy(); } else parts.push(c); });
  req.on("end", () => { try { ok(JSON.parse(Buffer.concat(parts).toString("utf8"))); } catch (e) { no(new Error("bad json")); } });
  req.on("error", no);
});

function serveStatic(req, res, p) {
  const rel = p === "/" ? "/index.html" : p;
  const f = path.normalize(path.join(SITE_DIR, rel));
  if (!f.startsWith(SITE_DIR + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return false;
  const buf = fs.readFileSync(f), etag = '"' + crypto.createHash("md5").update(buf).digest("hex") + '"';
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, SEC); res.end(); return true; }
  reply(req, res, 200, MIME[path.extname(f).toLowerCase()] || "application/octet-stream", buf, { ETag: etag, "Cache-Control": f.endsWith(".html") ? "no-cache" : "public, max-age=3600" });
  return true;
}

const server = http.createServer(async (req, res) => {
  const ip = (req.headers["cf-connecting-ip"] || (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "").toString();
  if (over(hits, ip, 240)) return send(req, res, 429, { error: "too many requests" });
  const u = new URL(req.url, "http://x"), p = u.pathname;
  try {
    if (req.method === "OPTIONS") return send(req, res, 204, {});
    if (req.method === "GET" && p === "/health") return send(req, res, 200, { ok: true, version: VERSION, height: chain.tip.height });
    if (req.method === "GET" && p === "/api/status") return send(req, res, 200, { genesis: chain.blocks[0].hash, height: chain.tip.height, tip: chain.tip.hash, pool: pool(), work: chain.work().toString(), version: VERSION, checkpointConflict: cpConflict });
    if (req.method === "GET" && p === "/api/stats") return send(req, res, 200, stats());
    if (req.method === "GET" && p === "/api/events") {
      res.writeHead(200, Object.assign({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" }, SEC));
      res.write("event: hello\ndata: " + JSON.stringify({ height: chain.tip.height }) + "\n\n");
      clients.add(res); req.on("close", () => clients.delete(res)); return;
    }
    if (req.method === "GET" && p === "/api/blocks") {
      const from = Math.max(0, parseInt(u.searchParams.get("from")) || 0);
      const limit = Math.min(300, Math.max(1, parseInt(u.searchParams.get("limit")) || 100));
      return send(req, res, 200, { blocks: chain.blocks.slice(from, from + limit) });
    }
    if (req.method === "GET" && p === "/api/richlist") return send(req, res, 200, { top: chain.rich(20).map(([addr, amt]) => ({ addr, amt })) });
    const am = p.match(/^\/api\/address\/([1-9A-HJ-NP-Za-km-z]{26,36})$/);
    if (req.method === "GET" && am) { if (!M.validAddr(am[1])) return send(req, res, 400, { error: "bad address" }); return send(req, res, 200, { addr: am[1], balance: chain.balance(am[1]), utxos: chain.utxosOf(am[1]).length, history: chain.history(am[1], 20) }); }
    if (req.method === "GET" && p === "/api/mempool") return send(req, res, 200, { txs: chain.mempool });
    if (req.method === "GET" && p === "/api/node-url") return send(req, res, 200, { url: PUBLIC_URL });
    if (req.method === "GET" && p === "/api/peers") return send(req, res, 200, { peers: livePeers().concat(SELF ? [SELF] : []), known: peers.size, self: SELF, detail: [...peers].map(([url, p]) => ({ url, height: p.height || 0, ok: !!p.lastOk && p.fails < 3, seed: seedSet.has(url) })) });
    if (req.method === "POST" && p === "/api/peers") {
      if (over(writes, ip, 40)) return send(req, res, 429, { error: "slow down" });
      const body = await readJson(req), n = normUrl(body && body.url);
      if (!n) return send(req, res, 400, { error: "bad url" });
      try { const st = await jget(n + "/api/status", 4000); if (st.genesis !== G) return send(req, res, 400, { error: "other chain" }); } catch (e) { return send(req, res, 400, { error: "peer unreachable" }); }
      addPeer(n); return send(req, res, 200, { ok: true });
    }
    if (req.method === "POST" && (p === "/api/block" || p === "/api/tx")) {
      if (over(writes, ip, 40)) return send(req, res, 429, { error: "too many submissions, slow down" });
      const body = await readJson(req);
      if (p === "/api/block") {
        const r = chain.accept(body);
        if (r !== true) { if (/wrong (height|parent)/.test(String(r))) setTimeout(syncOnce, 300); return send(req, res, 400, { error: String(r) }); }
        log("block accepted #" + chain.tip.height, chain.tip.hash.slice(0, 16));
        emit("block", { height: chain.tip.height, hash: chain.tip.hash });
        if (chain.tip.height % BACKUP_EVERY === 0) backup();
        gossip("/api/block", body);
        return send(req, res, 200, { ok: true, height: chain.tip.height });
      }
      const r = chain.submit(body);
      if (r !== true) return send(req, res, 400, { error: String(r) });
      emit("tx", { id: body.id, pool: chain.mempool.length }); gossip("/api/tx", body);
      return send(req, res, 200, { ok: true });
    }
    if (req.method === "GET" && serveStatic(req, res, decodeURIComponent(p))) return;
    send(req, res, 404, { error: "not found" });
  } catch (e) { send(req, res, 400, { error: e.message || "bad request" }); }
});
server.listen(PORT, HOST, () => log("listening on http://" + HOST + ":" + PORT));
process.on("uncaughtException", e => console.error("error:", e.message));
const bye = () => { try { chain.save(); backup(); } catch (e) {} log("node stopped, chain saved"); process.exit(0); };
process.on("SIGINT", bye); process.on("SIGTERM", bye);
