import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StoryEngine } from '../engine.js';
import { createStoryEnvelope, deriveStoryState, validateStoryEnvelope } from '../story-state.js';
import {
  STORY_REGISTRY, choicesFromSnapshot, reconcileSnapshot, canonicalFlowSnapshot,
  migrateLegacyStory, rebuildSnapshotsForRewrite, replayCanonicalSnapshot,
  createCanonicalFlowJump, decisionForNode, progressFromSnapshot, boundSnapshotCache
} from '../story-bridge.js';
import { flowView } from '../flowchart.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const scripts = { ...read('assets/scripts.json'), ...read('assets/chapter1-scripts.json') };
const characters = { ...read('assets/config.json').characters, ...read('assets/chapter1-art.json').characters };
const resources = { scripts, characters, language: 'english' };
const baseChoices = { 'ch0.creature': 'Vampire', 'ch1.gideon_reason': 'Openness', 'ch1.tracks': 'Search', 'ch1.slope': 'Pacifica', 'ch1.ending': 'Observation' };
function validateSnapshot(snapshot) {
  const engine = new StoryEngine({ ...resources, language: snapshot.language });
  engine.restore(snapshot); return true;
}
function completed(chapter, selected = baseChoices) {
  const canon = createStoryEnvelope({ choices: selected, currentChapter: chapter,
    progress: { [chapter]: { sceneId: chapter === 0 ? 'chapter_0/part_3_mothman/mothman_3' : 'chapter_1_v3/will', phase: 'credits', completed: true, line: 0,
      visited: chapter === 0 ? ['hardware_store', 'telepathy_tent', 'arcade', 'forest'] : [] } }
  }, STORY_REGISTRY).canon;
  return replayCanonicalSnapshot(chapter, canon, null, resources);
}
function envelope() {
  const zero = completed(0), one = completed(1);
  return createStoryEnvelope({ choices: baseChoices, currentChapter: 1,
    progress: { 0: progressFromSnapshot(zero), 1: progressFromSnapshot(one) }, snapshots: { 0: zero, 1: one }
  }, STORY_REGISTRY);
}

test('registry preserves released IDs, traced effects, requirements and rejoining graph metadata', () => {
  assert.deepEqual(STORY_REGISTRY.choices.filter(choice => choice.chapterId < 2).map(choice => choice.id), Object.keys(baseChoices));
  assert.deepEqual(STORY_REGISTRY.choices.filter(choice => choice.chapterId === 2).map(choice => choice.id), ['ch2.trail_focus', 'ch2.threat_plan', 'ch2.creature_fate']);
  assert.deepEqual(decisionForNode(1, 'descent_pacifica'), { choiceId: 'ch1.slope', optionId: 'Pacifica' });
  assert.deepEqual(decisionForNode(1, 'cafe_wendigo'), { choiceId: 'ch0.creature', optionId: 'Wendigo' });
  const node = STORY_REGISTRY.graphs[1].nodes.find(node => node.id === 'tracks_search');
  assert.equal(node.rejoinNode, 'animals'); assert.ok(node.parents.includes('tracks'));
  assert.ok(node.effects.some(effect => effect.type === 'item' && effect.key === 'cloth_scrap'));
  const story = envelope();
  assert.equal(story.canon.derived.relationships.pacifica_gideon.total, 2);
  assert.deepEqual(story.canon.derived.inventory.cloth_scrap.sources, ['ch1.tracks.Search']);
});

test('choices boundary reads real engine flags and never discovery/history guesses', () => {
  const snapshot = completed(1), selected = choicesFromSnapshot(snapshot);
  assert.deepEqual(selected, baseChoices);
  snapshot.flags = {}; snapshot.history.push({ script: 'chapter_1_v3/tracks_search' });
  assert.deepEqual(choicesFromSnapshot(snapshot), {});
  assert.deepEqual(choicesFromSnapshot({ ...snapshot, script: 'chapter_1_v2/start', flags: { monster: 'Werewolf' } }), {});
});

test('reconciliation removes stale counters/items but does not inject later choices before their scene', () => {
  const story = envelope();
  const early = createCanonicalFlowJump({ ...resources, chapter: 1, nodeId: 'reason', canon: story.canon });
  early.flags.extra_clue_01 = true; early.flags.pacifica_gideon_trust = 900; early.inventory.push('cloth_scrap');
  const fixed = reconcileSnapshot(early, story.canon);
  assert.equal(fixed.flags.monster, 'Vampire'); assert.equal(fixed.flags.reason, undefined);
  assert.equal(fixed.flags.tracks, undefined); assert.equal(fixed.flags.ending, undefined);
  assert.equal(fixed.flags.extra_clue_01, false); assert.equal(fixed.flags.pacifica_gideon_trust, 0);
  assert.deepEqual(fixed.inventory, ['journal_3']); validateSnapshot(fixed);
  const full = completed(1); full.flags.pacifica_gideon_trust = 900; full.flags.chapter1_bold_end = true;
  const fixedFull = reconcileSnapshot(full, story.canon);
  assert.equal(fixedFull.flags.pacifica_gideon_trust, 2); assert.equal(fixedFull.flags.chapter1_bold_end, false);
});

