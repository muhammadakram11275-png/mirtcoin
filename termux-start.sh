#!/data/data/com.termux/files/usr/bin/sh
# Usage: sh termux-start.sh YOUR_MIRT_ADDRESS [cpu%]      (optional: MIRT_SEEDS=https://link sh termux-start.sh ...)
cd "$(dirname "$0")" || exit 1
[ -z "$1" ] && { echo "Usage: sh termux-start.sh YOUR_MIRT_ADDRESS [cpu%]"; exit 1; }
command -v node >/dev/null 2>&1 || pkg install -y nodejs
termux-wake-lock 2>/dev/null
mkdir -p data
if [ -f data/node.pid ] && kill -0 "$(cat data/node.pid)" 2>/dev/null; then
  echo "Node already running."
else
  nohup node server.js > data/node.log 2>&1 &
  echo $! > data/node.pid; sleep 3
fi
echo "Website: open http://127.0.0.1:8332 in the phone browser. Stop everything: sh termux-stop.sh"
exec node miner.js --addr "$1" --cpu "${2:-40}"
