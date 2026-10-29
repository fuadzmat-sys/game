import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORY_KEY, createStoryStateService, createStoryEnvelope,
  deriveStoryState, validateStoryEnvelope, migrateStoryEnvelope
} from '../story-state.js';

const copy = value => JSON.parse(JSON.stringify(value));
const registry = {
  chapterIds: [0, 1, 2, 28], relationshipBases: { pacifica_gideon: 0 },
  baseEffects: [{ type: 'item', key: 'journal_3', source: 'chapter1.start', chapterId: 1 }],
  choices: [
    { id: 'ch0.creature', chapterId: 0, options: ['Werewolf', 'Wendigo', 'Vampire'].map(id => ({ id, effects: [{ type: 'flag', key: 'creature', value: id }] })) },
    { id: 'ch1.reason', chapterId: 1, dependsOn: [], options: [
      { id: 'Deflect', effects: [{ type: 'counter', key: 'deflects', value: 1 }] },
      { id: 'Openness', effects: [{ type: 'counter', key: 'openness', value: 1 }, { type: 'relationship', key: 'pacifica_gideon', value: 1 }] }
    ] },
    { id: 'ch1.tracks', chapterId: 1, options: [
      { id: 'Bold', effects: [{ type: 'flag', key: 'bold', value: true }] },
      { id: 'Search', effects: [{ type: 'flag', key: 'extra_clue_01', value: true }, { type: 'item', key: 'dark_cloth' }, { type: 'knowledge', character: 'pacifica', key: 'cloth_found' }] }
    ] },
    { id: 'ch1.slope', chapterId: 1, options: [{ id: 'Pacifica', effects: [{ type: 'relationship', key: 'pacifica_gideon', value: 1 }] }] },
    { id: 'ch2.silver', chapterId: 2, dependsOn: ['ch0.creature'], requirements: [{ choiceId: 'ch0.creature', optionId: 'Werewolf' }], options: [{ id: 'Keep', effects: [{ type: 'item', key: 'silver' }] }] },
    { id: 'ch28.callback', chapterId: 28, dependsOn: ['ch2.silver'], requirements: [{ choiceId: 'ch2.silver', optionId: 'Keep' }], options: [{ id: 'Use', effects: [{ type: 'quest', key: 'silver_callback', value: 'resolved' }] }] }
  ]
};
function memory(initial = {}) {
  const data = new Map(Object.entries(copy(initial)));
  return { data, writes: [], fail: null,
    get(key) { return data.has(key) ? copy(data.get(key)) : null; },
    set(key, value) { this.writes.push(key); if (this.fail?.(key, value)) return false; data.set(key, copy(value)); return true; }
  };
}
function initialized(choices = { 'ch0.creature': 'Vampire' }) {
  const storage = memory(), service = createStoryStateService({ storage, registry });
  service.init(createStoryEnvelope({ choices }, registry));
  return { storage, service };
}

test('new story has one official empty timeline and a separately stored discovery object', () => {
  const storage = memory(), service = createStoryStateService({ storage, registry });
  const state = service.init();
  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.canon.choices, {});
  assert.equal(state.canon.currentChapter, 0);
  assert.deepEqual(state.discovery, {});
  assert.equal(service.validate().valid, true);
  assert.deepEqual(storage.get(STORY_KEY), state);
  const projected = service.getCanon(); projected.choices['ch0.creature'] = 'Werewolf';
  assert.equal(service.getChoice('ch0.creature'), null);
});

test('all effects retain their source and relationship totals are recomputed from modifiers', () => {
  const { service } = initialized();
  service.updateCanonical({ choices: { ...service.getCanon().choices, 'ch1.reason': 'Openness', 'ch1.tracks': 'Search', 'ch1.slope': 'Pacifica' } });
  const canon = service.getCanon();
  assert.equal(service.getRelationship('pacifica_gideon'), 2);
  assert.deepEqual(canon.derived.relationships.pacifica_gideon.modifiers.map(row => row.source), ['ch1.reason.Openness', 'ch1.slope.Pacifica']);
  assert.equal(canon.derived.flags.extra_clue_01.source, 'ch1.tracks.Search');
  assert.deepEqual(canon.derived.inventory.dark_cloth.sources, ['ch1.tracks.Search']);
  assert.equal(service.hasItem('journal_3'), true);
  assert.equal(service.characterKnows('pacifica', 'cloth_found'), true);
  assert.equal(service.characterKnows('gideon', 'cloth_found'), false);
  assert.equal(service.getCanonSummary().relationships.pacifica_gideon, 2);
});

