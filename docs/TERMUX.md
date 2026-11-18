# Phone (Android + Termux) e MirtCoin node + miner

1. Termux install koro (F-Droid theke, Play Store-er Termux puraton).
2. Termux e:
   pkg update -y && pkg install -y nodejs unzip
   termux-setup-storage
3. Zip phone-er Downloads e rakho, tarpor:
   cp ~/storage/downloads/mirtcoin-desktop.zip ~ && unzip mirtcoin-desktop.zip && cd mirtcoin-desktop
4. Notun wallet lagle:  node miner.js --new     (24 shobdo kagoje likhe rakho)
   Tomar already address thakle (M diye shuru) oita-i dao.
5. Chalao (node + miner ek shathe):
   sh termux-start.sh TOMAR_ADDRESS 40
   (40 = CPU %, phone thanda rakhte 25-50 rakho. Charger e rakho.)
6. Website: phone browser e http://127.0.0.1:8332 kholo.
7. Laptop-er node-er sathe jora (laptop e cloudflared tunnel chalu thakle):
   MIRT_SEEDS=https://xxxx.trycloudflare.com sh termux-start.sh TOMAR_ADDRESS 40
8. Bondho:  Ctrl+C (miner), tarpor  sh termux-stop.sh

Jaruri: phone Doze mode e background process maare. Termux notification e "Acquire wakelock" thakte dao, ar Settings > Battery > Termux > Unrestricted koro.
Phone-er hashrate kom (laptop-er cheye onek). Block paoa dhire hobe, ar phone garom hote pare, tai CPU % kom rakho.
