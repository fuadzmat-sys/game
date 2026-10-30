import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createChapterAudio, chapter2VoiceKey, dialogueVoiceAllowed, voiceLineKey } from '../chapter-audio.js';
import { StoryEngine } from '../engine.js';
function environment(){
 const clips=[],spoken=[];
 class Audio{constructor(path){this.path=path;this.volume=1;this.playCount=0;this.pauseCount=0;this.currentTime=0;clips.push(this);}play(){this.playCount++;return Promise.resolve();}pause(){this.pauseCount++;}}
 return {clips,spoken,environment:{Audio,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{speak(u){spoken.push(u);},cancel(){},getVoices(){return[];}}}};
}
const context={chapter:2,script:'chapter_2/hidden_shelter',sourceLine:91,language:'russian',speaker:'Creature'};
test('Chapter 2 cannot fall back to a chapter-zero recording or browser speech',()=>{
 const mock=environment(),text='Живы.';
 const audio=createChapterAudio({environment:mock.environment,voices:{[voiceLineKey(text,'Creature','russian')]:{path:'old.mp3'}},getVoiceContext:()=>context});
 audio.setSpeechEnabled(true);
 assert.equal(dialogueVoiceAllowed(context),false);assert.equal(audio.speechMode(context),'pending');
 assert.equal(audio.speak({text,speaker:'Creature',language:'russian'}),false);
 assert.equal(mock.clips.length,0);assert.equal(mock.spoken.length,0);
 for(const chapter of [2,'chapter2','chapter_2'])assert.equal(dialogueVoiceAllowed({chapter}),false);
 for(const script of ['chapter_2/start','Textes/Russian/Chapter_2/Symbol'])assert.equal(dialogueVoiceAllowed({script}),false);
});
test('only an exact ready Chapter 2 context slot plays; missing and failed slots stay silent',()=>{
 const mock=environment(),key=chapter2VoiceKey(context);
 const audio=createChapterAudio({environment:mock.environment,getVoiceContext:()=>context,chapter2Audio:{voices:{lines:{[key]:{path:'new.mp3',status:'ready'}}}}});
 audio.setSpeechEnabled(true);assert.equal(audio.speechMode(context),'recorded');
 assert.equal(audio.speak({text:'Живы.',speaker:'Creature',language:'russian'}),true);
 assert.equal(mock.clips[0].path,'new.mp3');mock.clips[0].onerror();assert.equal(mock.spoken.length,0);assert.equal(audio.isSpeaking,false);
 for(const mismatch of [{sourceLine:92},{speaker:'Mimic'},{language:'english'},{script:'chapter_2/rock_hollow'}])assert.equal(audio.speak({text:'Живы.',speaker:'Creature',language:'russian',...mismatch}),false);
 assert.equal(mock.clips.length,1);
 assert.equal(audio.speechMode({...context,chapter:1}),'pending');
 assert.equal(audio.speak({text:'Живы.',speaker:'Creature',language:'russian',chapter:1}),false);
});
test('pending context slots never masquerade as usable recorded voices',()=>{
 const mock=environment();
 const audio=createChapterAudio({environment:mock.environment,getVoiceContext:()=>context,chapter2Audio:{voices:{lines:{[chapter2VoiceKey(context)]:{path:'not-created.mp3',status:'pending'}}}}});
 audio.setSpeechEnabled(true);assert.equal(audio.speechMode(),'pending');assert.equal(audio.speak({text:'Тихо.'}),false);assert.equal(mock.clips.length,0);
 assert.equal(chapter2VoiceKey({...context,script:'chapter_1_v3/start'}),null);assert.equal(chapter2VoiceKey({...context,sourceLine:0}),null);
});
test('local environmental effects bound overlap, replace repeats and stop across scene changes',()=>{
 const mock=environment();let level=.35;
 const effects=Object.fromEntries(['ch2_cup','ch2_valve','ch2_water_rush'].map(name=>[name,{path:`${name}.wav`}]));
 const audio=createChapterAudio({environment:mock.environment,getVolume:()=>level,chapter2Audio:{effects}});
 assert.equal(audio.effect('ch2_cup'),true);assert.equal(audio.effect('ch2_cup'),true);assert.equal(mock.clips[0].pauseCount,1);
 audio.effect('ch2_valve');audio.effect('ch2_water_rush');assert.equal(mock.clips[1].pauseCount,1);
 level=.2;audio.updateVolume();assert.equal(mock.clips[3].volume,.2);audio.stopEffects();assert.equal(mock.clips[2].pauseCount,1);assert.equal(mock.clips[3].pauseCount,1);
 level=0;assert.equal(audio.effect('ch2_cup'),false);assert.equal(audio.effect('unregistered_cue'),false);
});
test('all seven environmental Foley assets are nonempty valid PCM with recorded hashes',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../assets/chapter2-audio.json',import.meta.url),'utf8'));
 for(const name of ['ch2_cup','ch2_wood_creak','ch2_stream','ch2_tunnel_drips','ch2_metal_grate','ch2_valve','ch2_water_rush']){
  const descriptor=manifest.effects[name],bytes=fs.readFileSync(new URL('../'+descriptor.path,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.ok(bytes.length>1000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),descriptor.sha256);
  assert.equal(bytes.readUInt32LE(24),24000);assert.equal(bytes.readUInt16LE(22),1);assert.ok(descriptor.duration>0);
  assert.ok(bytes.subarray(44).some(byte=>byte!==0));
 }
 assert.ok(Object.values(manifest.ambience).every(record=>record.loop===true));
});

