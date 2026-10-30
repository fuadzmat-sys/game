import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {StoryEngine,parseLine} from '../engine.js';
const dataPath = new URL('../assets/scripts.json',import.meta.url);
const scripts=JSON.parse(fs.readFileSync(dataPath,'utf8'));
const coveredResources=new Set();
function record(events,event) {events.push(event);if(event.type==='script')coveredResources.add(event.resource);}
function until(engine,target,max=3000) {
  let n=0;
  while(engine.state.phase!==target&&n++<max) {
    assert.ok(['dialogue','pause'].includes(engine.state.phase),`Unexpected ${engine.state.phase} looking for ${target}`);
    engine.advance();
  }
  assert.equal(engine.state.phase,target);
  return n;
}
test('parses inline waits and preserves original rich text',()=>{
 const line=parseLine('[Pacifica]Hi [wait 0.3]<color=#4ca9cf>there</color>![Char Pacifica change smile] // note');
 assert.equal(line.text,'Hi <color=#4ca9cf>there</color>! ');
 assert.deepEqual(line.segments.filter(x=>x.type==='command').map(x=>[x.args[0],x.at]),[['Pacifica',0],['wait',3],['Char',9]]);
});
test('typed investigation flags add trust and survive restore without changing their types', () => {
 const source = { 'test/start': '[flag set extra_clue_01 true]\n[flag set careful_route false]\n[flag set pacifica_gideon_trust 0]\n[flag add pacifica_gideon_trust 1]\n[Narrator]\nFirst. [flag add pacifica_gideon_trust 1]\nSecond.' };
 const engine = new StoryEngine({ scripts: source }); engine.start('test/start');
 assert.equal(engine.state.flags.extra_clue_01, true);
 assert.equal(engine.state.flags.careful_route, false);
 assert.equal(engine.state.flags.pacifica_gideon_trust, 1);
 const copy = new StoryEngine({ scripts: source }); copy.restore(engine.snapshot()); copy.reveal(Infinity);
 assert.equal(copy.state.flags.pacifica_gideon_trust, 2);
 assert.equal(engine.state.flags.pacifica_gideon_trust, 1);
 copy.advance(); assert.equal(copy.state.flags.pacifica_gideon_trust, 2);
});
test('collected clues are unique and a restored pending clue command runs only on reveal', () => {
 const source = { 'test/start': '[Narrator]\nCloth. [item give cloth_scrap][item give cloth_scrap]\nNext.' };
 const engine = new StoryEngine({ scripts: source }); engine.start('test/start');
 const copy = new StoryEngine({ scripts: source }); copy.restore(engine.snapshot());
 assert.deepEqual(copy.state.inventory, []); copy.reveal(Infinity);
 assert.deepEqual(copy.state.inventory, ['cloth_scrap']);
 copy.advance(); assert.deepEqual(copy.state.inventory, ['cloth_scrap']);
 assert.deepEqual(engine.state.inventory, []);
});
test('the observer glow is persistent, clears explicitly and cannot execute unknown effect names', () => {
 const source = { 'test/start': '[effect blue_glow]\n[Narrator]\nA spark.\n[effect unknown]\nA second.\n[effect clear]\nDarkness.' };
 const engine = new StoryEngine({ scripts: source }); const first = engine.start('test/start');
 assert.equal(engine.state.visualEffect, 'blue_glow');
 assert.ok(first.events.some(event => event.type === 'effect' && event.name === 'blue_glow'));
 const copy = new StoryEngine({ scripts: source }); copy.restore(engine.snapshot()); copy.advance();
 assert.equal(copy.state.visualEffect, 'blue_glow'); copy.advance();
 assert.equal(copy.state.visualEffect, null);
});
const languages=['english','french','german','polish','russian','spanish','ukrainian'];
for(const language of languages) for(const [index,monster] of ['Werewolf','Wendigo','Vampire'].entries()) {
 const resultingMonster=language==='french'?'Vampire':monster;
 const sourceDefect=language==='french'&&monster!=='Vampire'?' (original French Vampire flag defect)':'';
 test(`original ${language} ${monster} choice reaches credits through all free-time locations${sourceDefect}`,t=>{
  const events=[],engine=new StoryEngine({scripts,language,onEvent:event=>record(events,event)});let stops=0;
  engine.start();stops+=until(engine,'choice');
  assert.equal(engine.state.choices.length,3);
  if(language==='english') assert.match(engine.state.choices[index].text,new RegExp(monster));
  engine.choose(index);stops+=until(engine,'map');
  assert.equal(engine.state.flags.monster,resultingMonster);
  assert.equal(engine.state.bg,'Town');
  const locations={Arcade:'arcade',Hardware_Store:'hardware_store',Telepathy_Tent:'telepathy_tent'};
  for(const [location,folder] of Object.entries(locations)) {
   engine.visit(location,{script:`chapter_0/part_2_freetime/${folder}/first`});stops+=until(engine,'map');
   assert.equal(engine.state.location,location);
  }
  engine.visit('Forest',{script:'chapter_0/part_3_mothman/mothman_1',background:'forest_1_dusk',final:true});
  stops+=until(engine,'credits');
  assert.ok(stops>350,`Expected substantial original story, got ${stops} stops`);
  assert.match(engine.state.script,/mothman_3$/);
  const paths=[...new Set(events.filter(event=>event.type==='script').map(event=>event.path))];
  const expected=[
   'chapter_0/part_1_intro/intro_1',`chapter_0/part_1_intro/intro_2_${monster.toLowerCase()}`,
   'chapter_0/part_1_intro/intro_3_gideon',...Object.values(locations).map(folder=>`chapter_0/part_2_freetime/${folder}/first`),
   'chapter_0/part_3_mothman/mothman_1',`chapter_0/part_3_mothman/mothman_2_${resultingMonster.toLowerCase()}`,'chapter_0/part_3_mothman/mothman_3'
  ];
  assert.deepEqual(paths,expected);
  const dialoguePaths=new Set(engine.state.history.map(line=>line.script));
  for(const path of expected) assert.ok(dialoguePaths.has(path),`No dialogue executed in ${language}/${path}`);
  for(const other of ['werewolf','wendigo','vampire'].filter(value=>value!==resultingMonster.toLowerCase())) {
   assert.ok(!paths.some(path=>path.endsWith(`/mothman_2_${other}`)),`Wrong Monster branch ${other} executed`);
  }
  assert.equal(engine.state.flags.monster,resultingMonster);
  assert.equal(engine.state.visited.length,4);
  assert.equal(events.filter(event=>event.type==='map').length,4);
  assert.equal(events.filter(event=>event.type==='credits').length,1);
  t.diagnostic(JSON.stringify({language,monster,resultingMonster,scripts:paths.length,dialogueLines:engine.state.history.length,commands:events.filter(event=>event.type==='command').length,mapReturns:4,credits:1}));
 });
}
test('the two French intro branches really contain the original Vampire flag defect',()=>{
 const prefix='textes/french/chapter_0/part_1_intro/intro_2_';
 assert.equal(scripts[prefix+'werewolf'],scripts[prefix+'vampire']);
 assert.equal(scripts[prefix+'wendigo'],scripts[prefix+'vampire']);
 assert.match(scripts[prefix+'werewolf'],/\[Choice Monster Vampire\]/);
});
for(const monster of ['werewolf','wendigo']) test(`original French unreachable ${monster} Mothman text executes to credits`,t=>{
 const events=[],engine=new StoryEngine({scripts,language:'french',onEvent:event=>record(events,event)});
 engine.start(`chapter_0/part_3_mothman/mothman_2_${monster}`);until(engine,'credits');
 assert.ok(engine.state.history.some(line=>line.script.endsWith(`/mothman_2_${monster}`)));
 assert.ok(engine.state.history.some(line=>line.script.endsWith('/mothman_3')));
 t.diagnostic(JSON.stringify({supplemental:true,language:'french',monster,dialogueLines:engine.state.history.length,commands:events.filter(event=>event.type==='command').length,credits:1}));
});
test('inline expressions apply when reached, and saves retain pending inline commands',()=>{
 const engine=new StoryEngine({scripts:{'chapter':'[char show Pacifica]\n[Pacifica]\nHello[char Pacifica change scared] world'}});
 engine.start('chapter');assert.equal(engine.state.chars.pacifica.expression,'idle');
 engine.reveal(4);assert.equal(engine.state.chars.pacifica.expression,'idle');
 const save=engine.snapshot(),restored=new StoryEngine({scripts:engine.scripts});restored.restore(save);
 assert.equal(restored.state.chars.pacifica.expression,'idle');restored.reveal(5);
 assert.equal(restored.state.chars.pacifica.expression,'scared');assert.equal(restored.state.text,'Hello world');
 assert.throws(()=>restored.restore({...save,line:1000}),/outside/);
});
test('next is queued until the current script ends; character aliases do not invent targets',()=>{
 const engine=new StoryEngine({scripts:{a:'[char show Gideon]\n[Char Gideon upset]\n[next b]\nOne',b:'Two'}});
 engine.start('a');assert.equal(engine.state.text,'One');assert.equal(engine.state.chars.gideon.expression,'idle');
 assert.equal(engine.state.chars.upset,undefined);engine.advance();assert.equal(engine.state.text,'Two');
});

