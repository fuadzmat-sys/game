import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StoryEngine } from '../engine.js';
import { CHAPTERS, CHAPTER_IDS, CHAPTER2_CHOICES, CHAPTER2_ENDINGS, chapterForSnapshot, normalizeChapter, chapterLanguage, saveKey, readCampaign, markCompleted, validCampaign, chapter2Handoff } from '../campaign.js';
import { STORY_REGISTRY, choicesFromSnapshot, reconcileSnapshot, seedChapterFlags, seedChapterInventory, progressFromSnapshot, replayCanonicalSnapshot, canonicalFlowSnapshot, createCanonicalFlowJump, rebuildSnapshotsForRewrite } from '../story-bridge.js';
import { createStoryEnvelope, createStoryStateService, deriveStoryState } from '../story-state.js';
import { getFlowGraph, flowView, readFlowProgress, observeFlow } from '../flowchart.js';
import { buildCanonTimeline } from '../canon-timeline.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const scripts = { ...read('assets/scripts.json'), ...read('assets/chapter1-scripts.json'), ...read('assets/chapter2-scripts.json') };
const art2Path = new URL('../assets/chapter2-art.json', import.meta.url);
const characters = { ...read('assets/config.json').characters, ...read('assets/chapter1-art.json').characters,
  Creature: { name: 'Creature' }, Predator: { name: 'Predator' }, Mimic: { name: 'Mimic' },
  ...(fs.existsSync(art2Path) ? JSON.parse(fs.readFileSync(art2Path, 'utf8')).characters : {}) };
const provided = read('tests/fixtures/chapter1-canon.json').canon;
const resources = { scripts, characters, language: 'russian' };
const chapter2Definitions = STORY_REGISTRY.choices.filter(choice => choice.chapterId === 2);
const selections = Object.values(CHAPTER2_CHOICES);
const sceneIds = ['start', 'two_tracks', 'watch_hut', 'rock_hollow', 'hidden_shelter', 'real_picture', 'real_threat', 'creature_question', 'symbol'];
const clone = value => JSON.parse(JSON.stringify(value));
function canonAt(snapshot, prior = provided) {
  return createStoryEnvelope({ choices: { ...prior.choices, ...choicesFromSnapshot(snapshot) }, currentChapter: 2,
    progress: { ...prior.progress, 2: progressFromSnapshot(snapshot) } }, STORY_REGISTRY).canon;
}
function project(engine, prior = provided) {
  const canon = canonAt(engine.snapshot(), prior), fixed = reconcileSnapshot(engine.snapshot(), canon);
  engine.state.flags = fixed.flags; engine.state.inventory = fixed.inventory;
  return canon;
}
function start(language = 'russian', prior = provided) {
  const engine = new StoryEngine({ scripts, characters, language });
  engine.start(CHAPTERS[2].start, { flags: seedChapterFlags(prior, 2), inventory: seedChapterInventory(prior, 2) });
  project(engine, prior); return engine;
}
function drive(engine, chosen, { prior = provided, checkpoints = null } = {}) {
  let picked = chapter2Definitions.filter(choice => engine.state.flags[choice.legacyKey]).length, steps = 0;
  const captured = new Set();
  while (engine.state.phase !== 'credits') {
    assert.ok(++steps < 5000, 'Chapter 2 must terminate');
    const key = engine.state.script.split('/').at(-1);
    if (checkpoints && (engine.state.phase === 'choice' || ['water_climax', 'creature_question', 'symbol'].includes(key)) && !captured.has(key)) {
      const canon = project(engine, prior); checkpoints.push({ snapshot: engine.snapshot(), canon }); captured.add(key);
    }
    if (engine.state.phase === 'choice') {
      assert.equal(engine.state.script, chapter2Definitions[picked].sceneId);
      assert.equal(engine.state.choices.length, 3);
      engine.choose(chosen[picked++]);
      const canon = project(engine, prior);
      if (checkpoints) checkpoints.push({ snapshot: engine.snapshot(), canon });
    } else engine.advance();
  }
  assert.equal(picked, 3); return { snapshot: engine.snapshot(), canon: project(engine, prior) };
}

test('chapter two is installed without renaming existing chapter namespaces, save keys or story IDs', () => {
  assert.deepEqual(CHAPTER_IDS, [0, 1, 2, 3]); assert.equal(normalizeChapter('chapter_2'), 2);
  assert.equal(chapterForSnapshot({ version: 1, script: 'textes/russian/chapter_2/start' }), 2);
  assert.equal(saveKey(0), 'reverse-falls-chapter0-save-v1'); assert.equal(saveKey(1), 'reverse-falls-chapter1-v3-save-v1');
  assert.equal(saveKey(2), 'reverse-falls-chapter2-save-v1'); assert.equal(CHAPTERS[1].nextChapter.available, true);
  assert.equal(CHAPTERS[2].nextChapter.id, 3); assert.equal(chapterLanguage(2, 'russian'), 'russian');
  assert.deepEqual(chapter2Definitions.map(choice => choice.id), ['ch2.trail_focus', 'ch2.threat_plan', 'ch2.creature_fate']);
  assert.deepEqual(chapter2Definitions.map(choice => choice.options.map(option => option.id)), selections);
  assert.deepEqual(deriveStoryState(provided, STORY_REGISTRY), provided.derived, 'the supplied chapter-one canon remains byte-semantically valid');
});