test('discovery never supplies a canonical choice, even when it includes all three creatures', () => {
  const { service, storage } = initialized();
  const original = service.getCanon();
  service.recordDiscovery({ discoveredNodes: ['werewolf', 'wendigo', 'vampire'], seenSecret: true });
  assert.deepEqual(service.getCanon(), original);
  const loaded = createStoryStateService({ storage, registry }); loaded.init();
  assert.equal(loaded.getChoice('ch0.creature'), 'Vampire');
  assert.deepEqual(loaded.getState().discovery.discoveredNodes, ['werewolf', 'wendigo', 'vampire']);
});

test('alternative clues, relations, knowledge, snapshots and progress never leak after exit and reload', () => {
  const { service, storage } = initialized();
  service.updateCanonical({ progress: { 0: { sceneId: 'finale', completed: true } }, snapshots: { 0: { script: 'canon' } } });
  const canonical = service.getCanon(), snapshots = service.getState().snapshots;
  const temporary = copy(canonical); temporary.choices['ch0.creature'] = 'Werewolf';
  const session = service.createAlternativeSession({ canon: temporary, origin: { chapter: 0, nodeId: 'vampire' }, startNode: 'werewolf' });
  assert.equal(session.originSaveId, service.getState().metadata.saveId);
  service.updateAlternative({ choices: { 'ch0.creature': 'Werewolf', 'ch1.reason': 'Openness', 'ch1.tracks': 'Search' }, currentChapter: 1, progress: { 1: { sceneId: 'secret' } }, snapshots: { 1: { script: 'alternative' } } });
  assert.equal(service.hasItem('dark_cloth', { alternative: true }), true);
  assert.equal(service.hasItem('dark_cloth'), false);
  assert.equal(service.getRelationship('pacifica_gideon', { alternative: true }), 1);
  assert.equal(service.characterKnows('pacifica', 'cloth_found'), false);
  service.recordDiscovery({ discoveredNodes: ['werewolf', 'secret'] });
  assert.throws(() => service.updateCanonical({ choices: {} }), error => error.code === 'ALTERNATIVE_ACTIVE');
  assert.throws(() => service.rewriteCanonFrom('ch0.creature', 'Wendigo'), error => error.code === 'ALTERNATIVE_ACTIVE');
  assert.deepEqual(service.exitAlternative().origin, { chapter: 0, nodeId: 'vampire' });
  const loaded = createStoryStateService({ storage, registry }); loaded.init();
  assert.equal(loaded.getAlternativeSession(), null);
  assert.deepEqual(loaded.getCanon(), canonical);
  assert.deepEqual(loaded.getState().snapshots, snapshots);
  assert.deepEqual(loaded.getState().discovery.discoveredNodes, ['werewolf', 'secret']);
});

test('all six creature rewrites survive save/reload and preserve independent later choices', () => {
  for (const before of ['Werewolf', 'Wendigo', 'Vampire']) for (const after of ['Werewolf', 'Wendigo', 'Vampire']) {
    if (before === after) continue;
    const { service, storage } = initialized({ 'ch0.creature': before, 'ch1.reason': 'Openness', 'ch1.tracks': 'Search', 'ch1.slope': 'Pacifica' });
    service.rewriteCanonFrom('ch0.creature', after);
    assert.equal(service.getChoice('ch0.creature'), after);
    assert.equal(service.getChoice('ch1.reason'), 'Openness');
    assert.equal(service.getRelationship('pacifica_gideon'), 2);
    assert.equal(service.hasItem('dark_cloth'), true);
    const loaded = createStoryStateService({ storage, registry }); loaded.init();
    assert.equal(loaded.getChoice('ch0.creature'), after);
    assert.equal(loaded.validate().valid, true);
  }
});

test('rewrite recursively invalidates impossible requirements and removes only their sourced effects', () => {
  const { service } = initialized({ 'ch0.creature': 'Werewolf', 'ch1.reason': 'Openness', 'ch1.tracks': 'Search', 'ch2.silver': 'Keep', 'ch28.callback': 'Use' });
  assert.equal(service.hasItem('silver'), true);
  service.rewriteCanonFrom('ch0.creature', 'Wendigo');
  assert.equal(service.getChoice('ch2.silver'), null);
  assert.equal(service.getChoice('ch28.callback'), null);
  assert.equal(service.hasItem('silver'), false);
  assert.deepEqual(service.getCanon().derived.quests, {});
  assert.equal(service.hasItem('dark_cloth'), true);
  assert.equal(service.getRelationship('pacifica_gideon'), 1);
});