test('canonical flow path ignores poisoned history and shows only explicit selected branches', () => {
  const story = envelope();
  story.snapshots[1].history = [{ script: 'chapter_1_v3/tracks_bold' }, { script: 'chapter_1_v3/reason_deflect' }];
  const snapshot = canonicalFlowSnapshot(1, story.canon, story.snapshots);
  const view = flowView(1, null, snapshot);
  assert.ok(view.nodes.find(node => node.id === 'tracks_search').inPath);
  assert.equal(view.nodes.find(node => node.id === 'tracks_bold').inPath, false);
  assert.equal(view.nodes.find(node => node.id === 'reason_deflect').inPath, false);
  assert.equal(view.completed, true);
});

test('all six creature rewrites replay real scripts and preserve independent chapter-one decisions', () => {
  for (const before of ['Werewolf', 'Wendigo', 'Vampire']) for (const after of ['Werewolf', 'Wendigo', 'Vampire']) {
    if (before === after) continue;
    const old = envelope(); old.canon.choices['ch0.creature'] = before;
    old.canon.derived = deriveStoryState(old.canon, STORY_REGISTRY);
    const candidate = structuredClone(old); candidate.canon.choices['ch0.creature'] = after;
    const rebuilt = rebuildSnapshotsForRewrite(candidate, old, resources);
    assert.equal(rebuilt.snapshots[0].flags.monster, after);
    assert.equal(rebuilt.snapshots[1].flags.monster, after);
    assert.equal(rebuilt.snapshots[1].phase, 'credits');
    assert.deepEqual(choicesFromSnapshot(rebuilt.snapshots[1]), { ...baseChoices, 'ch0.creature': after });
    assert.ok(rebuilt.snapshots[1].history.some(row => row.script.endsWith(`/cafe_${after.toLowerCase()}`)));
    assert.equal(validateStoryEnvelope(rebuilt, STORY_REGISTRY, { validateSnapshot }).valid, true);
    assert.deepEqual(rebuilt.snapshots[0].visited, ['hardware_store', 'telepathy_tent', 'arcade', 'forest']);
  }
});

test('rewriting clue branch removes only its item and modifier sources while preserving later ending', () => {
  const old = envelope(), candidate = structuredClone(old);
  candidate.canon.choices['ch1.tracks'] = 'Journal'; candidate.canon.choices['ch1.gideon_reason'] = 'Deflect';
  const rebuilt = rebuildSnapshotsForRewrite(candidate, old, resources), flags = rebuilt.snapshots[1].flags;
  assert.equal(flags.extra_clue_01, false); assert.equal(flags.journal_doubt, 1);
  assert.equal(flags.pacifica_gideon_trust, 1); assert.equal(flags.ending, 'Observation');
  assert.deepEqual(rebuilt.snapshots[1].inventory, ['journal_3']);
  assert.equal(rebuilt.canon.derived.inventory.cloth_scrap, undefined);
});

test('explicit canonical flow jumps do not infer earlier decisions from legacy snapshots', () => {
  const story = envelope(); story.canon.choices['ch1.gideon_reason'] = 'Curiosity';
  const jump = createCanonicalFlowJump({ ...resources, chapter: 1, nodeId: 'tracks', canon: story.canon, snapshots: story.snapshots });
  assert.equal(jump.flags.reason, 'Curiosity'); assert.equal(jump.flags.monster, 'Vampire');
  assert.equal(jump.flags.tracks, undefined); assert.equal(jump.flags.ending, undefined);
});

test('legacy migration never guesses canon from discovery and preserves input recovery copy', () => {
  const chapter0 = completed(0), chapter1 = completed(1), original = JSON.stringify({ chapter0, chapter1 });
  const migrated = migrateLegacyStory({ chapter0, chapter1, currentChapter: 1, validateSnapshot,
    discovery: { version: 3, chapters: { 0: { nodes: ['werewolf', 'wendigo', 'vampire'], edges: [] }, 1: { nodes: ['tracks_bold'], edges: [] } } }
  });
  assert.deepEqual(migrated.canon.choices, baseChoices);
  assert.ok(migrated.discovery.chapters[0].nodes.includes('werewolf'));
  assert.equal(migrated.backups[0].reason, 'legacy_migration');
  assert.equal(JSON.stringify({ chapter0, chapter1 }), original);
  assert.equal(validateStoryEnvelope(migrated, STORY_REGISTRY, { validateSnapshot }).valid, true);
});

test('conflicting creature saves are replayed consistently and invalid paths retained only in backup', () => {
  const chapter0 = completed(0, { ...baseChoices, 'ch0.creature': 'Werewolf' }), chapter1 = completed(1);
  const migrated = migrateLegacyStory({ chapter0, chapter1, currentChapter: 1, validateSnapshot,
    replay: (chapter, canon, snapshot) => replayCanonicalSnapshot(chapter, canon, snapshot, resources) });
  assert.equal(migrated.canon.choices['ch0.creature'], 'Vampire');
  assert.equal(migrated.snapshots[0].flags.monster, 'Vampire'); assert.ok(migrated.warnings.length);
  const broken = migrateLegacyStory({ chapter0: { ...chapter0, script: 'chapter_0/missing' }, validateSnapshot });
  assert.equal(broken.snapshots[0], undefined); assert.ok(broken.warnings.length);
  assert.equal(broken.backups[0].legacy.chapter0.script, 'chapter_0/missing');
});