test('chapter two starts from actual earlier canon with the existing journal and ordinary preparation adds no loot', () => {
  const flags = seedChapterFlags(provided, 2), inventory = seedChapterInventory(provided, 2);
  assert.equal(flags.monster, 'Wendigo'); assert.equal(flags.reason, 'Openness'); assert.equal(flags.tracks, 'Journal');
  assert.equal(flags.ending, 'Cautious'); assert.equal(flags.pacifica_gideon_trust, 2); assert.equal(flags.journal_doubt, 1);
  assert.equal(flags.trail_focus, undefined); assert.deepEqual(inventory, ['journal_3']);
  const engine = start(); assert.equal(engine.state.script, 'chapter_2/start'); assert.equal(engine.state.flags.pacifica_gideon_trust, 2);
  const other = clone(provided); other.choices['ch0.creature'] = 'Vampire'; other.derived = deriveStoryState(other, STORY_REGISTRY);
  assert.equal(start('english', other).state.flags.monster, 'Vampire'); assert.equal(provided.choices['ch0.creature'], 'Wendigo');
});

test('all 27 choices in both languages reach all nine scenes and exactly the shared symbol ending', () => {
  for (const language of ['russian', 'english']) for (let trail = 0; trail < 3; trail++) for (let plan = 0; plan < 3; plan++) for (let fate = 0; fate < 3; fate++) {
    const { snapshot, canon } = drive(start(language), [trail, plan, fate]);
    assert.equal(snapshot.script, 'chapter_2/symbol'); assert.equal(snapshot.phase, 'credits');
    const visited = new Set(snapshot.history.map(row => row.script));
    for (const id of sceneIds) assert.ok(visited.has('chapter_2/' + id), `${language}: ${id}`);
    assert.ok(visited.has('chapter_2/water_climax'));
    assert.equal(canon.choices['ch2.trail_focus'], selections[0][trail]); assert.equal(canon.choices['ch2.threat_plan'], selections[1][plan]); assert.equal(canon.choices['ch2.creature_fate'], selections[2][fate]);
    assert.equal(canon.derived.relationships.pacifica_gideon.total, 2 + Number(plan === 2));
    assert.equal(snapshot.flags.pacifica_gideon_trust, 2 + Number(plan === 2));
    assert.equal(canon.derived.flags.journal_doubt.value, 1);
    assert.deepEqual(Object.keys(canon.derived.inventory), ['journal_3']);
    assert.equal(canon.derived.relationships.creature_trust?.total ?? 0, Number(fate === 0));
    const clue = ['ch2_large_fiber', 'ch2_track_mismatch', 'ch2_tracks_separate'][trail];
    for (const character of ['pacifica', 'gideon']) {
      assert.deepEqual(canon.derived.knowledge[character][clue].sources, [`ch2.trail_focus.${selections[0][trail]}`]);
      assert.equal(!!canon.derived.knowledge[character].ch2_predator_reacts_to_motion, plan === 1);
    }
  }
});