test('rewriting the clue branch clears derived knowledge and inventory without affecting unrelated trust', () => {
  const { service } = initialized({ 'ch0.creature': 'Vampire', 'ch1.reason': 'Openness', 'ch1.tracks': 'Search' });
  service.rewriteCanonFrom('ch1.tracks', 'Bold');
  assert.equal(service.hasItem('dark_cloth'), false);
  assert.equal(service.hasFlag('extra_clue_01'), false);
  assert.equal(service.characterKnows('pacifica', 'cloth_found'), false);
  assert.equal(service.getRelationship('pacifica_gideon'), 1);
});

test('rewrite preparation/validation failure publishes no partially changed official state', () => {
  const { service, storage } = initialized(), before = service.getState(), serialized = storage.get(STORY_KEY);
  assert.throws(() => service.rewriteCanonFrom('ch0.creature', 'Werewolf', { prepare(candidate) { candidate.canon.choices['ch1.reason'] = 'Unknown'; throw Error('replay failed'); } }), /replay failed/);
  assert.deepEqual(service.getState(), before);
  assert.deepEqual(storage.get(STORY_KEY), serialized);
  assert.throws(() => service.rewriteCanonFrom('ch0.creature', 'Werewolf', { prepare(candidate) { candidate.canon.currentChapter = 999; } }), error => ['INVALID_SAVE', 'INVALID_CANON'].includes(error.code));
  assert.deepEqual(service.getState(), before);
  assert.deepEqual(storage.get(STORY_KEY), serialized);
});

test('storage failures in backup and canonical publication leave the official state byte-equivalent', () => {
  for (const target of ['backup', 'primary']) {
    const { service, storage } = initialized(), before = service.getState(), serialized = storage.get(STORY_KEY);
    storage.fail = key => target === 'backup' ? key.endsWith(':recovery') : key === STORY_KEY;
    assert.throws(() => service.rewriteCanonFrom('ch0.creature', 'Werewolf'), error => error.code === 'STORAGE_WRITE_FAILED');
    assert.deepEqual(service.getState(), before);
    assert.deepEqual(storage.get(STORY_KEY), serialized);
  }
});

test('recovery checkpoints are durable, bounded, and restore a coherent timeline', () => {
  const { service, storage } = initialized();
  for (const option of ['Werewolf', 'Wendigo', 'Vampire', 'Werewolf', 'Wendigo']) service.rewriteCanonFrom('ch0.creature', option);
  assert.equal(storage.get(`${STORY_KEY}:recovery`).length, 3);
  assert.equal(service.getState().backups.length, 3);
  service.recordDiscovery({ discoveredNodes: ['ever-seen'] });
  service.rollback();
  assert.equal(service.getChoice('ch0.creature'), 'Werewolf');
  assert.deepEqual(service.getState().discovery.discoveredNodes, ['ever-seen']);
  const loaded = createStoryStateService({ storage, registry }); loaded.init();
  assert.equal(loaded.getChoice('ch0.creature'), 'Werewolf');
});

test('load repairs orphaned derived caches from primary choices, with backup and a visible warning', () => {
  const { service, storage } = initialized({ 'ch0.creature': 'Vampire', 'ch1.reason': 'Openness' });
  const damaged = service.getState();
  damaged.canon.derived.inventory.fake = { sources: ['absent.choice'] };
  damaged.canon.derived.relationships.pacifica_gideon.total = 99;
  storage.set(STORY_KEY, damaged);
  const loaded = createStoryStateService({ storage, registry }); loaded.init();
  assert.equal(loaded.hasItem('fake'), false);
  assert.equal(loaded.getRelationship('pacifica_gideon'), 1);
  assert.equal(loaded.validate().valid, true);
  assert.ok(loaded.getWarnings().some(message => /recalculated/.test(message)));
});

test('invalid primary choice rolls back to checkpoint rather than trusting cached derived facts', () => {
  const { service, storage } = initialized();
  service.rewriteCanonFrom('ch0.creature', 'Werewolf');
  const damaged = service.getState(); damaged.canon.choices['ch0.creature'] = 'VampireAndWerewolf'; storage.set(STORY_KEY, damaged);
  const loaded = createStoryStateService({ storage, registry }); loaded.init();
  assert.equal(loaded.getChoice('ch0.creature'), 'Vampire');
  assert.ok(loaded.getWarnings().some(message => /restored/.test(message)));
});

