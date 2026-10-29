import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StoryEngine } from '../engine.js';
import { getFlowGraph, flowView } from '../flowchart.js';
import { createFlowJump } from '../flow-jump.js';

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const scripts = { ...read('assets/scripts.json'), ...read('assets/chapter1-scripts.json') };
const characters = { ...read('assets/config.json').characters, ...read('assets/chapter1-art.json').characters };
const options = { scripts, characters };
const locations = ['Arcade', 'Hardware_Store', 'Telepathy_Tent'];

function until(engine, phase) {
  for (let n = 0; n < 4000; n++) {
    if (engine.state.phase === phase) return;
    engine.advance();
  }
  assert.fail(`Did not reach ${phase} from ${engine.state.script}`);
}
function visit(engine, location) {
  const key = location.toLowerCase();
  engine.visit(location, { script: `chapter_0/part_2_freetime/${key}/first`, background: key });
}
function continueToEnd(snapshot, chapter) {
  const engine = new StoryEngine({ ...options, language: snapshot.language });
  engine.restore(snapshot);
  for (let n = 0; n < 7000; n++) {
    if (engine.state.phase === 'credits') return engine.snapshot();
    if (engine.state.phase === 'choice') engine.choose(0);
    else if (engine.state.phase === 'map' && chapter === 0) {
      const next = locations.find(location => !engine.state.visited.includes(location.toLowerCase()));
      if (next) visit(engine, next);
      else engine.visit('Forest', { script: 'chapter_0/part_3_mothman/mothman_1', background: 'forest_1_dusk', final: true });
    } else {
      assert.ok(['dialogue', 'pause'].includes(engine.state.phase), `Unexpected phase ${engine.state.phase}`);
      engine.advance();
    }
  }
  assert.fail(`Jump did not continue to a real ending: ${engine.state.script}`);
}
function finishJumpScene(snapshot) {
  const engine = new StoryEngine({ ...options, language: snapshot.language });
  engine.restore(snapshot);
  for (let n = 0; n < 1000; n++) {
    if (engine.state.script !== snapshot.script || engine.state.phase === 'credits') return engine.snapshot();
    engine.advance();
  }
  assert.fail('The resumed scene did not complete');
}
function chapterOneSave({ monster = 'Vampire', choices = [2, 2, 2, 2], language = 'english' } = {}) {
  const engine = new StoryEngine({ ...options, language });
  engine.start('chapter_1_v3/start', { flags: { monster } });
  for (const choice of choices) { until(engine, 'choice'); engine.choose(choice); }
  until(engine, 'credits');
  return engine.snapshot();
}
function chapterZeroSave({ monster = 1, order = ['Hardware_Store', 'Telepathy_Tent', 'Arcade'] } = {}) {
  const engine = new StoryEngine({ ...options, language: 'english' });
  engine.start(); until(engine, 'choice'); engine.choose(monster); until(engine, 'map');
  for (const location of order) { visit(engine, location); until(engine, 'map'); }
  engine.visit('Forest', { script: 'chapter_0/part_3_mothman/mothman_1', background: 'forest_1_dusk', final: true });
  until(engine, 'credits');
  return engine.snapshot();
}

test('every map node in Russian and English starts its real scene and continues to completion', () => {
  let checked = 0;
  for (const chapter of [0, 1]) for (const language of ['russian', 'english']) {
    for (const node of getFlowGraph(chapter).nodes) {
      const snapshot = createFlowJump({ ...options, chapter, nodeId: node.id, language });
      assert.equal(snapshot.language, language);
      assert.equal(flowView(chapter, null, snapshot).currentNodeId, node.id, `${chapter}/${language}/${node.id}`);
      assert.equal(snapshot.phase, chapter === 0 && node.id === 'town' ? 'map' : 'dialogue');
      if (snapshot.phase === 'dialogue') {
        assert.equal(snapshot.history.filter(row => row.script === snapshot.script).length, 1, `${node.id} must start at its first paragraph`);
        assert.equal(snapshot.revealed, 0);
        assert.ok(snapshot.text.trim());
      }
      const ending = continueToEnd(snapshot, chapter);
      assert.equal(ending.phase, 'credits');
      assert.equal(flowView(chapter, null, ending).completed, true);
      checked++;
    }
  }
  assert.equal(checked, 102);
});

