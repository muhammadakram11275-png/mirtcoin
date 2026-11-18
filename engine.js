/* MIRT chain engine: Bitcoin-style PoW + UTXO + secp256k1 ECDSA. Runs fully in the browser. */
const MirtChain=(function(){
const enc=new TextEncoder(),UNIT=1e8,MAXSUP=27000000*UNIT,PREMINE1=1500000*UNIT,PREMINE2=750000*UNIT,HALVING=1650000,R0=7.5*UNIT,RETARGET=10,TARGET_SEC=120,START_BITS=24,MIN_BITS=22,MAX_BITS=48,MAX_REORG=360;
/* ---------- SHA-256 ---------- */
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const Wb=new Uint32Array(64);
function sha256(m){const l=m.length,nb=((l+9+63)>>6)<<6,b=new Uint8Array(nb);b.set(m);b[l]=0x80;const dv=new DataView(b.buffer);dv.setUint32(nb-4,(l*8)>>>0);dv.setUint32(nb-8,Math.floor(l/0x20000000));
let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
for(let o=0;o<nb;o+=64){for(let i=0;i<16;i++)Wb[i]=dv.getUint32(o+i*4);
for(let i=16;i<64;i++){const a=Wb[i-15],c=Wb[i-2],s0=((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3),s1=((c>>>17)|(c<<15))^((c>>>19)|(c<<13))^(c>>>10);Wb[i]=(Wb[i-16]+s0+Wb[i-7]+s1)|0}
let a=h0,bb=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
for(let i=0;i<64;i++){const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+Wb[i])|0,S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)),mj=(a&bb)^(a&c)^(bb&c),t2=(S0+mj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=bb;bb=a;a=(t1+t2)|0}
h0=(h0+a)|0;h1=(h1+bb)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0}
const out=new Uint8Array(32),ov=new DataView(out.buffer);[h0,h1,h2,h3,h4,h5,h6,h7].forEach((v,i)=>ov.setUint32(i*4,v>>>0));return out}
const sha256d=m=>sha256(sha256(m));
const hex=u=>Array.from(u,x=>x.toString(16).padStart(2,"0")).join("");
const unhex=s=>{const u=new Uint8Array(s.length/2);for(let i=0;i<u.length;i++)u[i]=parseInt(s.substr(i*2,2),16);return u};
const hs=s=>hex(sha256d(enc.encode(s)));
function zeroBits(u){let n=0;for(const x of u){if(x===0){n+=8;continue}n+=Math.clz32(x)-24;break}return n}
/* ---------- secp256k1 ---------- */
const P=2n**256n-2n**32n-977n,N=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n,G={x:0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,y:0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n};
const md=(a,m=P)=>{const r=a%m;return r>=0n?r:r+m};
function inv(a,m=P){let[l,h]=[md(a,m),m],[x0,x1]=[1n,0n];while(h){const q=l/h;[l,h]=[h,l-q*h];[x0,x1]=[x1,x0-q*x1]}return md(x0,m)}
function padd(a,b){if(!a)return b;if(!b)return a;let l;if(a.x===b.x){if(md(a.y+b.y)===0n)return null;l=md(3n*a.x*a.x*inv(2n*a.y))}else l=md((b.y-a.y)*inv(b.x-a.x));const x=md(l*l-a.x-b.x);return{x,y:md(l*(a.x-x)-a.y)}}
function pmul(k,p){let r=null,q=p;while(k>0n){if(k&1n)r=padd(r,q);q=padd(q,q);k>>=1n}return r}
const big=u=>BigInt("0x"+(hex(u)||"0")),b32=n=>unhex(n.toString(16).padStart(64,"0"));
const pubHex=pt=>(pt.y&1n?"03":"02")+pt.x.toString(16).padStart(64,"0");
function pubParse(h){const x=BigInt("0x"+h.slice(2)),y2=md(x*x*x+7n);let y=1n,e=(P+1n)/4n,b=y2,r=1n;while(e>0n){if(e&1n)r=md(r*b);b=md(b*b);e>>=1n}y=r;if(md(y*y)!==y2)throw Error("bad pubkey");if((y&1n)!==(h.slice(0,2)==="03"?1n:0n))y=P-y;return{x,y}}
function sign(d,msgHex){const z=BigInt("0x"+msgHex)%N;for(let c=0;;c++){const k=big(sha256(enc.encode(d.toString(16)+msgHex+c)))%N;if(k===0n)continue;const R=pmul(k,G),r=md(R.x,N);if(r===0n)continue;let s=md(inv(k,N)*(z+r*d),N);if(s===0n)continue;if(s>N/2n)s=N-s;return r.toString(16).padStart(64,"0")+s.toString(16).padStart(64,"0")}}
function verify(pubH,msgHex,sig){try{const Q=pubParse(pubH),z=BigInt("0x"+msgHex)%N,r=BigInt("0x"+sig.slice(0,64)),s=BigInt("0x"+sig.slice(64));if(r<=0n||r>=N||s<=0n||s>=N)return false;const w=inv(s,N),pt=padd(pmul(md(z*w,N),G),pmul(md(r*w,N),Q));return !!pt&&md(pt.x,N)===r}catch(e){return false}}
/* ---------- addresses (Base58Check, version 0x32 -> starts with M) ---------- */
const B58="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58e(u){let n=big(u),s="";while(n>0n){s=B58[Number(n%58n)]+s;n/=58n}for(const x of u){if(x)break;s="1"+s}return s}
function b58d(s){let n=0n;for(const c of s){const i=B58.indexOf(c);if(i<0)throw Error("b58");n=n*58n+BigInt(i)}let h=n.toString(16);if(h.length%2)h="0"+h;const u=n?unhex(h):new Uint8Array(0);let z=0;while(z<s.length&&s[z]==="1")z++;const o=new Uint8Array(z+u.length);o.set(u,z);return o}
function addrOf(pubH){const h=sha256(sha256(unhex(pubH))).slice(0,20),pl=new Uint8Array(21);pl[0]=0x32;pl.set(h,1);const ck=sha256d(pl).slice(0,4),f=new Uint8Array(25);f.set(pl);f.set(ck,21);return b58e(f)}
function validAddr(a){try{if(typeof a!=="string"||a.length<26||a.length>36)return false;const u=b58d(a);if(u.length!==25||u[0]!==0x32)return false;const ck=sha256d(u.slice(0,21)).slice(0,4);return ck.every((x,i)=>x===u[21+i])}catch(e){return false}}
/* ---------- wallet from username + password ---------- */
async function wallet(user,pass){user=String(user).trim().toLowerCase();const km=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveBits"]);const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode("MIRT-WALLET-v1:"+user),iterations:200000,hash:"SHA-256"},km,256));const d=big(bits)%(N-1n)+1n,pub=pubHex(pmul(d,G));return{user,d,pub,addr:addrOf(pub)}}
/* ---------- transactions ---------- */
const txid=t=>hs(JSON.stringify([t.ins.map(i=>[i.txid,i.n]),t.outs.map(o=>[o.addr,o.amt]),t.msg||"",t.h||0]));
function mkTx(ins,outs,extra){const t=Object.assign({ins,outs},extra||{});t.id=txid(t);return t}
function coinbase(h,outs,msg){return mkTx([],outs,{h,msg:msg||""})}
const reward=h=>h<1?0:Math.floor(R0/Math.pow(2,Math.floor((h-1)/HALVING)));
/* ---------- merkle & header ---------- */
function merkle(ids){if(!ids.length)return hex(new Uint8Array(32));let l=ids.slice();while(l.length>1){if(l.length%2)l.push(l[l.length-1]);const n=[];for(let i=0;i<l.length;i+=2)n.push(hex(sha256d(unhex(l[i]+l[i+1]))));l=n}return l[0]}
function headerBytes(b,nonce){const u=new Uint8Array(73),dv=new DataView(u.buffer);u.set(unhex(b.prev),0);u.set(unhex(b.merkle),32);dv.setUint32(64,b.time>>>0);u[68]=b.bits;dv.setUint32(69,nonce>>>0);return u}
const blockHash=b=>hex(sha256d(headerBytes(b,b.nonce)));
/* ---------- chain ---------- */
class Chain{
constructor(genesisOuts,store){this.store=store||null;this.gOuts=genesisOuts;this.blocks=[];this.mempool=[];this.utxo=new Map();if(!this.load())this.reset()}
reset(){this.blocks=[];this.mempool=[];this.utxo=new Map();const cb=coinbase(0,this.gOuts,"MirtCoin ($MIRT) genesis 16/Nov/2026: mine it, own it");const g={height:0,prev:hex(new Uint8Array(32)),merkle:merkle([cb.id]),time:1794787200,bits:0,nonce:0,txs:[cb],miner:"genesis"};g.hash=blockHash(g);this.blocks.push(g);this.applyTxs(g);this.save()}
save(){if(!this.store)return;try{this.store.setItem("mirt_mainnet_v1",JSON.stringify({g:this.gOuts[0].addr,b:this.blocks,m:this.mempool}))}catch(e){}}
load(){if(!this.store)return false;try{const j=JSON.parse(this.store.getItem("mirt_mainnet_v1")||"null");if(!j||j.g!==this.gOuts[0].addr||!j.b||!j.b.length)return false;const gen=new Chain(this.gOuts,null);if(j.b[0].hash!==gen.blocks[0].hash)return false;this.blocks=[gen.blocks[0]];this.utxo=new Map();this.applyTxs(this.blocks[0]);for(let i=1;i<j.b.length;i++){const r=this.accept(j.b[i],true);if(r!==true){this.blocks=[gen.blocks[0]];this.utxo=new Map();this.applyTxs(this.blocks[0]);break}}this.mempool=[];(j.m||[]).forEach(t=>this.submit(t));return true}catch(e){return false}}
work(){let w=0n;for(const b of this.blocks)w+=2n**BigInt(b.bits);return w}
tryReplace(bl){const c=new Chain(this.gOuts,null);if(!Array.isArray(bl)||!bl.length||bl[0].hash!==c.blocks[0].hash)return"bad genesis";c.checkpoints=this.checkpoints;{let f=0;while(f<bl.length&&f<this.blocks.length&&bl[f].hash===this.blocks[f].hash)f++;if(this.blocks.length-f>MAX_REORG)return"reorg too deep"}for(let i=1;i<bl.length;i++){const r=c.accept(bl[i]);if(r!==true)return"block "+i+": "+r}if(c.work()<=this.work())return"not more work";this.blocks=c.blocks;this.utxo=c.utxo;const old=this.mempool;this.mempool=[];old.forEach(t=>this.submit(t));this.save();return true}
get tip(){return this.blocks[this.blocks.length-1]}
applyTxs(b){for(const t of b.txs){for(const i of t.ins)this.utxo.delete(i.txid+":"+i.n);t.outs.forEach((o,n)=>this.utxo.set(t.id+":"+n,{addr:o.addr,amt:o.amt,txid:t.id,n,h:b.height}))}}
nextBits(){const h=this.blocks.length,t=this.tip;if(h%RETARGET!==0)return t.bits||START_BITS;if(h<RETARGET)return START_BITS;const a=this.blocks[h-RETARGET],span=Math.max(1,t.time-a.time),ratio=(RETARGET*TARGET_SEC)/span;let d=Math.round(Math.log2(ratio));d=Math.max(-2,Math.min(2,d));return Math.max(MIN_BITS,Math.min(MAX_BITS,(t.bits||START_BITS)+d))}
balance(addr){let s=0;for(const u of this.utxo.values())if(u.addr===addr)s+=u.amt;return s}
utxosOf(addr){const l=[];for(const[k,u]of this.utxo)if(u.addr===addr)l.push(Object.assign({key:k},u));return l.sort((a,b)=>b.amt-a.amt)}
supply(){let s=0;for(const u of this.utxo.values())s+=u.amt;return s}
checkTx(t,pool){/* returns fee or error string */if(!t||!t.ins||!t.outs||!t.outs.length)return"bad tx";if(txid(t)!==t.id)return"bad txid";let inSum=0,outSum=0;const seen=new Set(),msg=t.id;
for(const i of t.ins){const k=i.txid+":"+i.n;if(seen.has(k))return"duplicate input";seen.add(k);const u=this.utxo.get(k);if(!u)return"input already spent or unknown";if(pool&&pool.has(k))return"already in mempool";if(addrOf(i.pub)!==u.addr)return"pubkey does not match";if(!verify(i.pub,msg,i.sig))return"bad signature";inSum+=u.amt}
for(const o of t.outs){if(!validAddr(o.addr))return"bad address";if(!Number.isInteger(o.amt)||o.amt<=0)return"bad amount";outSum+=o.amt}
if(!t.ins.length)return"no inputs";if(outSum>inSum)return"outputs exceed inputs";return inSum-outSum}
submit(t){const pool=new Set();this.mempool.forEach(m=>m.ins.forEach(i=>pool.add(i.txid+":"+i.n)));const r=this.checkTx(t,pool);if(typeof r==="string")return r;this.mempool.push(t);this.save();return true}
build(from,to,amt,fee){/* amt, fee in MIRT units (integers of 1e-8) */const need=amt+fee,us=this.utxosOf(from.addr),taken=[];let s=0;const used=new Set();this.mempool.forEach(m=>m.ins.forEach(i=>used.add(i.txid+":"+i.n)));for(const u of us){if(used.has(u.key))continue;taken.push(u);s+=u.amt;if(s>=need)break}if(s<need)return"Not enough balance";const outs=[{addr:to,amt}];if(s-need>0)outs.push({addr:from.addr,amt:s-need});const t=mkTx(taken.map(u=>({txid:u.txid,n:u.n})),outs);const sig=sign(from.d,t.id);t.ins.forEach(i=>{i.pub=from.pub;i.sig=sig});/* id excludes sigs */return t}
expectedBits(time){const base=this.nextBits(),el=time-this.tip.time;let r=0;if(el>4*TARGET_SEC)r=Math.min(30,Math.floor(Math.log2(el/(2*TARGET_SEC))));return Math.max(MIN_BITS,base-r)}
template(minerAddr){const h=this.blocks.length,txs=[],pool=new Set();let fees=0;for(const t of this.mempool){const r=this.checkTx(t,pool);if(typeof r==="number"){fees+=r;t.ins.forEach(i=>pool.add(i.txid+":"+i.n));txs.push(t)}}const cb=coinbase(h,[{addr:minerAddr,amt:reward(h)+fees}],"");const all=[cb].concat(txs);const T=Math.max(Math.floor(Date.now()/1000),this.tip.time+1);return{height:h,prev:this.tip.hash,merkle:merkle(all.map(t=>t.id)),time:T,bits:this.expectedBits(T),nonce:0,txs:all,miner:minerAddr}}
accept(b,quiet){try{return this._accept(b,quiet)}catch(e){return"malformed block"}}
_accept(b,quiet){if(!b||!Array.isArray(b.txs)||!b.txs.length||b.txs.length>5000)return"bad block";if(!quiet&&b.time>Math.floor(Date.now()/1000)+7200)return"time too far in future";const t=this.tip;if(b.height!==this.blocks.length)return"wrong height";if(b.prev!==t.hash)return"wrong parent";if(!Number.isInteger(b.time)||b.time<t.time)return"bad time";if(!(b.bits<=this.nextBits()&&b.bits>=this.expectedBits(b.time)))return"wrong difficulty";if(blockHash(b)!==b.hash)return"bad hash";{const cp=this.checkpoints&&this.checkpoints[b.height];if(cp&&cp!==b.hash)return"checkpoint mismatch"}if(zeroBits(unhex(b.hash))<b.bits)return"not enough work";if(merkle(b.txs.map(x=>x.id))!==b.merkle)return"bad merkle";
const cb=b.txs[0];if(!cb||cb.ins.length||cb.h!==b.height||txid(cb)!==cb.id)return"bad coinbase";if(!Array.isArray(cb.outs)||!cb.outs.length||cb.outs.some(o=>!validAddr(o.addr)||!Number.isInteger(o.amt)||o.amt<=0))return"bad coinbase outputs";let fees=0;const pool=new Set();for(const x of b.txs.slice(1)){const r=this.checkTx(x,pool);if(typeof r!=="number")return"tx: "+r;fees+=r;x.ins.forEach(i=>pool.add(i.txid+":"+i.n))}
const cbSum=cb.outs.reduce((s,o)=>s+o.amt,0);if(cbSum>reward(b.height)+fees)return"coinbase too large";if(this.supply()+reward(b.height)>MAXSUP)return"supply cap";
this.blocks.push(b);this.applyTxs(b);const ids=new Set(b.txs.map(x=>x.id));this.mempool=this.mempool.filter(m=>!ids.has(m.id)&&m.ins.every(i=>this.utxo.has(i.txid+":"+i.n)));if(!quiet)this.save();return true}
history(addr,lim){const out=[];for(let i=this.blocks.length-1;i>=0&&out.length<(lim||20);i--){const b=this.blocks[i];for(const t of b.txs){let recv=0,sent=0;t.outs.forEach(o=>{if(o.addr===addr)recv+=o.amt});const isCb=!t.ins.length;if(t.ins.some(x=>x.pub&&addrOf(x.pub)===addr)){sent=1}if(recv||sent){out.push({h:b.height,id:t.id,time:b.time,cb:isCb,sent:!!sent,outs:t.outs,recv})}}}return out}
rich(n){const m=new Map();for(const u of this.utxo.values())m.set(u.addr,(m.get(u.addr)||0)+u.amt);return[...m].sort((a,b)=>b[1]-a[1]).slice(0,n||10)}
minersTop(n){const m=new Map();for(const b of this.blocks.slice(1))m.set(b.miner,(m.get(b.miner)||0)+1);return[...m].sort((a,b)=>b[1]-a[1]).slice(0,n||999)}
}
/* miner: calls step() repeatedly; returns {found, hashes} */
function mineSlice(b,ms,startNonce){const hdr=headerBytes(b,0),dv=new DataView(hdr.buffer),t0=Date.now();let n=startNonce>>>0,cnt=0;for(;;){dv.setUint32(69,n);const h=sha256d(hdr);cnt++;if(zeroBits(h)>=b.bits){b.nonce=n;b.hash=hex(h);return{found:true,hashes:cnt,nonce:n}}n=(n+1)>>>0;if(n===0){b.time++;dv.setUint32(64,b.time>>>0)}if((cnt&1023)===0&&Date.now()-t0>=ms)return{found:false,hashes:cnt,nonce:n,last:hex(h)}}}
const fmt=a=>{const w=Math.trunc(a/UNIT),f=String(Math.abs(a)%UNIT).padStart(8,"0").replace(/0+$/,"");return w.toLocaleString("en-US")+(f?"."+f:"")};
const parseAmt=s=>{s=String(s).trim();if(!/^\d+(\.\d{1,8})?$/.test(s))return null;const[w,f=""]=s.split(".");return Number(w)*UNIT+Number((f+"00000000").slice(0,8))};
/* ---------- recovery phrase (24 words, MIRT format, not BIP39) ---------- */
const C1="bdfghklmnprstvwz",V1="aeio",C2="dklmnrst",V2="aeiu";
const WORDS=[];for(let a=0;a<16;a++)for(let b=0;b<4;b++)for(let c=0;c<8;c++)for(let d=0;d<4;d++)WORDS.push(C1[a]+V1[b]+C2[c]+V2[d]);
const WIDX=new Map(WORDS.map((w,i)=>[w,i]));
function keyFromEntropy(e){const d=big(sha256d(enc.encode("MIRT-SEED-v1:"+hex(e))))%(N-1n)+1n,pub=pubHex(pmul(d,G));return{user:"recovery-phrase wallet",d,pub,addr:addrOf(pub)}}
function newPhrase(){const e=new Uint8Array(32);crypto.getRandomValues(e);let bits="";for(const x of e)bits+=x.toString(2).padStart(8,"0");bits+=sha256(e)[0].toString(2).padStart(8,"0");const words=[];for(let i=0;i<24;i++)words.push(WORDS[parseInt(bits.slice(i*11,i*11+11),2)]);return{words,phrase:words.join(" ")}}
function walletFromPhrase(t){const w=String(t).toLowerCase().trim().split(/\s+/);if(w.length!==24)throw Error("Phrase must be exactly 24 words");let bits="";for(const x of w){if(!WIDX.has(x))throw Error("Unknown word: "+x);bits+=WIDX.get(x).toString(2).padStart(11,"0")}const e=new Uint8Array(32);for(let i=0;i<32;i++)e[i]=parseInt(bits.slice(i*8,i*8+8),2);if(sha256(e)[0]!==parseInt(bits.slice(256,264),2))throw Error("Phrase checksum failed. Check every word.");return keyFromEntropy(e)}
return{newPhrase,walletFromPhrase,GENESIS_OUTS:[{addr:"MJVmaN7EDd3yCyBVJPSMLFuif1CWQdDV3G",amt:PREMINE1},{addr:"MUjpdU53kecUVrji7df8stDMFjvE9n8mUq",amt:PREMINE2}],Chain,wallet,addrOf,validAddr,sha256,sha256d,hex,unhex,mineSlice,reward,fmt,parseAmt,zeroBits,blockHash,verify,sign,UNIT,MAXSUP,PREMINE1,PREMINE2,HALVING,RETARGET,TARGET_SEC,START_BITS}})();

if(typeof module!=="undefined")module.exports=MirtChain;