test('unknown options, chapters, scene validation and unsupported schemas are rejected explicitly', () => {
  const valid = createStoryEnvelope({ choices: { 'ch0.creature': 'Vampire' } }, registry);
  for (const mutate of [state => { state.canon.choices.unknown = 'X'; }, state => { state.canon.choices['ch0.creature'] = 'unknown'; }, state => { state.canon.currentChapter = 999; }]) {
    const bad = copy(valid); mutate(bad); assert.equal(validateStoryEnvelope(bad, registry).valid, false);
  }
  const storage = memory(), service = createStoryStateService({ storage, registry, validateSnapshot: snapshot => snapshot.script === 'known-scene' });
  service.init();
  assert.throws(() => service.updateCanonical({ snapshots: { 0: { script: 'missing-scene' } } }), error => error.code === 'INVALID_SAVE');
  const future = copy(valid); future.schemaVersion = 90;
  const unsupportedStorage = memory({ [STORY_KEY]: future });
  assert.throws(() => createStoryStateService({ storage: unsupportedStorage, registry }).init(), error => error.code === 'UNSUPPORTED_SCHEMA');
  assert.deepEqual(unsupportedStorage.get(STORY_KEY), future);
});

test('schema migrations advance consecutively and missing migrations never guess old fields', () => {
  const original = { schemaVersion: 0, choice: 'Vampire' };
  const migrated = migrateStoryEnvelope(original, { 0: input => createStoryEnvelope({ choices: { 'ch0.creature': input.choice } }, registry) });
  assert.equal(migrated.canon.choices['ch0.creature'], 'Vampire');
  assert.equal(original.schemaVersion, 0);
  assert.throws(() => migrateStoryEnvelope(original), error => error.code === 'MISSING_MIGRATION');
  assert.throws(() => migrateStoryEnvelope(original, { 0: input => input }), error => error.code === 'INVALID_MIGRATION');
});

test('schema migration archives the original format and can recover it through the registered migration', () => {
  const original = { schemaVersion: 0, choice: 'Vampire', rawLegacyEvidence: { preserved: true } };
  const storage = memory({ [STORY_KEY]: original });
  const migrations = { 0: input => createStoryEnvelope({ choices: { 'ch0.creature': input.choice } }, registry) };
  const service = createStoryStateService({ storage, registry, migrations });
  service.init();
  assert.deepEqual(storage.get(`${STORY_KEY}:recovery`).at(-1).envelope.rawLegacyEvidence, { preserved: true });
  assert.equal(storage.get(`${STORY_KEY}:recovery`).at(-1).envelope.schemaVersion, 0);
  const damaged = service.getState(); damaged.canon.choices['ch0.creature'] = 'invalid'; storage.set(STORY_KEY, damaged);
  const recovered = createStoryStateService({ storage, registry, migrations }); recovered.init();
  assert.equal(recovered.getChoice('ch0.creature'), 'Vampire');
  assert.equal(recovered.validate().valid, true);
});

test('migration publication failure preserves the original primary schema and does not initialize a new canon', () => {
  const original = { schemaVersion: 0, choice: 'Vampire' }, storage = memory({ [STORY_KEY]: original });
  const service = createStoryStateService({ storage, registry, migrations: { 0: input => createStoryEnvelope({ choices: { 'ch0.creature': input.choice } }, registry) } });
  storage.fail = key => key === STORY_KEY;
  assert.throws(() => service.init(), error => error.code === 'STORAGE_WRITE_FAILED');
  assert.deepEqual(storage.get(STORY_KEY), original);
  assert.equal(service.isInitialized(), false);
});

test('legacy conversion retains exact original chapter/campaign/discovery archives after service initialization', async () => {
  const { migrateLegacyStory, STORY_REGISTRY } = await import('../story-bridge.js');
  const legacy = {
    chapter0: { version: 1, script: 'chapter_0/part_1_intro/intro_2_vampire', line: 4, phase: 'dialogue', flags: { monster: 'Vampire' }, history: [], presentation: { camera: { zoom: 1 } } },
    chapter1: null, campaign: { version: 2, chapters: {} },
    discovery: { version: 3, chapters: { 0: { nodes: ['vampire'], edges: [] }, 1: { nodes: [], edges: [] } } }, currentChapter: 0
  };
  const initial = migrateLegacyStory(legacy), storage = memory();
  const service = createStoryStateService({ storage, registry: STORY_REGISTRY }); service.init(initial);
  assert.deepEqual(service.getState().metadata.legacyArchive, legacy);
  assert.deepEqual(storage.get(`${STORY_KEY}:recovery`).at(-1).envelope.metadata.legacyArchive, legacy);
  assert.equal(service.getChoice('ch0.creature'), 'Vampire');
});