test('theory nodes select the required prologue creature and preserve compatible earlier decisions', () => {
  const source = chapterOneSave({ monster: 'Vampire' }), before = JSON.stringify(source);
  const cafe = createFlowJump({ ...options, chapter: 1, nodeId: 'cafe_werewolf', snapshot: source });
  assert.equal(cafe.flags.monster, 'Werewolf');
  assert.equal(cafe.flags.reason, undefined);
  assert.equal(cafe.flags.ending, undefined);
  assert.equal(cafe.inventory.includes('cloth_scrap'), false);
  const yard = createFlowJump({ ...options, chapter: 1, nodeId: 'yard_wendigo', snapshot: source });
  assert.equal(yard.flags.monster, 'Wendigo');
  assert.equal(yard.flags.reason, 'Openness');
  assert.equal(yard.flags.gideon_openness, 1);
  assert.equal(yard.flags.tracks, undefined);
  assert.ok(yard.history.some(row => row.script.endsWith('/cafe_wendigo')));
  assert.ok(!yard.history.some(row => row.script.endsWith('/cafe_vampire')));
  assert.equal(JSON.stringify(source), before);
});

test('replaying a clue branch rebuilds counters and inventory instead of retaining incompatible future state', () => {
  const source = chapterOneSave({ monster: 'Wendigo' });
  const journal = createFlowJump({ ...options, chapter: 1, nodeId: 'tracks_journal', snapshot: source, language: 'russian' });
  assert.equal(journal.flags.monster, 'Wendigo');
  assert.equal(journal.flags.reason, 'Openness');
  assert.equal(journal.flags.gideon_openness, 1);
  assert.equal(journal.flags.pacifica_gideon_trust, 1);
  assert.equal(journal.flags.tracks, 'Journal');
  assert.equal(journal.flags.journal_doubt, 0, 'Doubt is earned after the scene, not at its first line');
  assert.equal(finishJumpScene(journal).flags.journal_doubt, 1);
  assert.notEqual(journal.flags.extra_clue_01, true);
  assert.equal(journal.flags.descent, undefined);
  assert.equal(journal.flags.ending, undefined);
  assert.equal(journal.inventory.includes('cloth_scrap'), false);
  const descent = createFlowJump({ ...options, chapter: 1, nodeId: 'descent_pacifica', snapshot: source });
  assert.equal(descent.flags.tracks, 'Search');
  assert.ok(descent.inventory.includes('cloth_scrap'));
  assert.equal(descent.flags.descent, 'Pacifica');
  assert.equal(descent.flags.pacifica_gideon_trust, 1);
  assert.equal(finishJumpScene(descent).flags.pacifica_gideon_trust, 2);
  assert.notEqual(descent.flags.careful_route, true);
  assert.equal(descent.flags.ending, undefined);
  const ending = createFlowJump({ ...options, chapter: 1, nodeId: 'ending_cautious', snapshot: source });
  assert.equal(ending.flags.descent, 'Careful');
  assert.equal(ending.flags.ending, 'Cautious');
  assert.equal(ending.flags.chapter1_cautious_end, false);
  assert.equal(finishJumpScene(ending).flags.chapter1_cautious_end, true);
  assert.notEqual(ending.flags.chapter1_observation_end, true);
  const final = continueToEnd(ending, 1);
  assert.equal(final.flags.ending, 'Cautious');
  assert.equal(final.script, 'chapter_1_v3/will');
});

test('each of the twelve choice branches can override only its own earlier choice', () => {
  const source = chapterOneSave({ monster: 'Vampire', choices: [2, 2, 2, 2] });
  const groups = {
    reason: ['Deflect', 'Curiosity', 'Openness'], tracks: ['Bold', 'Journal', 'Search'],
    descent: ['Pacifica', 'Gideon', 'Careful'], ending: ['Bold', 'Cautious', 'Observation']
  };
  const keys = Object.keys(groups);
  for (const [group, values] of Object.entries(groups)) for (const value of values) {
    const jumped = createFlowJump({ ...options, chapter: 1, nodeId: `${group}_${value.toLowerCase()}`, snapshot: source });
    assert.equal(jumped.flags[group], value);
    assert.equal(jumped.flags.monster, 'Vampire');
    for (const previous of keys.slice(0, keys.indexOf(group))) assert.equal(jumped.flags[previous], groups[previous][2]);
    for (const future of keys.slice(keys.indexOf(group) + 1)) assert.equal(jumped.flags[future], undefined);
  }
});

