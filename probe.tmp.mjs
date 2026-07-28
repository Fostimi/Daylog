import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/')p='/index.html';const raw=await readFile(join('dist',p));res.writeHead(200,{'Content-Type':MIME[extname(p)]||'application/octet-stream'});res.end(raw);}catch{res.writeHead(404).end('nf');}});
await new Promise(r=>server.listen(4395,r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
const page=await (await browser.newContext({...devices['Pixel 5'],locale:'fr-FR'})).newPage();
page.on('pageerror',e=>console.log('PAGEERROR',String(e)));
page.on('console',m=>m.type()==='error'&&console.log('CONSOLE',m.text()));
await page.goto('http://localhost:4395/',{waitUntil:'networkidle'});
for(let i=0;i<14&&await page.locator('.onb').count();i++){await page.locator('.onb-actions .btn-primary').click();await page.waitForTimeout(80);}
await page.waitForSelector('[data-slot]');
await page.evaluate(async()=>{
  const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const db=await new Promise(r=>{const q=indexedDB.open('daylog');q.onsuccess=()=>r(q.result);});
  const t=db.transaction(['summaries','meta'],'readwrite');
  const today=new Date();
  for(let i=1;i<365;i++){const d=new Date(today);d.setDate(d.getDate()-i);const date=key(d);
    const weight=i%3?Math.round((72+i*0.005+((i*7)%11)*0.1)*10)/10:null;
    t.objectStore('summaries').put({date,kcal:2600,...(weight?{weightKg:weight}:{})});}
  t.objectStore('meta').put({key:'modules',value:{nutrition:true,health:true}});
  t.objectStore('meta').put({key:'profile',value:{identity:{address:'neutral',gender:'man'},body:{birthYear:new Date().getFullYear()-30,heightCm:175,weightKg:72,calcBasis:'a'},goals:{hasGoal:true,weight:'lose-slow',activity:'moderate'}}});
  await new Promise(r=>{t.oncomplete=r;});
});
await page.reload({waitUntil:'networkidle'});
await page.waitForSelector('[data-slot]');
await page.locator('.nav-toggle').click();
await page.locator('.nav-item:has-text("Profil")').click();
await page.waitForTimeout(800);
const out = await page.evaluate(()=>({
  trend: document.querySelector('.health-trend-main')?.textContent||null,
  facts: [...document.querySelectorAll('.fact')].map(f=>`${f.querySelector('dt')?.textContent}=${f.querySelector('dd')?.textContent}`),
  hints: [...document.querySelectorAll('.card-hint')].map(h=>h.textContent).filter(t=>/recal|pesée|formule|journal/i.test(t)),
}));
console.log(JSON.stringify(out,null,1));
await browser.close();server.close();
