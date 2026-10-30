import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StoryEngine } from '../engine.js';
import { CHAPTERS, CHAPTER_IDS, CHAPTER3_CHOICES, CHAPTER3_ENDINGS, chapter3Handoff, chapterForSnapshot, normalizeChapter, saveKey, readCampaign, markCompleted, validCampaign } from '../campaign.js';
import { STORY_REGISTRY, choicesFromSnapshot, reconcileSnapshot, seedChapterFlags, seedChapterInventory, progressFromSnapshot, replayCanonicalSnapshot, canonicalFlowSnapshot, createCanonicalFlowJump, rebuildSnapshotsForRewrite } from '../story-bridge.js';
import { createStoryEnvelope, createStoryStateService, deriveStoryState } from '../story-state.js';
import { getFlowGraph, flowView, readFlowProgress, observeFlow } from '../flowchart.js';
import { buildCanonTimeline } from '../canon-timeline.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const sourceBytes = fs.readFileSync(new URL('../выборы.json', import.meta.url));
const supplied = JSON.parse(sourceBytes), prior = supplied.canon;
const clone = value => JSON.parse(JSON.stringify(value));
const definitions = STORY_REGISTRY.choices.filter(choice => choice.chapterId === 3);
const expectedEarlier = { 'ch0.creature': 'Wendigo', 'ch1.gideon_reason': 'Openness', 'ch1.tracks': 'Bold', 'ch1.slope': 'Pacifica', 'ch1.ending': 'Cautious', 'ch2.trail_focus': 'Journal', 'ch2.threat_plan': 'Protect', 'ch2.creature_fate': 'Help' };
const selected3 = { 'ch3.wendy_approach': 'Bargain', 'ch3.test_method': 'Listen', 'ch3.exit_plan': 'SecureBag' };

// A tiny interpreter fixture tests registry-to-engine wiring separately from the
// authored narrative. The full chapter content has its own integration suite.
const graph = getFlowGraph(3);
const fixtureScripts = Object.fromEntries(['russian', 'english'].flatMap(language => graph.nodes.map(node => {
  const definition = definitions.find(choice => choice.sceneId === `chapter_3/${node.id}`);
  const selection = definitions.flatMap(choice => choice.options.map(option => ({ choice, option }))).find(row => row.option.nodeId === node.id);
  const commands = ['[scene chapter_3]'];
  if (selection) commands.push(`[Choice ${selection.choice.legacyKey} ${selection.option.id}]`);
  commands.push('[Gideon]', `Registry fixture: ${node.id}.`);
  if (definition) {
    definition.options.forEach((option, index) => commands.push(`[Button text ${index + 1} ${option.id}]`, `[Button order ${index + 1} next chapter_3/${option.nodeId}]`));
    commands.push('[stop]');
  } else if (node.kind === 'ending') commands.push('[scene credits]');
  else commands.push(`[next chapter_3/${graph.edges.find(edge => edge.from === node.id).to}]`);
  return [`textes/${language}/chapter_3/${node.id}`, commands.join('\n') + '\n'];
})));
const resources = { scripts: fixtureScripts, characters: { Gideon: { name: 'Gideon' } }, language: 'russian' };
function completed(choices = selected3) {
  const canon = createStoryEnvelope({ choices: { ...prior.choices, ...choices }, currentChapter: 3,
    progress: { ...prior.progress, 3: { sceneId: 'chapter_3/night_gate', line: 0, phase: 'credits', completed: true, language: 'russian', visited: [] } } }, STORY_REGISTRY).canon;
  const snapshot = replayCanonicalSnapshot(3, canon, null, resources);
  canon.progress[3] = progressFromSnapshot(snapshot);
  canon.derived = deriveStoryState(canon, STORY_REGISTRY);
  return { canon, snapshot: reconcileSnapshot(snapshot, canon) };
}
function serviceFor(canon = prior, snapshots = {}) {
  const data = new Map(), storage = { get: key => data.get(key) ?? null, set: (key, value) => { data.set(key, clone(value)); return true; } };
  const service = createStoryStateService({ storage, registry: STORY_REGISTRY });
  service.init(createStoryEnvelope({ canon, snapshots }, STORY_REGISTRY));
  return { service, storage, data };
}