test('chapter-zero city jumps replay prior visits in order and enter the selected first-visit scene', () => {
  const source = chapterZeroSave();
  const before = JSON.stringify(source);
  const arcade = createFlowJump({ ...options, chapter: 0, nodeId: 'arcade', snapshot: source });
  assert.deepEqual(arcade.visited, ['hardware_store', 'telepathy_tent', 'arcade']);
  assert.equal(arcade.flags.monster, 'Wendigo');
  assert.equal(arcade.bg.toLowerCase(), 'arcade');
  assert.ok(arcade.script.endsWith('/arcade/first'));
  const hardware = createFlowJump({ ...options, chapter: 0, nodeId: 'hardware', snapshot: source });
  assert.deepEqual(hardware.visited, ['hardware_store']);
  const town = createFlowJump({ ...options, chapter: 0, nodeId: 'town', snapshot: source });
  assert.equal(town.phase, 'map'); assert.deepEqual(town.visited, []);
  const forest = createFlowJump({ ...options, chapter: 0, nodeId: 'forest', snapshot: source });
  assert.deepEqual(forest.visited, ['hardware_store', 'telepathy_tent', 'arcade', 'forest']);
  assert.equal(forest.bg, 'forest_1_dusk');
  const cityScripts = forest.history.map(row => row.script).filter(path => path.includes('/part_2_freetime/'));
  assert.deepEqual([...new Set(cityScripts)], [
    'chapter_0/part_2_freetime/hardware_store/first',
    'chapter_0/part_2_freetime/telepathy_tent/first',
    'chapter_0/part_2_freetime/arcade/first'
  ]);
  assert.equal(JSON.stringify(source), before);
});

test('chapter-zero monster nodes choose the real earlier branch instead of patching late flags', () => {
  const source = chapterZeroSave({ monster: 2 });
  const jumped = createFlowJump({ ...options, chapter: 0, nodeId: 'moth_heat', snapshot: source });
  assert.equal(jumped.flags.monster, 'Wendigo');
  assert.ok(jumped.history.some(row => row.script.endsWith('/intro_2_wendigo')));
  assert.ok(!jumped.history.some(row => row.script.endsWith('/intro_2_vampire')));
  assert.equal(continueToEnd(jumped, 0).flags.monster, 'Wendigo');
});

test('all seven original languages can resume shared chapter-zero scenes', () => {
  for (const language of ['english', 'french', 'german', 'polish', 'russian', 'spanish', 'ukrainian']) {
    for (const nodeId of ['intro', 'gideon', 'town', 'arcade', 'forest', 'moth_reflection', 'finale']) {
      const snapshot = createFlowJump({ ...options, chapter: 0, nodeId, language, monster: 'Vampire' });
      assert.equal(snapshot.language, language);
      assert.equal(flowView(0, null, snapshot).currentNodeId, nodeId);
      assert.equal(continueToEnd(snapshot, 0).phase, 'credits');
    }
  }
});

test('the original French branch defect is preserved rather than manufacturing a nonexistent route', () => {
  const first = createFlowJump({ ...options, chapter: 0, nodeId: 'werewolf', language: 'french' });
  assert.ok(first.script.endsWith('/intro_2_werewolf'));
  assert.equal(first.flags.monster, 'Vampire');
  for (const nodeId of ['moth_paper', 'moth_heat']) {
    assert.throws(() => createFlowJump({ ...options, chapter: 0, nodeId, language: 'french' }), /unavailable|cannot|unreachable|French|french/i);
  }
});

test('invalid targets are rejected, while incompatible or legacy saves do not leak choices', () => {
  for (const [chapter, nodeId] of [[0, '../scene'], [1, 'werewolf'], [0, 'cafe_werewolf'], [1, 'unknown'], [1, 'battle_werewolf'], [1, 'ending_ask']]) {
    assert.throws(() => createFlowJump({ ...options, chapter, nodeId }));
  }
  for (const chapter of [-1, 2, null, 'chapter_1_v2']) assert.throws(() => createFlowJump({ ...options, chapter, nodeId: 'intro' }));
  for (const language of ['french', 'klingon']) assert.throws(() => createFlowJump({ ...options, chapter: 1, nodeId: 'start', language }));
  const foreign = chapterZeroSave({ monster: 2 });
  const legacy = { ...chapterOneSave(), script: 'chapter_1/epilogue_anchor' };
  for (const snapshot of [foreign, legacy, { ...legacy, script: 'chapter_1_v2/start' }, null]) {
    const jumped = createFlowJump({ ...options, chapter: 1, nodeId: 'yard', snapshot, monster: 'Wendigo' });
    assert.equal(jumped.flags.monster, 'Wendigo'); assert.equal(jumped.flags.reason, 'Deflect');
    assert.equal(jumped.flags.ending, undefined);
  }
});
