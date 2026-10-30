import assert from 'node:assert/strict';
import fs from 'node:fs';
import { flowActionContext, projectFlowMap } from '../flowchart-view.js';
import { getFlowGraph, observeFlow, readFlowProgress } from '../flowchart.js';

const snapshot = (monster = 'vampire') => ({version:1,script:`chapter_0/part_1_intro/intro_2_${monster}`,line:3,phase:'dialogue',history:[{script:'chapter_0/part_1_intro/intro_1'}]});
const vampire = snapshot(), werewolf = snapshot('werewolf');
let discovered = observeFlow(readFlowProgress(null), vampire);
discovered = observeFlow(discovered, werewolf);
const before = JSON.stringify(discovered);
const route = projectFlowMap(0, discovered, vampire, null, {mode:'path'});
assert.deepEqual(route.nodes.map(node=>node.id), ['intro','vampire']);
assert.ok(route.edges.every(edge => route.nodes.some(node=>node.id===edge.from) && route.nodes.some(node=>node.id===edge.to)));
assert.equal(JSON.stringify(discovered),before);
console.log('✓ My path uses only the provided canonical route, even when alternatives are discovered');
const whole = projectFlowMap(0,discovered,vampire,werewolf,{mode:'full'});
assert.equal(whole.nodes.find(node=>node.id==='werewolf').inAlternative,true);
assert.equal(whole.nodes.find(node=>node.id==='vampire').inPath,true);
assert.equal(whole.nodes.find(node=>node.id==='wendigo').visible,true);
assert.equal(JSON.stringify(discovered),before);
console.log('✓ Alternative display is separate; all implemented nodes are visible without discovery');
const node=whole.nodes.find(node=>node.id==='werewolf');
const decision={choiceId:'ch0.creature',optionId:'Werewolf',currentOption:'Vampire',options:[{id:'Werewolf',discovered:true}]};
assert.deepEqual(flowActionContext('full',node,decision),{canPreview:true,canRewrite:true});
assert.deepEqual(flowActionContext('all',node,decision),{canPreview:false,canRewrite:false});
assert.deepEqual(flowActionContext('path',node,decision),{canPreview:false,canRewrite:false});
assert.deepEqual(flowActionContext('full',node,{...decision,currentOption:'Werewolf'}),{canPreview:true,canRewrite:false});
console.log('✓ Only an explicit Full-mode action can preview or rewrite; current choice cannot be rewritten to itself');
const unseen=whole.nodes.find(node=>node.id==='wendigo');
assert.equal(unseen.visible,true);
assert.deepEqual(flowActionContext('full',unseen,{...decision,optionId:'Wendigo',options:[{id:'Wendigo',discovered:false}]}),{canPreview:true,canRewrite:true});
assert.deepEqual(flowActionContext('full',node,{...decision,options:[{id:'Werewolf',discovered:false}]}),{canPreview:true,canRewrite:true});
assert.deepEqual(flowActionContext('full',node,{...decision,optionId:'bogus'}),{canPreview:false,canRewrite:false});
assert.deepEqual(flowActionContext('true-story',node,decision),{canPreview:false,canRewrite:false});
console.log('✓ Full mode actions use registered options independently of discovery; True Story is read-only');

for (const id of ['ending_bold','ending_cautious','ending_observation','will']) {
  const node=getFlowGraph(1).nodes.find(node=>node.id===id);
  for(const detail of Object.values(node.detail)) assert.doesNotMatch(detail, /(?:chapter1_|Chapter\s*2|В главе\s*2|clue bonus|extra item|The Wrong Monster|Не тот монстр)/i);
}
console.log('✓ Resolution descriptions describe only the seen scene, without future mechanics or implementation flags');

const fresh = readFlowProgress(null), freshBefore = JSON.stringify(fresh);
for (const chapter of [0, 1, 2, 3]) {
  const view = projectFlowMap(chapter, fresh, null, null, { mode: 'full' });
  assert.equal(view.nodes.length, getFlowGraph(chapter).nodes.length);
  assert.ok(view.nodes.every(node => node.visible && !node.discovered && !node.inPath));
  assert.equal(view.discoveredCount, 0);
}
assert.equal(JSON.stringify(fresh), freshBefore);
console.log('✓ Fresh maps show every implemented option without marking anything seen or canonical');

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const id of ['chapter2-title', 'chapter2-description', 'chapter2-language', 'chapter2-start', 'chapter2-continue', 'chapter2-unlock-note', 'ending-next-chapter']) assert.ok(page.includes(`id="${id}"`));
for (const chapter of [0, 1, 2, 3]) assert.match(page, new RegExp(`id="flow-chapter${chapter}" data-flow-chapter="${chapter}"`));
assert.ok(page.indexOf('id="flow-chapter2"') < page.indexOf('id="flow-true-story"'));
assert.doesNotMatch(page, /id="flow-chapter4"/);
assert.match(page, /id="chapter2-start"[^>]*disabled/);
assert.match(page, /id="ending-next-chapter"[^>]*hidden/);
const description=page.match(/id="chapter2-description">([^<]+)</)[1];
assert.doesNotMatch(description, /символ|похититель|хищник|species|symbol|predator/i);
console.log('✓ Chapter 2 reuses the picker and decision map with a gated start, next-chapter action and no fake later chapter');
