# MirtCoin protocol (v4)

Reference implementation: `engine.js` (validation) and `server.js` (node and P2P). If this document and the code disagree, the code is right and this document has a bug.

## Units and supply
- 1 MIRT = 100,000,000 base units. Max supply 27,000,000 MIRT.
- Genesis allocation: 1,500,000 and 750,000 MIRT (`GENESIS_OUTS`).
- Block reward: 7.5 MIRT for the first 1,650,000 blocks, then halves every 1,650,000 blocks. A block that would exceed the supply cap is invalid.

## Blocks
- Proof of work: double SHA-256 of the block header must have at least `bits` leading zero bits.
- Start difficulty 24 bits (min 22, max 48). Every 10 blocks the difficulty is retargeted toward a 120 second block time.
- Coinbase output may not exceed reward plus fees. A block with a timestamp too far in the future is rejected.
- **Difficulty relief:** let `base` be the normal difficulty for the next block. A block is valid if `expected <= bits <= base`, where `expected = max(22, base - floor(log2(elapsed / 240)))` and `elapsed` is the block time minus the previous block time, applied only when `elapsed` is over 480 seconds. So a stalled chain becomes easier over time instead of waiting for a retarget that can never come. Blocks mined at the plain difficulty stay valid.
- **Checkpoints:** a block at a checkpointed height must have the checkpointed hash (`checkpoints.json`, or `checkpoints` in `seeds.json` / the list at `seedsUrl`).
- **Reorg limit (node policy):** a node will not switch to a chain that replaces more than 360 of its own blocks.
- The valid chain with the most accumulated work wins. If a peer has more work on another branch, a node reorganises onto it.

## Transactions and addresses
- UTXO model. Inputs are signed with ECDSA on secp256k1; a transaction pays inputs minus outputs as a fee.
- Addresses start with `M` and carry a checksum. Wallets derive keys from a 24-word recovery phrase.

## Node HTTP API (default port 8332)
| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /api/status` | genesis hash, height, tip, total work, version |
| `GET /api/stats` | height, supply, peers, mempool |
| `GET /api/blocks?from=N&limit=300` | blocks from height N |
| `GET /api/mempool` | pending transactions |
| `POST /api/block`, `POST /api/tx` | submit a block or transaction (validated, then gossiped) |
| `GET /api/peers`, `POST /api/peers` | peer list; announce a public node |

## Peer-to-peer
- Seeds come from `seeds.json`, `MIRT_SEEDS`, and the list at `seedsUrl`. Nodes learn more peers from each other (max 80).
- Every 20 seconds a node asks each peer for its status. A peer on another genesis is ignored. If a peer has more work, the node downloads and validates its blocks, and switches branch only if the other chain has more work.
- New blocks and transactions are pushed to up to 8 random peers. Peers that fail repeatedly are dropped (seeds are kept).
- Peer addresses on private/local ranges are refused unless `ALLOW_LOCAL_PEERS=1`.

## Changing the rules
Any change to validation rules, reward, supply or difficulty splits the network into two chains. Such changes need wide agreement and a clearly announced activation height.