test('automatic character slots recenter when one of a pair leaves',()=>{
 const engine=new StoryEngine({scripts:{a:'[char showi Ducktective Mallardarty]\nFirst\n[char hide Mallardarty]\nSecond'}});
 engine.start('a');assert.equal(engine.state.chars.ducktective.position,'left');assert.equal(engine.state.chars.mallardarty.position,'right');
 engine.advance();assert.equal(engine.state.chars.ducktective.position,'center');assert.equal(engine.state.chars.ducktective.x,0);assert.equal(engine.state.chars.mallardarty.visible,false);
});

test('campaign flags are copied and normalized before initial branch dispatch, and a fresh start clears them',()=>{
 const scripts={
  entry:'[Choice check Monster Vampire next vampire]\n[Choice check Monster Werewolf next werewolf]',
  vampire:'[Narrator]\nThe mirror remembers yesterday.',
  werewolf:'[Narrator]\nThe forest remembers yesterday.'
 };
 const engine=new StoryEngine({scripts});
 const carried={Monster:'Vampire',Details:{source:'chapter-zero'}};
 engine.start('entry',{flags:carried});
 assert.equal(engine.state.script,'vampire');
 assert.equal(engine.state.text,'The mirror remembers yesterday.');
 assert.equal(engine.state.flags.monster,'Vampire');
 assert.equal(engine.state.flags.Monster,undefined);
 carried.Monster='Werewolf';carried.Details.source='changed externally';
 assert.equal(engine.state.flags.monster,'Vampire');
 assert.equal(engine.state.flags.details.source,'chapter-zero');
 engine.start('entry',{flags:{Monster:'Werewolf'}});
 assert.equal(engine.state.script,'werewolf');
 assert.equal(engine.state.flags.details,undefined);
 engine.start('entry');
 assert.deepEqual(engine.state.flags,{});
 assert.equal(engine.state.phase,'map');
});