test('Russian spoken lures are not played over English dialogue and never fall back to browser speech',()=>{
 const mock=environment();let language='english';
 const audio=createChapterAudio({environment:mock.environment,getVoiceContext:()=>({chapter:2,language}),chapter2Audio:{effects:{ch2_mimic_pacifica:{path:'russian.mp3',language:'russian'}}}});
 assert.equal(audio.effect('ch2_mimic_pacifica'),false);assert.equal(mock.clips.length,0);
 language='russian';assert.equal(audio.effect('ch2_mimic_pacifica'),true);assert.equal(mock.clips[0].path,'russian.mp3');assert.equal(mock.spoken.length,0);
});

test('shipped spoken lures retain script words, original waveforms, hashes and honest draft provenance',()=>{
 const readJSON=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 const manifest=readJSON('assets/chapter2-audio.json'),provenance=readJSON('assets/chapter2/audio/mimic-voice-provenance.json');
 const scripts=readJSON('assets/chapter2-scripts.json'),plan=readJSON('assets/chapter2-voice-plan.json');
 const expected={ch2_mimic_buster:['hidden_shelter','Бастер... Бастер, домой...'],ch2_mimic_pacifica:['real_picture','Гидеон? Гидеон, иди сюда.'],ch2_mimic_gideon:['water_climax','Я рядом.'],ch2_mimic_pacifica_here:['real_threat','Я здесь.']};
 assert.equal(provenance.approved,false);assert.equal(manifest.voices.mode,'recorded_only');assert.equal(manifest.voices.status,'pending');
 assert.deepEqual(Object.keys(manifest.voices.lines),[]);
 assert.deepEqual(provenance.cues.map(cue=>cue.id).sort(),Object.keys(expected).sort());
 for(const [id,[resource,text]]of Object.entries(expected)){
  const effect=manifest.effects[id],cue=manifest.voiceCues[id],source=provenance.cues.find(item=>item.id===id);
  assert.equal(effect.text,text);assert.equal(source.scriptText,text);assert.equal(cue.approved,false);assert.equal(source.approved,false);
  assert.equal(effect.status,'generated_draft');assert.equal(source.status,'generated_draft');assert.equal(cue.language,'russian');
  assert.equal(cue.path,effect.path);assert.equal(cue.sha256,effect.sha256);assert.equal(source.mp3Sha256,effect.sha256);
  const script=scripts[`textes/russian/chapter_2/${resource}`];
  const spokenWords=value=>value.replace(/\[[^\]]*\]/g,' ').match(/[\p{L}\p{N}]+/gu)?.join(' ').toLowerCase()||'';
  const mimicText=plan.lines.filter(slot=>slot.script===`chapter_2/${resource}`&&slot.language==='russian'&&slot.speaker==='Mimic').map(slot=>slot.text).join(' ');
  assert.ok(script.includes(`[sfx ${id}]`),`${id} must play in its intended scene`);assert.ok(spokenWords(mimicText).includes(spokenWords(text)),`${id} must match the authored spoken words across its split dialogue rows`);
  const encoded=fs.readFileSync(new URL('../'+effect.path,import.meta.url));
  assert.equal(createHash('sha256').update(encoded).digest('hex'),effect.sha256);
  const waveform=fs.readFileSync(new URL('../assets/chapter2/audio/'+source.wav,import.meta.url));
  assert.equal(createHash('sha256').update(waveform).digest('hex'),source.wavSha256);
  assert.equal(waveform.toString('ascii',0,4),'RIFF');assert.equal(waveform.toString('ascii',8,12),'WAVE');
  let format=null,samples=null;
  for(let offset=12;offset+8<=waveform.length;){
   const length=waveform.readUInt32LE(offset+4),type=waveform.toString('ascii',offset,offset+4),data=offset+8;
   assert.ok(data+length<=waveform.length);
   if(type==='fmt ')format={type:waveform.readUInt16LE(data),channels:waveform.readUInt16LE(data+2),rate:waveform.readUInt32LE(data+4),bits:waveform.readUInt16LE(data+14)};
   if(type==='data')samples=waveform.subarray(data,data+length);
   offset=data+length+(length%2);
  }
  assert.deepEqual(format,{type:3,channels:1,rate:24000,bits:32});assert.ok(samples?.length>0);
  assert.equal(samples.length/4/format.rate,effect.duration);
  let peak=0;for(let i=0;i<samples.length;i+=4){const value=samples.readFloatLE(i);assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));}
  assert.ok(peak>.01&&peak<1,`${id} must be audible and unclipped`);
 }
 assert.equal(manifest.voiceCues.ch2_mimic_pacifica.asrExactNormalizedWords,false,'proper-name pronunciation remains explicitly unapproved');
});

