import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
// Pace fixture traffic against the real API limit; never retry care mutations.
test.beforeAll(async({request})=>{
  test.setTimeout(90000);
  const response=await request.get('http://localhost:3001/health');
  const remaining=Number(response.headers()['x-ratelimit-remaining']);
  if(Number.isFinite(remaining)&&remaining<140){
    const reset=Number(response.headers()['x-ratelimit-reset']);
    await new Promise(resolve=>setTimeout(resolve,(Number.isFinite(reset)?Math.min(60,Math.max(1,reset)):60)*1000+1000));
  }
});
async function setup(request:APIRequestContext){
  const post=async(path:string,body:unknown,token?:string)=>{const r=await request.post('http://localhost:3001'+path,{data:body,headers:token?{Authorization:`Bearer ${token}`}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
  const auth=await post('/auth/register',{name:'Fictional caregiver',email:`${randomUUID()}@rich.test`,password:'a long fictional passphrase'});
  const h=await post('/households',{name:'Care depth test',timezone:'America/Chicago'},auth.token);
  for(const firstName of ['River','Sage'])await post(`/households/${h.id}/children`,{firstName,dateOfBirth:'2026-01-01'},auth.token);
  return{auth,h,post};
}
test('mixed diaper, multi-food meal, repeat draft and report exploration remain mobile usable',async({page,request},info)=>{
  const {auth,h}=await setup(request);await page.addInitScript(a=>sessionStorage.setItem('nestwise.session',JSON.stringify(a)),auth);await page.setViewportSize({width:390,height:844});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.getByRole('button',{name:'Log diaper for River',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Log a little moment'});
  await dialog.getByRole('radio',{name:'mixed',exact:true}).click();await dialog.getByRole('radio',{name:'big',exact:true}).first().click();await dialog.getByRole('radio',{name:'medium',exact:true}).last().click();
  await dialog.getByRole('checkbox',{name:'Sage',exact:true}).click();await page.screenshot({path:info.outputPath('mixed-diaper-390.png')});
  await dialog.getByRole('button',{name:'Confirm and save',exact:true}).click();await page.goto('/timeline');await expect(page.getByText('Mixed diaper · big pee · medium poo',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Log care',exact:true}).click();await page.getByRole('button',{name:'Choose Food',exact:true}).click();dialog=page.getByRole('dialog',{name:'Log a little moment'});
  for(const name of ['Oatmeal','Banana']){await dialog.getByRole('textbox',{name:'Food',exact:true}).fill(name);await dialog.getByRole('button',{name:'Add food to meal',exact:true}).click();}
  await dialog.getByRole('button',{name:'Add amount: Oatmeal',exact:true}).click();
  expect(await dialog.evaluate(element=>[element,...element.querySelectorAll('*')].filter(e=>e instanceof HTMLElement && e.clientWidth>0 && e.scrollWidth>e.clientWidth+1 && getComputedStyle(e).overflowX==='auto').length)).toBe(0);
  await dialog.getByRole('textbox',{name:'Amount: Oatmeal',exact:true}).fill('2');await dialog.getByRole('radio',{name:'tbsp',exact:true}).first().click();await dialog.getByRole('radio',{name:'Enjoyed',exact:true}).first().click();
  await dialog.getByRole('checkbox',{name:'Possible sensitivity observed',exact:true}).last().click();await dialog.getByRole('textbox',{name:'Observation details: Banana',exact:true}).fill('A red patch noticed by caregiver');
  await page.setViewportSize({width:412,height:915});await page.screenshot({path:info.outputPath('meal-412.png')});await dialog.getByRole('button',{name:'Confirm and save',exact:true}).click();
  await expect(page.getByText('Oatmeal · 2 tbsp · liked + Banana · sensitivity observed',{exact:true})).toBeVisible();
  await page.getByText('Oatmeal · 2 tbsp · liked + Banana · sensitivity observed',{exact:true}).locator('..').getByRole('button',{name:'Repeat log',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Possible sensitivity observed',exact:true}).last()).not.toBeChecked();await page.getByRole('dialog',{name:'Log a little moment'}).getByRole('button',{name:'Close',exact:true}).click();
  await page.goto('/reports');for(const view of ['Day','Week','List','Summary']){await page.getByRole('radio',{name:view,exact:true}).click();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`reports-${view}-412.png`),fullPage:true});}
  await expect(page.getByText('Meals with oatmeal: 1',{exact:true})).toBeVisible();
  const response=await request.get(`http://localhost:3001/households/${h.id}/snapshot`,{headers:{Authorization:`Bearer ${auth.token}`}});expect(response.ok()).toBeTruthy();expect((await response.json()).events.find((e:{category:string})=>e.category==='food').details.foods).toHaveLength(2);expect(errors).toEqual([]);
});
test('food library changes survive offline reload and update another open caregiver view',async({page,browser,request})=>{
  const {auth,h,post}=await setup(request);await page.addInitScript(a=>sessionStorage.setItem('nestwise.session',JSON.stringify(a)),auth);await page.goto('/settings');await page.getByRole('button',{name:'Manage food library'}).click();
  await page.route('**/foods/sync',r=>r.abort('internetdisconnected'));await page.getByRole('textbox',{name:'Library food name'}).fill('Family oatmeal');await page.getByRole('button',{name:'Save library food',exact:true}).click();await expect(page.getByText('Family oatmeal',{exact:true})).toBeVisible();await page.reload();await page.getByRole('button',{name:'Manage food library'}).click();await expect(page.getByText('Family oatmeal',{exact:true})).toBeVisible();
  await page.unroute('**/foods/sync');await page.getByRole('dialog',{name:'Your food library'}).getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Sync now',exact:true}).click();await expect(page.getByText('0 pending food edits · 0 food conflicts',{exact:true})).toBeVisible();
  const other=await browser.newContext();await other.addInitScript(a=>sessionStorage.setItem('nestwise.session',JSON.stringify(a)),auth);const observer=await other.newPage();await observer.goto('http://localhost:8081/settings');await observer.getByRole('button',{name:'Manage food library'}).click();
  const snapshot=await request.get(`http://localhost:3001/households/${h.id}/snapshot`,{headers:{Authorization:`Bearer ${auth.token}`}});expect(snapshot.ok(),await snapshot.text()).toBeTruthy();const food=(await snapshot.json()).foods[0];await post(`/households/${h.id}/foods/sync`,{mutationId:randomUUID(),foodId:food.id,baseVersion:food.version,food:{name:'Updated oatmeal',childIds:[],active:true,favorite:true}},auth.token);
  await expect(observer.getByText('Updated oatmeal · Favorite',{exact:true})).toBeVisible();await other.close();
  await page.getByRole('button',{name:'Manage food library'}).click();await page.getByRole('button',{name:'Archive Updated oatmeal',exact:true}).click();await expect(page.getByRole('button',{name:'Archive Updated oatmeal',exact:true})).toHaveCount(0);await page.getByRole('radio',{name:'Archived foods',exact:true}).click();await expect(page.getByRole('button',{name:'Restore Updated oatmeal',exact:true})).toBeVisible();
});