test('explicit emotion commands persist across saves without changing the selected expression or flags',()=>{
 const scripts={chapter:'[char showi Pacifica Gideon]\n[char Pacifica change angry]\n[emotion Pacifica laugh]\n[emotion Gideon panic]\n[Choice Monster Werewolf]\n[Pacifica]\nWe are alive.\n[emotion Pacifica sly]\n[emotion Gideon embarrassed]\n[Gideon]\nI suppose.'};
 const engine=new StoryEngine({scripts});
 const result=engine.start('chapter');
 assert.equal(engine.state.chars.pacifica.emotion,'laugh');
 assert.equal(engine.state.chars.pacifica.expression,'angry');
 assert.equal(engine.state.chars.gideon.emotion,'panic');
 assert.equal(engine.state.flags.monster,'Werewolf');
 const event=result.events.find(event=>event.type==='character'&&event.actions.emotion==='laugh');
 assert.equal(event.instant,true);assert.equal(event.characters.pacifica.emotion,'laugh');
 assert.notEqual(event.characters.pacifica,engine.state.chars.pacifica);
 const saved=engine.snapshot(),restored=new StoryEngine({scripts});restored.restore(saved);
 assert.equal(restored.state.chars.gideon.emotion,'panic');
 restored.advance();
 assert.equal(restored.state.chars.pacifica.emotion,'sly');
 assert.equal(restored.state.chars.gideon.emotion,'embarrassed');
 assert.equal(saved.chars.gideon.emotion,'panic','Advancing a restored engine must not mutate the saved emotion');
 restored.start('chapter');assert.equal(restored.state.chars.pacifica.emotion,'laugh');
});

