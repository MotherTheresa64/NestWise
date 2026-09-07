/* global sessionStorage, document, innerWidth */
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import console from 'node:console';
const auth=JSON.parse(await readFile('.local/fictional-seed.json','utf8'));
const browser=await chromium.launch();const context=await browser.newContext();await context.addInitScript(s=>sessionStorage.setItem('nestwise.session',JSON.stringify({token:s.token,user:s.user})),auth);
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('.local/visual',{recursive:true});
for(const [width,height] of [[390,844],[412,915],[768,1024],[1366,768],[1920,1080]]){
 await page.setViewportSize({width,height});
 for(const route of ['','timeline','reports','children','household','reminders','settings']){
  await page.goto(`http://localhost:8081/${route}`);await page.getByRole('heading').first().waitFor();await page.screenshot({path:`.local/visual/${route||'overview'}-${width}.png`});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))errors.push(`overflow ${route} ${width}`);
 }
}
await browser.close();if(errors.length)throw new Error(errors.join('\n'));console.log('Captured all seven main screens at five sizes; no page errors or document overflow.');