test('empty new game produces valid separate domains without manufacturing a selected creature', () => {
  const migrated = migrateLegacyStory();
  assert.deepEqual(migrated.canon.choices, {}); assert.deepEqual(migrated.snapshots, {});
  assert.deepEqual(migrated.canon.derived.inventory, {});
  assert.equal(validateStoryEnvelope(migrated, STORY_REGISTRY).valid, true);
});

test('migration does not merge future decisions from an older completed campaign into an early manual save', () => {
  const story = envelope();
  const early = createCanonicalFlowJump({ ...resources, chapter: 1, nodeId: 'reason', canon: story.canon });
  const full = completed(1);
  const campaign = { version: 2, chapters: {
    0: { completed: true, monster: 'Vampire' },
    1: { completed: true, monster: 'Vampire', ending: 'Observation', flags: full.flags, inventory: full.inventory }
  } };
  const migrated = migrateLegacyStory({ chapter1: early, campaign, currentChapter: 1, validateSnapshot });
  assert.deepEqual(migrated.canon.choices, { 'ch0.creature': 'Vampire' });
  assert.equal(migrated.canon.derived.inventory.cloth_scrap, undefined);
  assert.equal(migrated.canon.progress[1].completed, false);
});

test('unreplayable paragraph positions fall back to their scene entry instead of skipping to an ending', () => {
  const old = envelope(), candidate = structuredClone(old);
  candidate.canon.progress[1] = { sceneId: 'chapter_1_v3/reason_openness', line: 99999, phase: 'dialogue', completed: false, visited: [] };
  const rebuilt = rebuildSnapshotsForRewrite(candidate, old, resources);
  assert.equal(rebuilt.snapshots[1].script, 'chapter_1_v3/reason_openness');
  assert.equal(rebuilt.snapshots[1].phase, 'dialogue'); assert.ok(rebuilt.snapshots[1].line < 99999);
  assert.equal(rebuilt.snapshots[1].history.filter(row => row.script === 'chapter_1_v3/reason_openness').length, 1);
});

test('unavailable original-language creature routes fail instead of forging contradictory snapshots', () => {
  const story = envelope(); story.canon.choices['ch0.creature'] = 'Werewolf';
  story.snapshots[0].language = 'french';
  assert.throws(() => rebuildSnapshotsForRewrite(story, story, resources), /original script.*creature/i);
});

test('one hundred chapter cursors keep only current and latest cache entries without touching compact progress', () => {
  const snapshots = Object.fromEntries(Array.from({ length: 100 }, (_, chapter) => [chapter, { chapter, history: [{ text: 'A long chapter history' }] }]));
  const cached = boundSnapshotCache(snapshots, 4);
  assert.deepEqual(Object.keys(cached), ['4', '99']);
  cached[4].history[0].text = 'changed';
  assert.equal(snapshots[4].history[0].text, 'A long chapter history');
  assert.equal(Object.keys(boundSnapshotCache(snapshots, 4, 1)).length, 1);
  assert.equal(Object.keys(snapshots).length, 100);
});

test('evicted cursors preserve compact progress and rebuild lazily with the canonical creature', () => {
  const old = envelope(); delete old.snapshots[0];
  old.canon.progress[0] = { sceneId: 'chapter_0/part_1_intro/intro_2_vampire', line: 70, phase: 'dialogue', completed: false, visited: [], language: 'english' };
  const candidate = structuredClone(old); candidate.canon.choices['ch0.creature'] = 'Wendigo';
  const rebuilt = rebuildSnapshotsForRewrite(candidate, old, resources);
  assert.deepEqual(Object.keys(rebuilt.snapshots), ['1']);
  assert.equal(rebuilt.canon.progress[0].sceneId, 'chapter_0/part_1_intro/intro_2_wendigo');
  assert.equal(rebuilt.canon.progress[0].line, 0);
  assert.equal(rebuilt.canon.choices['ch1.ending'], 'Observation');
  const restored = replayCanonicalSnapshot(0, rebuilt.canon, null, resources);
  assert.equal(restored.script, 'chapter_0/part_1_intro/intro_2_wendigo');
  assert.equal(restored.flags.monster, 'Wendigo');
  validateSnapshot(restored);
});

test('lazy replay remembers the cursor language after the full snapshot is evicted', () => {
  const old = envelope(); old.canon.progress[1].language = 'russian';
  const restored = replayCanonicalSnapshot(1, old.canon, null, resources);
  assert.equal(restored.language, 'russian'); assert.equal(restored.phase, 'credits');
  assert.equal(progressFromSnapshot(restored).language, 'russian');
});
