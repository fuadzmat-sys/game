/** Integration check against the actual built game. Requires Playwright + Chromium. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { StoryEngine } from '../engine.js';
import { createStoryEnvelope, STORY_KEY } from '../story-state.js';
import { STORY_REGISTRY, replayCanonicalSnapshot, progressFromSnapshot } from '../story-bridge.js';
import { observeFlow } from '../flowchart.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const read = name => JSON.parse(fs.readFileSync(new URL('../'+name, import.meta.url), 'utf8'));
const scripts = {...read('assets/scripts.json'),...read('assets/chapter1-scripts.json')};
const characters = {...read('assets/config.json').characters,...read('assets/chapter1-art.json').characters};
const resources={scripts,characters,language:'russian'};
const choices={'ch0.creature':'Vampire','ch1.gideon_reason':'Openness','ch1.tracks':'Search','ch1.slope':'Pacifica','ch1.ending':'Observation'};
function full(chapter, selected=choices){
 const canon=createStoryEnvelope({choices:selected,currentChapter:chapter,progress:{[chapter]:{sceneId:chapter===0?'chapter_0/part_3_mothman/mothman_3':'chapter_1_v3/will',phase:'credits',completed:true,line:0,visited:chapter===0?['hardware_store','telepathy_tent','arcade','forest']:[]}}},STORY_REGISTRY).canon;
 return replayCanonicalSnapshot(chapter,canon,null,resources);
}
const zero=full(0),one=full(1);
let discovery=observeFlow(observeFlow(null,zero),one);
for(const monster of ['Werewolf','Wendigo']) discovery=observeFlow(discovery,full(0,{...choices,'ch0.creature':monster}));
for(const tracks of ['Bold','Journal']) discovery=observeFlow(discovery,full(1,{...choices,'ch1.tracks':tracks}));
discovery=observeFlow(discovery,full(1,{...choices,'ch1.gideon_reason':'Deflect'}));
const fixture=createStoryEnvelope({choices,currentChapter:1,progress:{0:progressFromSnapshot(zero),1:progressFromSnapshot(one)},snapshots:{0:zero,1:one},discovery},STORY_REGISTRY);
const origin=process.env.REVERSE_FALLS_TEST_URL || 'http://127.0.0.1:8780';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
let checks=0;
const contexts=[];
const reports=[];
async function newPage(seed=null,legacy=false){
 const context=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(context);
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 if(seed) await context.addInitScript(({seed,key,legacy})=>{
  if(sessionStorage.getItem('canon-test-seeded'))return;
  sessionStorage.setItem('canon-test-seeded','1');
  localStorage.setItem('reverse-falls-preferences',JSON.stringify({chapter:1,language:'russian',reducedMotion:true}));
  if(legacy){localStorage.setItem('reverse-falls-chapter0-save-v1',JSON.stringify(seed.snapshots[0]));localStorage.setItem('reverse-falls-chapter1-v3-save-v1',JSON.stringify(seed.snapshots[1]));localStorage.setItem('reverse-falls-flowchart-v1',JSON.stringify(seed.discovery));}
  else localStorage.setItem(key,JSON.stringify(seed));
 },{seed,key:STORY_KEY,legacy});
 await page.goto(origin);await page.waitForFunction(()=>window.game&&game.story.isInitialized());
 return {page,errors};
}
async function inspect(page,chapter,node){
 await page.evaluate(()=>game.openFlowchart());
 await page.locator('#flow-full').click();
 await page.locator('#flow-chapter'+chapter).click();
 await page.locator(`[data-node="${node}"]`).dispatchEvent('click');
}
try{
 // Genuine user commands through the app (not only standalone reducer tests).
 const chapterZero=await newPage();
 await chapterZero.page.evaluate(()=>game.startChapter(0,{language:'russian'}));
 const zeroRun=await chapterZero.page.evaluate(()=>{
  const now=performance.now.bind(performance);let extra=0;performance.now=()=>now()+(extra+=10000);
  let steps=0;const cities=['Hardware_Store','Telepathy_Tent','Arcade'];
  while(game.engine.state.phase!=='credits'&&steps++<2500){
   if(game.engine.state.phase==='choice')game.choose(1);
   else if(game.engine.state.phase==='map') { const names={Hardware_Store:'hardware_store',Telepathy_Tent:'telepathy_tent',Arcade:'arcade'};game.visitLocation(cities.find(city=>!game.engine.state.visited.includes(names[city]))||'Forest'); }
   else game.next();
  }
  const completed=game.story.getCanonSummary();game.startChapter(1,{language:'russian',monster:'Vampire'});
  return {phase:completed.progress[0].phase,creature:completed.importantChoices['ch0.creature'],carried:game.engine.state.flags.monster};
 });
 assert.equal(zeroRun.phase,'credits');assert.equal(zeroRun.creature,'Wendigo');assert.equal(zeroRun.carried,'Wendigo');
 assert.deepEqual(chapterZero.errors,[]);checks++;reports.push('Actual Chapter 0 play, town travel and canonical creature carryover remain intact');await chapterZero.page.close();
 const fresh=await newPage();
 await fresh.page.evaluate(()=>game.startChapter(1,{language:'russian',monster:'Vampire'}));
 const played=await fresh.page.evaluate(()=>{
  const now=performance.now.bind(performance);let extra=0;performance.now=()=>now()+(extra+=10000);
  const options=[2,2,0,2];let chosen=0,steps=0;
  while(game.engine.state.phase!=='credits'&&steps++<2000){
   if(game.engine.state.phase==='choice')game.choose(options[chosen++]);else game.next();
  }
  return {chosen,steps,phase:game.engine.state.phase,canon:game.story.getCanonSummary(),flags:game.engine.state.flags};
 });
 assert.equal(played.phase,'credits');assert.equal(played.chosen,4);assert.deepEqual(played.canon.importantChoices,choices);
 assert.equal(played.canon.relationships.pacifica_gideon,2);assert.equal(played.flags.pacifica_gideon_trust,2);assert.ok(played.canon.inventory.cloth_scrap);
 checks++;reports.push('Actual new game through all four choices, 400+ paragraphs, correct effects');
 await inspect(fresh.page,1,'cafe_vampire');
 assert.equal(await fresh.page.locator('#flow-alternative').isVisible(),true);
 checks++;reports.push('A creature scene discovered in Chapter 1 is actionable even when Chapter 0 was skipped');
 assert.deepEqual(fresh.errors,[]);await fresh.page.close();
 const {page,errors}=await newPage(fixture);
 const initial=await page.evaluate(()=>game.story.getCanon());
 await inspect(page,0,'werewolf');
 assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),initial);checks++;
 await page.locator('#flow-alternative').click();
 await page.waitForFunction(()=>game.alternative&&document.querySelector('#flowchart').hidden);
 assert.equal(await page.evaluate(()=>game.engine.state.flags.monster),'Werewolf');
 assert.equal(await page.evaluate(()=>game.story.getChoice('ch0.creature')),'Vampire');
 assert.equal(await page.locator('#alternative-indicator').isVisible(),true);
 await page.evaluate(()=>game.save());
 assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),initial);
 await page.locator('#alternative-exit').click();
 assert.equal(await page.evaluate(()=>game.alternative),null);
 assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),initial);checks++;reports.push('Node click/alternative/save/exit preserve canonical timeline');
 await page.reload();await page.waitForFunction(()=>window.game&&game.story.isInitialized());
 assert.equal(await page.evaluate(()=>game.alternative),null);assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),initial);checks++;
 await inspect(page,0,'wendigo');await page.locator('#flow-rewrite').click();
 await page.locator('#flow-confirm-cancel').click();
 assert.equal(await page.evaluate(()=>game.story.getChoice('ch0.creature')),'Vampire');checks++;
 await page.locator('#flow-rewrite').click();await page.locator('#flow-confirm-accept').click();
 await page.waitForFunction(()=>game.story.getChoice('ch0.creature')==='Wendigo');
 const rewritten=await page.evaluate(()=>({summary:game.story.getCanonSummary(),snap:game.story.getState().snapshots,valid:game.story.validate().valid}));
 assert.equal(rewritten.valid,true);assert.deepEqual(rewritten.summary.importantChoices,{...choices,'ch0.creature':'Wendigo'});
 assert.equal(rewritten.snap[0].flags.monster,'Wendigo');assert.equal(rewritten.snap[1].flags.monster,'Wendigo');
 assert.deepEqual(rewritten.snap[1].presentation,one.presentation);
 checks++;reports.push('Confirmed creature rewrite replays both chapters, preserves independent choices and presentation');
 await inspect(page,1,'tracks_journal');await page.locator('#flow-rewrite').click();await page.locator('#flow-confirm-accept').click();
 await page.waitForFunction(()=>game.story.getChoice('ch1.tracks')==='Journal');
 assert.equal(await page.evaluate(()=>game.story.hasItem('cloth_scrap')),false);
 assert.equal(await page.evaluate(()=>game.story.getRelationship('pacifica_gideon')),2);
 assert.equal(await page.evaluate(()=>game.story.getChoice('ch1.ending')),'Observation');checks++;
 await page.reload();await page.waitForFunction(()=>window.game&&game.story.isInitialized());
 assert.equal(await page.evaluate(()=>game.story.getChoice('ch0.creature')),'Wendigo');assert.equal(await page.evaluate(()=>game.story.hasItem('cloth_scrap')),false);
 checks++;reports.push('Clue rewrite removes only sourced item and survives browser reload');
 const beforeAlternative=await page.evaluate(()=>game.story.getCanon());
 await inspect(page,1,'reason_deflect');await page.locator('#flow-alternative').click();
 await page.waitForFunction(()=>game.alternative&&document.querySelector('#flowchart').hidden);
 const alternateResult=await page.evaluate(()=>{
  const now=performance.now.bind(performance);let extra=0;performance.now=()=>now()+(extra+=10000);
  const options=[2,1,0];let chosen=0,steps=0;
  while(game.engine.state.phase!=='credits'&&steps++<1800){if(game.engine.state.phase==='choice')game.choose(options[chosen++]);else game.next();}
  return {phase:game.engine.state.phase,choices:game.alternative.canon.choices,inventory:game.engine.state.inventory,trust:game.engine.state.flags.pacifica_gideon_trust};
 });
 assert.equal(alternateResult.phase,'credits');assert.ok(alternateResult.inventory.includes('cloth_scrap'));assert.equal(alternateResult.trust,0);
 assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),beforeAlternative);
 await page.locator('#alternative-exit').click();await page.reload();await page.waitForFunction(()=>window.game&&game.story.isInitialized());
 assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),beforeAlternative);
 assert.equal(await page.evaluate(()=>game.story.hasItem('cloth_scrap')),false);assert.equal(await page.evaluate(()=>game.story.getRelationship('pacifica_gideon')),2);
 checks++;reports.push('Full alternative reaches its own clue/relationship/ending; exit+reload cannot leak any effect');
 // Exiting through a menu must detach the abandoned alternative engine as well.
 await inspect(page,1,'tracks_search');await page.locator('#flow-alternative').click();
 await page.waitForFunction(()=>game.alternative&&document.querySelector('#flowchart').hidden);
 await page.evaluate(()=>{game.showMenu();game.save();});
 assert.equal(await page.evaluate(()=>game.alternative),null);assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),beforeAlternative);
 checks++;reports.push('Menu exit followed by Save cannot publish an abandoned alternative engine');
 // Cancelled new-game confirmation is another early-exit path.
 await inspect(page,0,'werewolf');await page.locator('#flow-alternative').click();
 await page.waitForFunction(()=>game.alternative&&document.querySelector('#flowchart').hidden);
 page.once('dialog',dialog=>dialog.dismiss());await page.evaluate(()=>game.startChapter(0));
 await page.evaluate(()=>game.save());assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),beforeAlternative);checks++;
 // A rejected durable write must leave both canon and the current official cursor valid.
 await inspect(page,0,'vampire');await page.locator('#flow-rewrite').click();
 const beforeFailure=await page.evaluate(()=>game.story.getCanon());const expectedErrorStart=errors.length;
 await page.evaluate(()=>{window.__originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('reverse-falls-canon-story-v1'))throw new DOMException('Quota test','QuotaExceededError');return window.__originalStorageSet.call(this,key,value);};});
 await page.locator('#flow-confirm-accept').click();await page.waitForFunction(()=>document.querySelector('#flow-confirm-error').textContent.length>0);
 assert.deepEqual(await page.evaluate(()=>game.story.getCanon()),beforeFailure);
 await page.evaluate(()=>{Storage.prototype.setItem=window.__originalStorageSet;delete window.__originalStorageSet;});
 await page.locator('#flow-confirm-cancel').click();
 const expectedErrors=errors.splice(expectedErrorStart);assert.ok(expectedErrors.length>0);assert.ok(expectedErrors.every(message=>message.startsWith('Story operation failed:')));
 checks++;reports.push('Actual browser quota failure rejects rewrite with a visible error and intact canon');
 await page.evaluate(()=>game.openFlowchart());await page.locator('#flow-full').click();await page.locator('#flow-chapter1').click();
 await page.screenshot({path:'/workspace/scratch/canon-game-map.png'});
 assert.deepEqual(errors,[]);
 const legacy=await newPage(fixture,true);
 assert.deepEqual(await legacy.page.evaluate(()=>game.story.getCanonSummary().importantChoices),choices);
 assert.equal(await legacy.page.evaluate(()=>game.story.getState().snapshots[1].phase),'credits');
 assert.ok(await legacy.page.evaluate(()=>game.story.getState().metadata.legacyArchive.chapter0));
 await legacy.page.reload();await legacy.page.waitForFunction(()=>window.game&&game.story.isInitialized());
 assert.deepEqual(await legacy.page.evaluate(()=>game.story.getCanonSummary().importantChoices),choices);assert.deepEqual(legacy.errors,[]);
 checks++;reports.push('Legacy chapter saves migrate once without losing cursor or original recovery archive');
 console.log(JSON.stringify({checks,reports,errors:[]},null,2));
}finally{for(const context of contexts)await context.close();await browser.close();}
