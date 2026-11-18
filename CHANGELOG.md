# Changelog
## 4.3.0
- Difficulty relief: the chain keeps moving if a large miner leaves (see docs/PROTOCOL.md). Consensus change; old blocks stay valid.
- Checkpoints and a 360-block reorg limit; *File > Resync chain from network*.
- Desktop app keeps mining in the tray with your chosen power mode; miners refresh their template when relief applies.
## 4.2.0
- Desktop: "Make my node public" (free tunnel, opt-in), "Start with Windows", Network & peers page (peer list, sync state, add peer).
- Desktop app (Electron): node, wallet and miner in one window, tray icon, data in %APPDATA%.
- P2P: seed list, peer discovery, chain sync with heaviest-chain reorg, block and transaction gossip.
- CLI miner (`miner.js`) and Termux scripts.
- Wallet: Send tab no longer jumps back to Overview.
- GitHub Actions release build with SHA-256 checksums.
