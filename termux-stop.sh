#!/data/data/com.termux/files/usr/bin/sh
cd "$(dirname "$0")" || exit 1
[ -f data/node.pid ] && kill "$(cat data/node.pid)" 2>/dev/null && rm -f data/node.pid && echo "node stopped"
termux-wake-unlock 2>/dev/null
