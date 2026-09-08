import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('child-focused mobile navigation keeps logging, filters and sibling context accessible',async({page,request},info)=>{
  test.setTimeout(120000);
  const health=await request.get('http://localhost:3001/health');
  if(Number(health.headers()['x-ratelimit-remaining'])<90)await new Promise(resolve=>setTimeout(resolve,61000));
  const authResponse=await request.post('http://localhost:3001/auth/register',{data:{name:'Fictional UI caregiver',email:`${randomUUID()}@ux.test`,password:'a long fictional passphrase'}});
  expect(authResponse.ok()).toBeTruthy();const auth=await authResponse.json();
  const headers={Authorization:`Bearer ${auth.token}`};
  const household=await request.post('http://localhost:3001/households',{headers,data:{name:'Fictional UX family',timezone:'America/Chicago'}});expect(household.ok()).toBeTruthy();const h=await household.json();
  for(const firstName of ['River','Sage'])expect((await request.post(`http://localhost:3001/households/${h.id}/children`,{headers,data:{firstName,dateOfBirth:'2026-01-01'}})).ok()).toBeTruthy();
  await page.addInitScript(a=>sessionStorage.setItem('nestwise.session',JSON.stringify(a)),auth);
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'Switch child: River',exact:true}).click();await page.getByRole('button',{name:'Select Sage',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sage’s day',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Log',exact:true}).click();await page.getByRole('button',{name:'Choose Bottle',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Log a little moment',exact:true});
  await expect(dialog.getByRole('checkbox',{name:'Sage',exact:true})).toBeChecked();await expect(dialog.getByRole('checkbox',{name:'River',exact:true})).not.toBeChecked();
  await expect(dialog.getByRole('textbox',{name:'Notes',exact:true})).toHaveCount(0);
  await dialog.getByRole('radio',{name:'4 oz',exact:true}).click();await dialog.getByRole('checkbox',{name:'River',exact:true}).click();
  await dialog.getByRole('button',{name:'Add a note',exact:true}).click();await dialog.getByRole('textbox',{name:'Notes',exact:true}).fill('Fictional shared feed');
  await dialog.getByRole('button',{name:'Confirm and save',exact:true}).click();
  await page.getByRole('link',{name:'Timeline',exact:true}).click();await expect(page.getByText('Fictional shared feed',{exact:true})).toBeVisible();
  await expect(page.getByRole('radio',{name:'Medicine',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Filter categories',exact:true}).click();await page.getByRole('radio',{name:'Bottle',exact:true}).click();await expect(page.getByText('Fictional shared feed',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Reports',exact:true}).click();await expect(page.getByRole('radio',{name:'Custom range',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Report filters',exact:true}).click();await page.getByRole('radio',{name:'Today',exact:true}).click();await page.getByRole('button',{name:'Hide filters',exact:true}).click();await page.getByRole('radio',{name:'List',exact:true}).click();await expect(page.getByText('4 oz bottle',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Food Library',exact:true}).click();await expect(page.getByRole('dialog',{name:'Your food library',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Your food library',exact:true})).toHaveCount(0);
  for(const [width,height] of [[390,844],[412,915],[768,1024],[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await page.goto('/');
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`home-${width}.png`)});
    if(width<900){await expect(page.getByRole('button',{name:'Log',exact:true})).toBeVisible();await page.getByRole('button',{name:'Log bottle for River',exact:true}).click();dialog=page.getByRole('dialog',{name:'Log a little moment',exact:true});await expect(dialog.getByRole('button',{name:'Confirm and save',exact:true})).toBeInViewport();await dialog.getByRole('button',{name:'Close',exact:true}).click();}
    else await expect(page.getByRole('link',{name:'Household',exact:true})).toBeVisible();
  }
  expect(errors).toEqual([]);
});