test('inline emotions and sound cues wait for reveal and survive a pending-command save',()=>{
 const scripts={chapter:'[char showi Gideon]\n[Gideon]\nOh![emotion Gideon tremble][sfx glass_break] Run!'};
 const engine=new StoryEngine({scripts});engine.start('chapter');
 assert.equal(engine.state.chars.gideon.emotion,undefined);
 engine.reveal(2);assert.equal(engine.state.chars.gideon.emotion,undefined);
 const restored=new StoryEngine({scripts});restored.restore(engine.snapshot());
 const revealed=restored.reveal(3);
 assert.equal(restored.state.chars.gideon.emotion,'tremble');
 assert.deepEqual(revealed.events.filter(event=>event.type==='sfx').map(event=>event.name),['glass_break']);
 assert.equal(restored.state.phase,'dialogue');
 assert.equal(restored.state.text,'Oh! Run!');
 assert.equal(restored.reveal(Infinity).events.filter(event=>event.type==='sfx').length,0,'The same cue must not replay on later reveals');
});

test('unsupported emotions and unknown targets are ignored and empty sound cues do not fire',()=>{
 const scripts={chapter:'[char showi Pacifica]\n[emotion Pacifica afraid]\n[emotion Pacifica missing]\n[emotion Unknown panic]\n[sfx]\n[emotion Pacifica neutral]\nDone'};
 const engine=new StoryEngine({scripts});const result=engine.start('chapter');
 assert.equal(engine.state.chars.pacifica.emotion,'neutral');
 assert.equal(engine.state.chars.unknown,undefined);
 assert.equal(result.events.filter(event=>event.type==='sfx').length,0);
 assert.deepEqual(result.events.filter(event=>event.type==='character'&&event.actions.emotion).map(event=>event.actions.emotion),['afraid','neutral']);
});

test('traversals cover all 91 playable localized script resources',()=>{
 const expected=Object.keys(scripts).filter(path=>path.includes('/chapter_0/')&&!path.endsWith('_plzproveread'));
 assert.equal(expected.length,91);
 assert.deepEqual([...coveredResources].filter(path=>path.includes('/chapter_0/')).sort(),expected.sort());
});

test('conditional paragraphs never execute their text or commands when a carried choice differs',()=>{
 const conditional={'textes/russian/test/guard':'[when monster Vampire][flag set wrong true][Pacifica]Неверная версия.\n[when monster Wendigo][Gideon]Верная версия.\n[Narrator]\nПродолжение.\n[scene credits]'};
 const engine=new StoryEngine({scripts:conditional,language:'russian'});engine.start('test/guard',{flags:{monster:'Wendigo'}});
 assert.equal(engine.state.text,'Верная версия.');assert.equal(engine.state.flags.wrong,undefined);
 engine.advance();assert.equal(engine.state.text,'Продолжение.');assert.equal(engine.state.history.length,2);
});
test('chapter carryover inventory is copied before the first authored paragraph',()=>{
 const inventory=['journal_3','cloth_scrap','journal_3'];const engine=new StoryEngine({scripts:{'textes/english/test/start':'[Narrator]\nA new morning.'}});
 engine.start('test/start',{inventory});inventory.push('unrelated');assert.deepEqual(engine.state.inventory,['journal_3','cloth_scrap']);
});
test('authored music attenuation survives a snapshot and resets on the next normal music cue',()=>{
 const engine=new StoryEngine({scripts:{'textes/english/test/start':'[music conversation_1 volume .3 fade .5]\n[Narrator]\nA quiet question.\n[music forest_day_1]\nA forest path.'}});
 const first=engine.start('test/start');assert.equal(engine.state.musicGain,.3);assert.equal(first.events.find(event=>event.type==='audio').gain,.3);
 const saved=engine.snapshot();engine.advance();assert.equal(engine.state.musicGain,1);engine.restore(saved);assert.equal(engine.state.musicGain,.3);
});