test('chapter three registration preserves released IDs and user export byte-for-byte', () => {
  assert.deepEqual(CHAPTER_IDS, [0, 1, 2, 3]);
  assert.equal(normalizeChapter('chapter_3'), 3);
  assert.equal(chapterForSnapshot({ version: 1, script: 'textes/russian/chapter_3/start' }), 3);
  assert.equal(saveKey(3), 'reverse-falls-chapter3-save-v1');
  assert.equal(CHAPTERS[2].nextChapter.id, 3); assert.equal(CHAPTERS[3].nextChapter, null);
  assert.deepEqual(Object.keys(CHAPTER3_CHOICES), ['wendy_approach', 'test_method', 'exit_plan']);
  assert.deepEqual(definitions.map(choice => choice.id), ['ch3.wendy_approach', 'ch3.test_method', 'ch3.exit_plan']);
  assert.deepEqual(prior.choices, expectedEarlier);
  assert.deepEqual(deriveStoryState(prior, STORY_REGISTRY), prior.derived);
  assert.equal(prior.progress[2].completed, false); assert.equal(prior.progress[2].phase, 'dialogue');
  assert.deepEqual(fs.readFileSync(new URL('../выборы.json', import.meta.url)), sourceBytes);
});

test('chapter three seeds the actual provided route without inventing a cloth clue or finishing chapter two', () => {
  const before = clone(prior), flags = seedChapterFlags(prior, 3), inventory = seedChapterInventory(prior, 3);
  assert.equal(flags.monster, 'Wendigo'); assert.equal(flags.reason, 'Openness'); assert.equal(flags.tracks, 'Bold');
  assert.equal(flags.ending, 'Cautious'); assert.equal(flags.trail_focus, 'Journal'); assert.equal(flags.threat_plan, 'Protect'); assert.equal(flags.creature_fate, 'Help');
  assert.equal(flags.pacifica_gideon_trust, 3); assert.equal(flags.creature_trust, 1);
  assert.equal(flags.wendy_approach, undefined); assert.equal(flags.exit_plan, undefined);
  assert.deepEqual(inventory, ['journal_3']); assert.deepEqual(prior, before);
  assert.equal(chapter3Handoff(readCampaign(null)), null);
});

test('all 27 chapter-three options derive small sourced consequences without granting Wendy’s object', () => {
  for (const approach of CHAPTER3_CHOICES.wendy_approach) for (const method of CHAPTER3_CHOICES.test_method) for (const exit of CHAPTER3_CHOICES.exit_plan) {
    const { canon } = completed({ 'ch3.wendy_approach': approach, 'ch3.test_method': method, 'ch3.exit_plan': exit });
    const derived = canon.derived;
    assert.equal(derived.relationships.pacifica_gideon.total, 3 + Number(exit === 'HoldGate'));
    assert.equal(derived.relationships.creature_trust.total, 1);
    assert.equal(derived.relationships.wendy_respect?.total ?? 0, Number(approach === 'Bargain') + Number(exit === 'Guide'));
    assert.equal(!!derived.flags.ch3_wendy_guarded, approach === 'Direct');
    assert.equal(!!derived.flags.ch3_object_secured, exit === 'SecureBag');
    assert.deepEqual(Object.keys(derived.inventory), ['journal_3']);
    for (const character of ['pacifica', 'gideon']) {
      assert.deepEqual(derived.knowledge[character].ch3_wendy_has_object.sources, [`ch3.exit_plan.${exit}`]);
      assert.ok(derived.knowledge[character].ch2_track_mismatch);
    }
    assert.equal(derived.quests.wendy_forest_object.value, 'unresolved');
    for (const [id, value] of Object.entries(expectedEarlier)) assert.equal(canon.choices[id], value);
  }
});

test('registered map entries replay every requested option while retaining the earlier canonical path', () => {
  const final = completed();
  for (const node of graph.nodes) {
    const snapshot = createCanonicalFlowJump({ ...resources, chapter: 3, nodeId: node.id, canon: final.canon });
    assert.equal(snapshot.script, 'chapter_3/' + node.id);
    assert.equal(snapshot.flags.monster, 'Wendigo'); assert.equal(snapshot.flags.creature_fate, 'Help');
    assert.equal(snapshot.flags.pacifica_gideon_trust, 3); assert.deepEqual(snapshot.inventory, ['journal_3']);
    const branch = definitions.flatMap(choice => choice.options.map(option => ({ choice, option }))).find(row => row.option.nodeId === node.id);
    if (branch) assert.equal(choicesFromSnapshot(snapshot)[branch.choice.id], branch.option.id);
    if (node.id === 'start') assert.equal(snapshot.flags.wendy_approach, undefined);
  }
});