test('every pending recording slot matches real interpreter dialogue contexts across both languages and all creature variants',()=>{
 const readJSON=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 const plan=readJSON('assets/chapter2-voice-plan.json'),scripts=readJSON('assets/chapter2-scripts.json');
 const slots=new Map(plan.lines.map(slot=>[slot.key,slot]));
 assert.equal(slots.size,plan.lines.length,'recording slots cannot collide');
 const characters={...readJSON('assets/config.json').characters,...readJSON('assets/chapter1-art.json').characters,
  Creature:{name:'Creature'},Predator:{name:'Predator'},Mimic:{name:'Mimic'}};
 const heard=new Set();
 for(const language of ['russian','english'])for(const monster of ['Werewolf','Wendigo','Vampire'])for(let branch=0;branch<3;branch++){
  const engine=new StoryEngine({scripts,characters,language,onEvent(event){
   if(event.type!=='dialogue')return;
   const key=chapter2VoiceKey({script:event.sourceScript,sourceLine:event.sourceLine-1,speaker:event.speaker,language});
   const slot=slots.get(key);assert.ok(slot,`missing recorded slot for ${key}`);
   assert.equal(slot.text,event.text);assert.equal(slot.speaker,event.speaker);assert.equal(slot.status,'pending');
   if(slot.when)assert.equal(slot.when.equals,monster);
   heard.add(key);
  }});
  engine.start('chapter_2/start',{flags:{monster},inventory:['journal_3']});
  let steps=0,choices=0;
  while(engine.state.phase!=='credits'){
   assert.ok(++steps<5000,'recording-plan coverage must finish the real chapter');
   if(engine.state.phase==='choice'){engine.choose(branch);choices++;}else engine.advance();
  }
  assert.equal(choices,3);
 }
 assert.deepEqual([...heard].sort(),[...slots.keys()].sort(),'all normal and guarded authored paragraphs must have reachable voice slots');
});
