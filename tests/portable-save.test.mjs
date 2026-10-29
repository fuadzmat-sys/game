import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_KEY, CANON_SAVE_FORMAT, createStoryStateService, createStoryEnvelope } from '../story-state.js';

const copy = value => JSON.parse(JSON.stringify(value));
const registry = {
  chapterIds: [0, 1], relationshipBases: { friends: 0 },
  choices: [
    { id: 'ch0.creature', chapterId: 0, options: ['Vampire', 'Werewolf', 'Wendigo'].map(id => ({ id, effects: [{ type: 'flag', key: 'creature', value: id }] })) },
    { id: 'ch1.search', chapterId: 1, options: [
      { id: 'Pass', effects: [] },
      { id: 'Inspect', effects: [
        { type: 'flag', key: 'clue_found', value: true }, { type: 'relationship', key: 'friends', value: 2 },
        { type: 'item', key: 'cloth' }, { type: 'knowledge', character: 'gideon', key: 'suspicious_cloth' },
        { type: 'quest', key: 'investigate', value: 'active' }
      ] }
    ] }
  ]
};
function setup(choices = { 'ch0.creature': 'Vampire' }, options = {}) {
  const data = new Map();
  const storage = {
    data, fail: null, writes: [],
    get(key) { return data.has(key) ? copy(data.get(key)) : null; },
    set(key, value) { this.writes.push(key); if (this.fail?.(key)) return false; data.set(key, copy(value)); return true; }
  };
  const service = createStoryStateService({ storage, registry, ...options });
  service.init(createStoryEnvelope({ choices }, registry));
  return { service, storage };
}
function unchanged(service, storage, operation) {
  const before = service.getState(), saved = storage.get(STORY_KEY);
  assert.throws(operation);
  assert.deepEqual(service.getState(), before);
  assert.deepEqual(storage.get(STORY_KEY), saved);
}

test('export reflects only official canon, independently of all discovered creatures', () => {
  const { service } = setup();
  service.recordDiscovery({ seen: ['Werewolf', 'Wendigo', 'Vampire'] });
  const saved = service.exportSave();
  assert.equal(saved.format, CANON_SAVE_FORMAT);
  assert.equal(saved.saveFormatVersion, 1);
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.gameVersion, '3.1.0');
  assert.ok(Number.isFinite(Date.parse(saved.exportedAt)));
  assert.equal(saved.canon.choices['ch0.creature'], 'Vampire');
  assert.equal('discovery' in saved, false);
  saved.canon.choices['ch0.creature'] = 'Werewolf';
  assert.equal(service.getChoice('ch0.creature'), 'Vampire');
});

test('alternative creature, flags, relationship, knowledge, quests and items never leak into export', () => {
  const { service } = setup();
  const official = service.exportSave();
  const temporary = service.getCanon();
  temporary.choices = { 'ch0.creature': 'Werewolf', 'ch1.search': 'Inspect' };
  service.createAlternativeSession({ canon: temporary });
  assert.equal(service.hasItem('cloth', { alternative: true }), true);
  assert.equal(service.getRelationship('friends', { alternative: true }), 2);
  assert.deepEqual(service.exportSave().canon, official.canon);
  assert.deepEqual(service.exportSave().snapshots, official.snapshots);
  service.exitAlternative();
  assert.deepEqual(service.exportSave().canon, official.canon);
});

test('a successful rewrite immediately changes the exported canon', () => {
  const { service } = setup();
  service.rewriteCanonFrom('ch0.creature', 'Werewolf');
  assert.equal(service.exportSave().canon.choices['ch0.creature'], 'Werewolf');
  assert.equal(service.exportSave().canon.derived.flags.creature.value, 'Werewolf');
});

test('portable roundtrip preserves official effects, progress and snapshots through reload with recovery', () => {
  const { service, storage } = setup({ 'ch0.creature': 'Vampire', 'ch1.search': 'Inspect' });
  service.updateCanonical({ currentChapter: 1, progress: { 1: { sceneId: 'chapter1/end', line: 42, completed: true } }, snapshots: { 1: { script: 'chapter1/end', line: 42 } } });
  service.recordDiscovery({ seen: ['local-before'] });
  const saved = service.exportSave();
  service.rewriteCanonFrom('ch0.creature', 'Wendigo');
  service.recordDiscovery({ seen: ['local-before', 'local-after'] });
  const beforeImport = service.getCanon();
  const preview = service.previewImport(JSON.stringify(saved));
  assert.deepEqual(service.getCanon(), beforeImport, 'preview is read only');
  assert.deepEqual(preview.canon, saved.canon);
  service.importSave(JSON.stringify(saved));
  assert.deepEqual(service.getCanon(), saved.canon);
  assert.deepEqual(service.getState().snapshots, saved.snapshots);
  assert.deepEqual(service.getState().discovery.seen, ['local-before', 'local-after']);
  const loaded = createStoryStateService({ storage, registry }); loaded.init();
  assert.deepEqual(loaded.getCanon(), saved.canon);
  loaded.rollback();
  assert.deepEqual(loaded.getCanon(), beforeImport);
});