test('chapter-three graph and True Story preserve discovery separation and joined canonical chapters', () => {
  assert.equal(graph.nodes.length, 18); assert.equal(graph.edges.length, 23);
  assert.deepEqual(graph.nodes.filter(node => node.kind === 'choice').map(node => node.id), ['first_talk', 'waymarks', 'crossing']);
  const final = completed(), empty = readFlowProgress(null);
  assert.deepEqual(Object.keys(empty.chapters), ['0', '1', '2', '3']);
  const view = flowView(3, empty, canonicalFlowSnapshot(3, final.canon));
  assert.ok(view.nodes.every(node => node.visible)); assert.ok(view.completed);
  const route = buildCanonTimeline(final.canon);
  assert.ok(route.edges.some(edge => edge.chapterTransition && edge.from === '2:symbol' && edge.to === '3:start'));
  for (const nodeId of ['approach_bargain', 'test_listen', 'exit_securebag', 'night_gate']) assert.ok(route.nodes.some(node => node.chapterId === 3 && node.nodeId === nodeId));
  for (const nodeId of ['approach_direct', 'test_mark', 'exit_holdgate']) assert.ok(!route.nodes.some(node => node.chapterId === 3 && node.nodeId === nodeId));
  assert.equal(route.readOnly, true);
  assert.ok(!JSON.stringify(graph).match(/Chapter\s*4|Глава\s*4|Will created|Уилл создал|Gleeful/i));
  const observed = observeFlow(null, final.snapshot);
  assert.ok(observed.chapters[3].nodes.includes('night_gate')); assert.deepEqual(observed.chapters[2].nodes, []);
});

test('chapter-three rewrites remain transactional and remove only obsolete sourced effects', () => {
  const final = completed(), { service } = serviceFor(final.canon, { 3: final.snapshot });
  service.rewriteCanonFrom('ch3.exit_plan', 'HoldGate', { prepare(candidate, old) { Object.assign(candidate, rebuildSnapshotsForRewrite(candidate, old, resources)); } });
  assert.equal(service.hasFlag('ch3_object_secured'), false); assert.equal(service.getRelationship('pacifica_gideon'), 4);
  assert.equal(service.getChoice('ch3.wendy_approach'), 'Bargain'); assert.equal(service.getChoice('ch2.creature_fate'), 'Help');
  const before = service.getState();
  assert.throws(() => service.rewriteCanonFrom('ch3.test_method', 'Mark', { prepare() { throw new Error('forced replay failure'); } }));
  assert.deepEqual(service.getState(), before);
  assert.equal(service.validate().valid, true); assert.ok(before.backups.length);
});

test('alternative chapter-three facts cannot overwrite official export; portable import restores the same path', () => {
  const final = completed(), { service, storage } = serviceFor(final.canon, { 3: final.snapshot });
  const exported = service.exportSave(), before = service.getCanon();
  const alternative = completed({ 'ch3.wendy_approach': 'Direct', 'ch3.test_method': 'Mark', 'ch3.exit_plan': 'HoldGate' });
  service.createAlternativeSession({ canon: alternative.canon, snapshots: { 3: alternative.snapshot } });
  assert.deepEqual(service.exportSave().canon, exported.canon); service.exitAlternative();
  service.rewriteCanonFrom('ch3.exit_plan', 'Guide'); service.importSave(JSON.stringify(exported));
  assert.deepEqual(service.getCanon(), before);
  const loaded = createStoryStateService({ storage, registry: STORY_REGISTRY }); loaded.init();
  assert.deepEqual(loaded.getCanon(), before);
});

test('completed chapter-three campaign is compatible while unfinished chapter two stays locked', () => {
  const final = completed();
  const campaign = markCompleted(null, final.snapshot);
  assert.equal(campaign.chapters[3].completed, true); assert.equal(campaign.chapters[3].ending, 'SecureBag');
  assert.equal(campaign.chapters[3].flags.pacifica_gideon_trust, 3); assert.equal(validCampaign(campaign), true);
  assert.deepEqual(readCampaign(campaign), campaign);
  assert.equal(chapter3Handoff(campaign), null, 'a later isolated test does not invent chapter-two completion');
  const old = readCampaign(null); delete old.chapters[3]; assert.equal(validCampaign(old), true);
  assert.ok(Object.keys(CHAPTER3_ENDINGS).every(id => CHAPTER3_CHOICES.exit_plan.includes(id)));
});