test('a future save is never replaced by an older recovery schema', () => {
  const { service, storage } = initialized(); service.rewriteCanonFrom('ch0.creature', 'Werewolf');
  const future = service.getState(); future.schemaVersion = 90; storage.set(STORY_KEY, future);
  assert.throws(() => createStoryStateService({ storage, registry }).init(), error => error.code === 'UNSUPPORTED_SCHEMA');
  assert.deepEqual(storage.get(STORY_KEY), future);
});

test('queries ignore prototype names and a missing primary can be restored without choosing from discovery', () => {
  const { service, storage } = initialized();
  assert.equal(service.getChoice('constructor'), null);
  assert.equal(service.getChoice('__proto__'), null);
  service.recordDiscovery({ discoveredNodes: ['werewolf'] });
  storage.data.delete(STORY_KEY);
  const recovered = createStoryStateService({ storage, registry }); recovered.init();
  assert.equal(recovered.getChoice('ch0.creature'), 'Vampire');
  assert.ok(recovered.getWarnings().some(warning => /missing or unreadable/.test(warning)));
});

test('unknown dependency declarations reset to a safe chapter boundary and remove unsafe snapshots', () => {
  const uncertainRegistry = copy(registry);
  uncertainRegistry.choices.find(choice => choice.id === 'ch1.reason').dependenciesKnown = false;
  const storage = memory(), service = createStoryStateService({ storage, registry: uncertainRegistry });
  service.init(createStoryEnvelope({ choices: { 'ch0.creature': 'Vampire', 'ch1.reason': 'Openness' }, progress: { 1: { sceneId: 'old' } }, snapshots: { 1: { script: 'old' } } }, uncertainRegistry));
  service.rewriteCanonFrom('ch0.creature', 'Werewolf');
  assert.equal(service.getChoice('ch1.reason'), null);
  assert.equal(service.getCanon().currentChapter, 1);
  assert.equal(service.getState().snapshots[1], undefined);
});

test('independent slots have independent official choices, discovery and temporary sessions', () => {
  const storage = memory(), first = createStoryStateService({ storage, registry, key: 'slot.first' }), second = createStoryStateService({ storage, registry, key: 'slot.second' });
  first.init(createStoryEnvelope({ choices: { 'ch0.creature': 'Vampire' } }, registry));
  second.init(createStoryEnvelope({ choices: { 'ch0.creature': 'Werewolf' } }, registry));
  first.recordDiscovery({ discoveredNodes: ['secret'] });
  first.createAlternativeSession();
  assert.equal(second.getAlternativeSession(), null);
  assert.deepEqual(second.getState().discovery, {});
  assert.equal(second.getChoice('ch0.creature'), 'Werewolf');
  assert.equal(first.getChoice('ch0.creature'), 'Vampire');
});

test('normal updates replace provided maps and destructive restart keeps an explicit recovery checkpoint', () => {
  const { service } = initialized({ 'ch0.creature': 'Vampire', 'ch1.reason': 'Openness' });
  const backupCount = service.getState().backups.length;
  service.updateCanonical({ choices: {}, progress: {}, snapshots: {}, currentChapter: 0 }, 'new game', { checkpoint: true });
  assert.deepEqual(service.getCanon().choices, {});
  assert.equal(service.getState().backups.length, backupCount + 1);
  service.rollback();
  assert.equal(service.getChoice('ch1.reason'), 'Openness');
});

test('current-scene validation checks chapter progress even when no engine snapshot is present', () => {
  const storage = memory();
  const validateProgress = (progress, chapter, canon) => {
    assert.equal(chapter, 0);
    assert.equal(canon.currentChapter, 0);
    return progress.sceneId === 'known-scene' ? true : { valid: false, errors: ['The scene is not a registered story resource.'] };
  };
  const service = createStoryStateService({ storage, registry, validateProgress }); service.init();
  const before = service.getState();
  assert.throws(() => service.updateCanonical({ progress: { 0: { sceneId: 'fake' } }, snapshots: {} }), error => error.code === 'INVALID_SAVE' && error.details.some(detail => /current scene/.test(detail)));
  assert.deepEqual(service.getState(), before);
  assert.deepEqual(storage.get(STORY_KEY), before);
  service.updateCanonical({ progress: { 0: { sceneId: 'known-scene' } } });
  assert.equal(service.validate().valid, true);
  const invalid = service.getState(); invalid.canon.progress[0].sceneId = 'fake';
  assert.equal(validateStoryEnvelope(invalid, registry, { validateProgress }).valid, false);
});