test('invalid imports including stale effects and forged sources never publish', () => {
  const { service, storage } = setup();
  const file = service.exportSave();
  const cases = [
    '{broken', null, [],
    { ...file, format: 'another-game' },
    { ...file, saveFormatVersion: 99 },
    { ...file, schemaVersion: 99 },
    { ...file, schemaVersion: 2, canon: { ...file.canon, schemaVersion: 2 } },
    { ...file, gameVersion: '' },
    { ...file, exportedAt: 'invalid-date' },
    { ...file, canon: { ...file.canon, choices: { 'unknown.choice': 'x' } } },
    { ...file, canon: { ...file.canon, choices: { 'ch0.creature': 'Unknown' } } },
    { ...file, canon: { ...file.canon, choices: { 'ch0.creature': ['Vampire', 'Werewolf'] } } },
    { ...file, canon: { ...file.canon, currentChapter: 100 } },
    { ...file, canon: { ...file.canon, derived: { ...file.canon.derived, inventory: { injected: { sources: ['fake'] } } } } },
    { ...file, canon: { ...file.canon, derived: { ...file.canon.derived, flags: { creature: { value: 'Vampire', source: 'fake', sources: [{ source: 'fake', value: 'Vampire' }] } } } } },
    { ...file, snapshots: { 100: {} } }
  ];
  for (const value of cases) unchanged(service, storage, () => service.importSave(value));
});

test('conflicting mutually-exclusive effects are rejected before commit', () => {
  const conflicting = copy(registry);
  conflicting.choices.push({ id: 'conflict', chapterId: 0, options: [{ id: 'Yes', effects: [{ type: 'flag', key: 'creature', value: 'Werewolf' }] }] });
  const { service, storage } = setup(undefined, { registry: conflicting });
  const saved = service.exportSave(); saved.canon.choices.conflict = 'Yes';
  unchanged(service, storage, () => service.importSave(saved));
});

test('checkpoint or primary-write failure preserves state and active alternative', () => {
  for (const failure of ['recovery', 'primary']) {
    const { service, storage } = setup();
    const saved = service.exportSave();
    service.rewriteCanonFrom('ch0.creature', 'Wendigo');
    const temporary = service.getCanon(); temporary.choices['ch0.creature'] = 'Werewolf';
    service.createAlternativeSession({ canon: temporary });
    storage.fail = key => failure === 'recovery' ? key.endsWith(':recovery') : key === STORY_KEY;
    unchanged(service, storage, () => service.importSave(saved));
    assert.equal(service.getAlternativeSession().canon.choices['ch0.creature'], 'Werewolf');
  }
});

test('successful import discards the temporary session only after commit', () => {
  const { service } = setup();
  const saved = service.exportSave();
  service.rewriteCanonFrom('ch0.creature', 'Wendigo');
  service.createAlternativeSession();
  service.importSave(saved);
  assert.equal(service.getAlternativeSession(), null);
  assert.equal(service.getChoice('ch0.creature'), 'Vampire');
});

test('synchronous preparation is fully validated and failures preserve the previous story', () => {
  const { service, storage } = setup(); const saved = service.exportSave();
  unchanged(service, storage, () => service.importSave(saved, { prepare() { throw new Error('Replay failed'); } }));
  unchanged(service, storage, () => service.importSave(saved, { prepare(candidate) { candidate.canon.derived.inventory.injected = { sources: ['bad'] }; } }));
  unchanged(service, storage, () => service.importSave(saved, { prepare: async () => {} }));
  unchanged(service, storage, () => service.importSave(saved, { prepare: () => ({}) }));
  service.importSave(saved, { prepare(candidate) { candidate.snapshots = {}; } });
  assert.equal(service.getChoice('ch0.creature'), 'Vampire');
});

test('missing and malformed migrations fail; explicit sequential format/schema migrations succeed', () => {
  const source = setup().service.exportSave();
  const oldFormat = { ...source, saveFormatVersion: 0 };
  const missing = setup();
  unchanged(missing.service, missing.storage, () => missing.service.importSave(oldFormat));
  const malformed = setup(undefined, { portableMigrations: { 0: candidate => candidate } });
  unchanged(malformed.service, malformed.storage, () => malformed.service.importSave(oldFormat));
  const valid = setup(undefined, {
    portableMigrations: { 0: candidate => ({ ...candidate, saveFormatVersion: 1 }) },
    migrations: { 0: candidate => ({ ...candidate, schemaVersion: 1, canon: { ...candidate.canon, schemaVersion: 1 } }) }
  });
  valid.service.importSave({ ...oldFormat, schemaVersion: 0, canon: { ...source.canon, schemaVersion: 0 } });
  assert.deepEqual(valid.service.getCanon(), source.canon);
});

test('snapshot/progress adapters reject malformed scene state before any authoritative write', () => {
  const options = {
    validateProgress: progress => progress.sceneId === 'valid',
    validateSnapshot: snapshot => snapshot.script === 'valid'
  };
  const { service, storage } = setup(undefined, options);
  const saved = service.exportSave();
  unchanged(service, storage, () => service.importSave({ ...saved, snapshots: { 0: { script: 'bad' } } }));
  unchanged(service, storage, () => service.importSave({ ...saved, canon: { ...saved.canon, progress: { 0: { sceneId: 'bad' } } } }));
});

test('export and import require initialized state', () => {
  const service = createStoryStateService({ storage: { get: () => null, set: () => true }, registry });
  assert.throws(() => service.exportSave(), error => error.code === 'NOT_INITIALIZED');
  assert.throws(() => service.importSave(setup().service.exportSave()), error => error.code === 'NOT_INITIALIZED');
});
