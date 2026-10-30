import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createStoryEnvelope, STORY_KEY } from '../story-state.js';
import { STORY_REGISTRY, replayCanonicalSnapshot, progressFromSnapshot } from '../story-bridge.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const scripts=Object.assign({},...['scripts','chapter1-scripts','chapter2-scripts','chapter3-scripts'].map(n=>read('assets/'+n+'.json')));
const supplied=read('выборы.json');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],reports=[];
try {
const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('reverse-falls-preferences',JSON.stringify({language:'english'})));
await page.goto('http://127.0.0.1:8780');await page.waitForFunction(()=>window.game?.story.isInitialized());
assert.equal(await page.evaluate(()=>game.preferences.language),'russian');
assert.equal(await page.locator('#language-select,[id$="-language"]').count(),0);
assert.equal(await page.locator('html').getAttribute('lang'),'ru');
await page.screenshot({path:'/workspace/work/screenshots/russian-menu.png'});
await page.evaluate(()=>game.openChapters());
assert.ok(!(await page.locator('#chapter-picker').innerText()).includes('English'));
await page.waitForTimeout(1200); await page.screenshot({path:'/workspace/work/screenshots/russian-chapters.png'}); await page.locator('#chapter-picker-close').click();
const overflow=await page.evaluate(async()=>{
const {BitmapText}=await import('./bitmap-font.js'),{parseLine}=await import('./engine.js');
const d=window.REVERSE_FALLS_DATA,font=new BitmapText(d.config.fonts,d.manifest);await font.load();const failures=[];
for(const [path,source] of Object.entries(d.scripts))if(path.startsWith('textes/russian/'))for(const [line,row] of source.split(/\r\n|\r|\n/).entries()){
if(path.includes('/lists/'))continue;const text=parseLine(row).text;if(!text.trim())continue;
const layout=font.layout(text,{font:'AccentsRobotoMediumC',extendedGlyphs:true,size:124*.7,maxWidth:2276});if(layout.height+6>466)failures.push({path,line,height:layout.height+6,text:text.slice(0,80)});
}return failures;});
console.log('Russian paragraph overflow:',JSON.stringify(overflow));
// Import English checkpoints through the real portable-save UI, then load in Russian.
for(const [chapter,scene] of [[0,'chapter_0/part_1_intro/intro_1'],[1,'chapter_1_v3/cafe'],[2,'chapter_2/start'],[3,'chapter_3/first_talk']]){
 const choices={...supplied.canon.choices};if(chapter===3)choices['ch3.wendy_approach']='Bargain';
 const canon=createStoryEnvelope({choices,currentChapter:chapter,progress:{[chapter]:{sceneId:scene,line:1,phase:'dialogue',language:'english',completed:false}}},STORY_REGISTRY).canon;
 const snap=replayCanonicalSnapshot(chapter,canon,null,{scripts,language:'english'});
 const envelope={ format: 'reverse-falls-canon-save', gameVersion: '4.1.0', exportedAt: new Date().toISOString(), ...createStoryEnvelope({choices,currentChapter:chapter,progress:{[chapter]:progressFromSnapshot(snap)},snapshots:{[chapter]:snap}},STORY_REGISTRY) };
 console.log('Import chapter',chapter, await page.evaluate(e=>{try{game.story.previewImport(JSON.stringify(e));return 'valid'}catch(err){return {message:err.message,details:err.details}}},envelope));
 await page.evaluate(()=>game.openFlowchart());
 const chooser=page.waitForEvent('filechooser');await page.locator('#flow-import-save').click();await(await chooser).setFiles({name:'legacy-en.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(envelope))});
 await page.waitForFunction(()=>!document.querySelector('#flow-import-confirm').hidden, null, {timeout:5000});await page.locator('#flow-import-confirm-accept').click();await page.waitForFunction(()=>document.querySelector('#flow-import-confirm').hidden);
 await page.evaluate(ch=>game.load(ch),chapter);
 assert.equal(await page.evaluate(()=>game.engine.language),'russian');assert.equal(await page.evaluate(()=>game.preferences.language),'russian');
 assert.ok(/[А-Яа-яЁё]/.test(await page.evaluate(()=>game.engine.state.text)));
 assert.ok(!(await page.locator('body').innerText()).includes('undefined'));
 assert.deepEqual(await page.evaluate(()=>game.story.getCanon().choices),envelope.canon.choices);
 await page.evaluate(()=>game.save());await page.reload();await page.waitForFunction(()=>window.game?.story.isInitialized());await page.evaluate(ch=>game.load(ch),chapter);assert.equal(await page.evaluate(()=>game.engine.language),'russian');
 reports.push(`Chapter ${chapter}: English portable save imports, resumes in Russian and reloads without changing choices`);
}
assert.deepEqual(errors,[]);console.log(JSON.stringify({reports,overflow,errors},null,2));
}finally{await browser.close()}