test('saving before and after every choice, in the climax and final scenes restores the selected route and presentation', () => {
  const checkpoints = [], chosen = [2, 2, 2], final = drive(start(), chosen, { checkpoints });
  assert.ok(checkpoints.length >= 8);
  for (const { snapshot, canon } of checkpoints) {
    const engine = new StoryEngine({ scripts, characters, language: snapshot.language });
    engine.restore(JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(engine.state.presentation, snapshot.presentation);
    assert.deepEqual(engine.state.flags, snapshot.flags);
    const resumed = drive(engine, chosen, { prior: canon });
    assert.deepEqual(resumed.canon.choices, final.canon.choices);
    assert.equal(resumed.canon.derived.relationships.pacifica_gideon.total, 3);
    assert.equal(resumed.canon.choices['ch2.creature_fate'], 'Neutralize');
  }
});

test('chapter-two map exposes three local choices, all alternatives and convergence without future plot hints', () => {
  const graph = getFlowGraph(2); assert.equal(graph.nodes.length, 19); assert.equal(graph.edges.length, 24);
  assert.deepEqual(graph.nodes.filter(node => node.kind === 'choice').map(node => node.id), ['two_tracks', 'real_threat', 'creature_question']);
  const result = drive(start(), [1, 2, 0]), snapshot = canonicalFlowSnapshot(2, result.canon);
  const view = flowView(2, readFlowProgress(null), snapshot);
  assert.ok(view.nodes.every(node => node.visible)); assert.equal(view.completed, true);
  for (const node of ['trail_journal', 'plan_protect', 'fate_help', 'symbol']) assert.equal(view.nodes.find(item => item.id === node).inPath, true);
  for (const node of ['trail_perimeter', 'plan_block', 'fate_neutralize']) assert.equal(view.nodes.find(item => item.id === node).inPath, false);
  assert.doesNotMatch(JSON.stringify(graph), /Chapter 3|глава 3|revenge|origin|Cipher|author of the Journals/i);
  const discovered = observeFlow(null, result.snapshot); assert.ok(discovered.chapters[2].nodes.includes('symbol')); assert.equal(discovered.chapters[0].nodes.length, 0);
});

test('each map entry replays the actual chapter-two branch with canonical earlier facts and no future choice injection', () => {
  const final = drive(start(), [1, 2, 0]);
  for (const node of getFlowGraph(2).nodes) {
    const snapshot = createCanonicalFlowJump({ ...resources, chapter: 2, nodeId: node.id, canon: final.canon });
    assert.equal(snapshot.script, 'chapter_2/' + node.id); assert.equal(snapshot.flags.monster, 'Wendigo'); assert.equal(snapshot.flags.journal_doubt, 1);
    if (node.id === 'start') assert.equal(snapshot.flags.creature_fate, undefined);
    assert.ok(snapshot.inventory.includes('journal_3'));
  }
});

test('completion projects chapter two while keeping old campaign version-two saves valid', () => {
  const old = readCampaign(null); delete old.chapters[2]; assert.equal(validCampaign(old), true);
  const result = drive(start(), [0, 2, 0]);
  const completed = markCompleted(old, reconcileSnapshot(result.snapshot, result.canon));
  assert.equal(completed.version, 2); assert.equal(completed.chapters[2].completed, true);
  assert.equal(completed.chapters[2].ending, 'Help'); assert.equal(completed.chapters[2].flags.pacifica_gideon_trust, 3);
  assert.equal(validCampaign(completed), true); assert.deepEqual(readCampaign(completed), completed);
  const one = replayCanonicalSnapshot(1, provided, null, resources), campaign = markCompleted(null, one);
  assert.equal(chapter2Handoff(campaign).available, true); assert.equal(chapter2Handoff(campaign).setup.extraItemAvailable, true);
});

test('rewrites recompute only sourced chapter-two effects and preserve independent earlier decisions and saves', () => {
  const result = drive(start(), [0, 2, 0]);
  const old = createStoryEnvelope({ canon: result.canon, snapshots: { 2: result.snapshot } }, STORY_REGISTRY);
  const storage = new Map(), adapter = { get: key => storage.get(key) ?? null, set: (key, value) => { storage.set(key, clone(value)); return true; } };
  const service = createStoryStateService({ storage: adapter, registry: STORY_REGISTRY }); service.init(old);
  service.rewriteCanonFrom('ch2.threat_plan', 'Block', { prepare(candidate, before) { Object.assign(candidate, rebuildSnapshotsForRewrite(candidate, before, resources)); } });
  assert.equal(service.getRelationship('pacifica_gideon'), 2); assert.equal(service.characterKnows('gideon', 'ch2_predator_reacts_to_motion'), true);
  service.rewriteCanonFrom('ch2.creature_fate', 'Expel', { prepare(candidate, before) { Object.assign(candidate, rebuildSnapshotsForRewrite(candidate, before, resources)); } });
  assert.equal(service.getRelationship('creature_trust'), 0);
  for (const [id, value] of Object.entries(provided.choices)) assert.equal(service.getChoice(id), value);
  const loaded = createStoryStateService({ storage: adapter, registry: STORY_REGISTRY }); loaded.init();
  assert.deepEqual(loaded.getCanon(), service.getCanon()); assert.equal(loaded.getState().snapshots[2].phase, 'credits');
});

test('True Story extends through the real chapter two while remaining read only and canonical', () => {
  const result = drive(start(), [2, 1, 2]);
  const timeline = buildCanonTimeline(result.canon);
  assert.ok(timeline.edges.some(edge => edge.from === '1:will' && edge.to === '2:start' && edge.chapterTransition));
  for (const node of ['trail_perimeter', 'plan_block', 'fate_neutralize', 'symbol']) assert.ok(timeline.nodes.some(item => item.chapterId === 2 && item.nodeId === node));
  assert.ok(!timeline.nodes.some(item => item.chapterId === 2 && ['trail_largetracks','plan_distract','fate_help'].includes(item.nodeId)));
  assert.equal(timeline.readOnly, true); assert.ok(Object.keys(CHAPTER2_ENDINGS).every(option => CHAPTER2_CHOICES.creature_fate.includes(option)));
});