test('load rejects an unknown snapshotless current scene and restores a validated recovery checkpoint', () => {
  const storage = memory(), validateProgress = progress => progress.sceneId === 'known-scene';
  const service = createStoryStateService({ storage, registry, validateProgress });
  service.init(createStoryEnvelope({ choices: { 'ch0.creature': 'Vampire' }, progress: { 0: { sceneId: 'known-scene' } } }, registry));
  const invalid = service.getState(); invalid.canon.progress[0].sceneId = 'missing-resource'; storage.set(STORY_KEY, invalid);
  const loaded = createStoryStateService({ storage, registry, validateProgress }); loaded.init();
  assert.equal(loaded.getCanon().progress[0].sceneId, 'known-scene');
  assert.equal(loaded.getChoice('ch0.creature'), 'Vampire');
  assert.ok(loaded.getWarnings().some(message => /restored/.test(message)));
});

test('registered progress validators are runtime-only and exceptions cannot publish invalid progress', () => {
  const guardedRegistry = { ...registry, validateProgress(progress) { if (progress.sceneId !== 'safe') throw Error('Unknown scene'); return true; } };
  const storage = memory(), service = createStoryStateService({ storage, registry: guardedRegistry }); service.init();
  service.updateCanonical({ progress: { 0: { sceneId: 'safe' } } });
  const before = storage.get(STORY_KEY);
  assert.throws(() => service.updateCanonical({ progress: { 0: { sceneId: 'unsafe' } } }), error => error.code === 'INVALID_SAVE');
  assert.deepEqual(storage.get(STORY_KEY), before);
  assert.equal(JSON.stringify(before).includes('validateProgress'), false);
});

test('malformed primary data is preserved when no recovery exists and recovered when a checkpoint exists', () => {
  const malformed = '{incomplete-json';
  const empty = memory({ [STORY_KEY]: malformed });
  assert.throws(() => createStoryStateService({ storage: empty, registry }).init(), error => error.code === 'INVALID_SAVE');
  assert.equal(empty.get(STORY_KEY), malformed);
  const { service, storage } = initialized();
  service.rewriteCanonFrom('ch0.creature', 'Werewolf'); storage.set(STORY_KEY, malformed);
  const recovered = createStoryStateService({ storage, registry }); recovered.init();
  assert.equal(recovered.getChoice('ch0.creature'), 'Vampire');
  assert.equal(recovered.validate().valid, true);
});

test('technical cursor metadata follows canon and mutation logs record stable choice sources', () => {
  const { service, storage } = initialized();
  assert.equal(service.getState().metadata.currentChapter, 0);
  assert.equal(service.getState().metadata.sceneId, null);
  service.updateCanonical({ choices: { ...service.getCanon().choices, 'ch1.reason': 'Openness' }, currentChapter: 1, progress: { 1: { sceneId: 'chapter_1_v3/reason_openness' } } });
  const saved = service.getState();
  assert.equal(saved.metadata.currentChapter, 1);
  assert.equal(saved.metadata.sceneId, 'chapter_1_v3/reason_openness');
  assert.deepEqual(saved.log.at(-1).changedChoices, [{ choiceId: 'ch1.reason', from: null, to: 'Openness', source: 'ch1.reason.Openness', removed: false }]);
  const stale = copy(saved); stale.metadata.currentChapter = 0; stale.metadata.sceneId = 'old-cache'; storage.set(STORY_KEY, stale);
  const repaired = createStoryStateService({ storage, registry }); repaired.init();
  assert.equal(repaired.getChoice('ch1.reason'), 'Openness');
  assert.equal(repaired.getState().metadata.currentChapter, 1);
  assert.equal(repaired.getState().metadata.sceneId, 'chapter_1_v3/reason_openness');
  assert.ok(repaired.getWarnings().length);
  const older = repaired.getState(); delete older.metadata.currentChapter; delete older.metadata.sceneId;
  assert.equal(validateStoryEnvelope(older, registry).valid, true);
});
