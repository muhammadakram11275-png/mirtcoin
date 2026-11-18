#!/usr/bin/env node
/* MirtCoin CLI miner (Termux / Linux / Mac / Windows). Needs only Node.js 18+ and engine.js.
   Usage:  node miner.js --addr MYADDRESS [--node http://127.0.0.1:8332] [--cpu 40]
           node miner.js --new          (makes a new 24-word recovery-phrase wallet)  */
"use strict";
const M = require("./engine.js");
const A = process.argv.slice(2);
const opt = (n, d) => { const i = A.indexOf("--" + n); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
if (A.includes("--new")) {
  const w = M.newPhrase(), k = M.walletFromPhrase(w.phrase);
  console.log("NEW WALLET\nAddress: " + k.addr + "\n\nRecovery phrase (24 words). WRITE IT ON PAPER. Anyone with it owns the coins, and nobody can recover it for you:\n" + w.phrase);
  process.exit(0);
}
const NODE = String(opt("node", process.env.MIRT_NODE || "http://127.0.0.1:8332")).replace(/\/$/, "");
const CPU = Math.min(100, Math.max(5, +opt("cpu", 40)));
const ADDR = opt("addr", process.env.MIRT_ADDR);
if (!ADDR || !M.validAddr(ADDR)) { console.log("Usage: node miner.js --addr YOUR_MIRT_ADDRESS [--node URL] [--cpu 40]\n       node miner.js --new   (create a wallet)"); process.exit(1); }

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jget = async p => { const r = await fetch(NODE + p, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("http " + r.status); return r.json(); };
let chain = new M.Chain(M.GENESIS_OUTS, null);

async function pull() {
  for (;;) {
    const bl = (await jget("/api/blocks?from=" + chain.blocks.length + "&limit=300")).blocks || [];
    if (!bl.length) return true;
    for (const b of bl) if (chain.accept(b) !== true) return false;
    if (bl.length < 300) return true;
  }
}
async function sync() {
  const st = await jget("/api/status");
  if (st.genesis !== chain.blocks[0].hash) throw new Error("this node runs a different chain (genesis mismatch)");
  if (!(await pull())) { chain = new M.Chain(M.GENESIS_OUTS, null); if (!(await pull())) throw new Error("could not sync chain from node"); }
  try { for (const t of (await jget("/api/mempool")).txs || []) chain.submit(t); } catch (e) {}
  return st;
}

(async () => {
  log("MirtCoin miner | node " + NODE + " | reward address " + ADDR + " | cpu " + CPU + "%");
  let hashes = 0, found = 0, t0 = Date.now(), lastPrint = Date.now(); let lastPeerWarn = 0;
  for (;;) {
    try {
      await sync();
      const tpl = chain.template(ADDR), tip = chain.tip.hash; let nonce = 0, lastCheck = Date.now();
      log("mining block #" + tpl.height + " (difficulty " + tpl.bits + " bits, " + (tpl.txs.length - 1) + " tx)");
      for (;;) {
        const s = Date.now(), r = M.mineSlice(tpl, 400, nonce); hashes += r.hashes; nonce = r.nonce;
        if (r.found) {
          const res = await fetch(NODE + "/api/block", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tpl) });
          if (res.ok) { found++; log("*** BLOCK FOUND #" + tpl.height + " " + tpl.hash.slice(0, 16) + "... reward " + M.fmt(M.reward(tpl.height)) + " MIRT (blocks found: " + found + ")"); }
          else log("block rejected: " + ((await res.json().catch(() => ({}))).error || res.status));
          break;
        }
        await sleep((Date.now() - s) * (100 - CPU) / CPU);           // duty cycle keeps the phone cool
        if (Date.now() - lastCheck > 4000) { lastCheck = Date.now(); if ((await jget("/api/status")).tip !== tip) { log("network found a block, restarting on the new tip"); break; } if (chain.expectedBits(Math.max(Math.floor(Date.now() / 1000), chain.tip.time + 1)) < tpl.bits) { log("difficulty relief available, refreshing"); break; } }
        if (Date.now() - lastPeerWarn > 60000) { lastPeerWarn = Date.now(); const ps = await jget("/api/stats").catch(() => null); if (ps && ps.peers === 0) log("WARNING: your node has 0 peers. Blocks mined now can be lost when you join the real network. Check seeds.json or MIRT_SEEDS."); }
        if (Date.now() - lastPrint > 15000) { lastPrint = Date.now(); log("hashrate " + Math.round(hashes / ((Date.now() - t0) / 1000)) + " H/s | blocks found " + found); }
      }
    } catch (e) { log("error: " + e.message + " (retrying in 5s)"); await sleep(5000); }
  }
})();
