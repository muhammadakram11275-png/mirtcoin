# Contributing
MirtCoin has no owner of the network: anyone may run a node, mine, fork the code, or send a pull request.
- **Bugs and ideas:** open an issue (see the templates).
- **Pull requests:** keep them small and focused, explain what and why, and say how you tested.
- **Consensus changes** (anything in `engine.js` that decides whether a block or transaction is valid) are different: they split the network if people disagree. Open an issue first and discuss; they need an activation height and broad support.
- **Seed nodes:** add your public node URL to `seeds.json` by pull request.
- Keep the project dependency-light. The node needs only Node.js 18+ and no npm packages.
