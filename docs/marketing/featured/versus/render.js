const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path');
const dir=__dirname; const specs=JSON.parse(fs.readFileSync(path.join(dir,'specs.json'),'utf8'));
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const tick=`<svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="#0943B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>`;
function html(tools){
  const n=tools.length, W=n==2?520:400, gap=n==2?200:110;
  const total=n*W+(n-1)*gap, left=(1600-total)/2;
  const cards=tools.map(([name,pts],i)=>{
    const x=left+i*(W+gap);
    return `<div class="card" style="left:${x}px;width:${W}px"><p class="lab">[ pick ${esc(name.toLowerCase())} for ]</p><h2${name.length>12?' class="sm"':''}>${esc(name)}</h2><ul>${pts.map(p=>`<li>${tick}<span>${esc(p)}</span></li>`).join('')}</ul></div>`;}).join('');
  const vs=[]; for(let i=0;i<n-1;i++){const cx=left+(i+1)*W+i*gap+gap/2; vs.push(`<div class="line" style="left:${cx-gap/2}px;width:${gap}px"></div><div class="vs" style="left:${cx-44}px">vs</div>`);}
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1600px;height:840px;position:relative;overflow:hidden;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;
background-color:#0943B0;
background-image:linear-gradient(rgba(255,255,255,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.13) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
background-size:160px 160px,160px 160px,32px 32px,32px 32px;background-position:-1px -1px}
.plus{position:absolute;width:30px;height:30px}.plus:before,.plus:after{content:"";position:absolute;background:#fff}
.plus:before{left:14px;top:0;width:2px;height:30px}.plus:after{top:14px;left:0;height:2px;width:30px}
.card{position:absolute;top:224px;height:392px;background:#fff;border:1px solid #0B0D12;padding:40px 40px}
.lab{font-size:22px;color:#6B7280;letter-spacing:.01em}
h2{margin-top:18px;font-size:54px;line-height:1.1;font-weight:600;letter-spacing:-.02em;color:#0B0D12}
h2.sm{font-size:44px}
ul{list-style:none;margin-top:44px;display:grid;gap:26px}
li{display:flex;align-items:center;gap:16px;font-size:28px;color:#1F2430}
li svg{flex:none}
.line{position:absolute;top:420px;border-top:3px dashed #fff}
.vs{position:absolute;top:376px;width:88px;height:88px;background:#fff;border:1px solid #0B0D12;display:grid;place-items:center;font-size:34px;font-weight:600;color:#0943B0}
</style></head><body>
<div class="plus" style="left:49px;top:49px"></div><div class="plus" style="right:49px;top:49px"></div><div class="plus" style="left:49px;bottom:49px"></div><div class="plus" style="right:49px;bottom:49px"></div>
${vs.join('')}${cards}</body></html>`;}
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1600,height:840}});
const only=process.argv.slice(2);
for(const [slug,tools] of Object.entries(specs)){ if(only.length&&!only.includes(slug))continue;
 await p.setContent(html(tools),{waitUntil:'networkidle'}); await p.evaluate(()=>document.fonts.ready);
 await p.screenshot({path:path.join(dir,`${slug}-featured.png`)}); console.log('ok',slug);}
await b.close();})();
