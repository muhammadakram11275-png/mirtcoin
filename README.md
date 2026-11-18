# MirtCoin ($MIRT)

A Bitcoin-style proof-of-work cryptocurrency: a full node, wallet and miner in one app. Peer-to-peer, open source (MIT), no company in the middle.

> **Status: experimental, early network.** Hash power is tiny, so the chain can be reorganised by anyone with more of it. Do not put in money you cannot afford to lose. Nothing here is investment advice, and there is no promise of price, listing or profit.

## Download (Windows)
Get `MirtCoin-Setup-x.y.z.exe` (installer) or `MirtCoin-Portable-x.y.z.exe` from the [latest release](../../releases/latest).
Verify the download against `SHA256SUMS.txt` from the same release:
```
certutil -hashfile MirtCoin-Setup-4.3.0.exe SHA256
```
The exe is not code-signed, so Windows SmartScreen may warn: *More info > Run anyway*. If you do not trust a binary, build it yourself (below).

## What you get
- Full node that validates every block and transaction itself and keeps its own copy of the chain (`%APPDATA%\MirtCoin\data`).
- Wallet: 24-word recovery phrase, send/receive, QR, history with confirmations. Keys never leave your machine.
- Miner (in the app, or the CLI miner for phones/servers).
- Peer-to-peer sync: nodes find each other through seed nodes, then gossip blocks and transactions. The heaviest valid chain wins.

## Run it
| How | Command |
|---|---|
| Desktop app | install the exe |
| From source | `npm install && npm start` |
| Headless node (needs Node.js 18+) | `node server.js` then open http://127.0.0.1:8332 |
| CLI miner | `node miner.js --addr YOUR_ADDRESS --node http://127.0.0.1:8332 --cpu 50` |
| New wallet from the terminal | `node miner.js --new` |
| Android (Termux) | see [docs/TERMUX.md](docs/TERMUX.md) |
| Docker | `docker build -t mirtcoin . && docker run -d -p 8332:8332 -v mirt:/data mirtcoin` |

## Be part of the network
A node behind a home router can fetch and push blocks but cannot be reached by others. The network needs **publicly reachable nodes** so newcomers can find peers.
- Run a public node (VPS, or a Cloudflare tunnel) and set `PUBLIC_URL=https://your-node` so it announces itself.
- **Desktop app, one click:** *Network > Make my node public* opens a free Cloudflare tunnel and announces your node to the network. *Network > Start with Windows* keeps your node running in the tray. The *Network & peers* page (Ctrl+N) shows peers and sync state and lets you add a peer by hand. Free quick tunnels are meant for testing and have no uptime guarantee, so a VPS is more reliable.
- Add your node to [`seeds.json`](seeds.json) with a pull request. Every client re-reads that list every 10 minutes.
- Environment variables: `MIRT_SEEDS` (comma-separated seed URLs), `PORT`, `HOST`, `MIRT_DATA`, `PUBLIC_URL`.

## Can one powerful machine take over? (honest answer)
In any open proof-of-work network, **yes, a machine with more hash power finds more blocks**, and the protocol cannot tell one big machine from many small ones. Bitcoin has the same property. What this software does about it:
- **Difficulty follows hash power.** A big miner earns in proportion to its work, not unlimited coins; difficulty retargets every 10 blocks.
- **The chain survives a big miner leaving.** If blocks slow down, the required difficulty drops automatically with time (1 bit per doubling of the wait beyond 8 minutes, never below 22 bits), so a few laptops can keep the chain alive instead of it stalling for days.
- **History is protected.** Nodes refuse to switch to a chain that rewrites more than 360 blocks, and obey *checkpoints* that maintainers publish in `seeds.json` / `checkpoints.json`. A node that ended up alone for longer than that uses *File > Resync chain from network*.
- **Mining is gentle by default.** The in-app miner starts in *Cool* mode (about 25% CPU), the CLI miner at 40%. You choose Balanced or Turbo yourself.
- **What it cannot do:** stop someone running many machines, or GPUs/ASICs. SHA-256 mining favours them. The early network is small, so a deep reorganisation within the 360-block window is possible while total hash power is low. A memory-hard algorithm (which narrows the GPU/ASIC advantage) would be a future hard fork and would need community agreement.

## Protocol summary
Full details in [docs/PROTOCOL.md](docs/PROTOCOL.md).
| | |
|---|---|
| Consensus | Proof of work, double SHA-256 |
| Signatures | ECDSA secp256k1, UTXO model |
| Target block time | 120 seconds (retarget every 10 blocks) |
| Max supply | 27,000,000 MIRT |
| Block reward | 7.5 MIRT, halving every 1,650,000 blocks |
| Genesis allocation | 2,250,000 MIRT (8.33%) in two genesis outputs, disclosed here and in the code |

**Disclosure:** MirtCoin is *not* a fair launch. 2,250,000 MIRT are allocated at genesis (`GENESIS_OUTS` in `engine.js`: 1,500,000 and 750,000). Everything else is mined.

## Build from source
```
npm install
npm run dist      # Windows installer and portable exe in dist/
```
Releases are built by GitHub Actions from the tagged commit (see `.github/workflows/build.yml`), so the binary can be traced to the source.

## Contributing, security, license
[CONTRIBUTING.md](CONTRIBUTING.md) | [SECURITY.md](SECURITY.md) | [MIT](LICENSE)

---
### বাংলা
MirtCoin একটি Bitcoin-ধাঁচের ওপেন-সোর্স ক্রিপ্টো: নোড, ওয়ালেট ও মাইনার একসাথে। উপরের Releases থেকে `.exe` নামিয়ে ইনস্টল করুন। আপনার চেইনের কপি আপনার কম্পিউটারেই থাকে। নেটওয়ার্ক শক্ত করতে নিজের নোড চালান ও `seeds.json`-এ যোগ করুন। এটি পরীক্ষামূলক, কোনো লাভ বা দামের নিশ্চয়তা নেই।
