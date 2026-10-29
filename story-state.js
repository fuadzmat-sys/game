/** The only writer of official story data. Discovery and replay sessions are not canon. */
export const STORY_KEY = 'reverse-falls-canon-story-v1';
export const STORY_SCHEMA_VERSION = 1;
export const CANON_SAVE_FORMAT = 'reverse-falls-canon-save';
export const CANON_SAVE_FORMAT_VERSION = 1;
const RECOVERY_KEY = `${STORY_KEY}:recovery`;
const BACKUP_LIMIT = 3, LOG_LIMIT = 80;
const clone = value => JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const safeKey = key => typeof key === 'string' && key.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stamp = () => new Date().toISOString();
let sequence = 0;
const identifier = prefix => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const cursorMetadata = canon => ({ currentChapter: canon.currentChapter, sceneId: canon.progress?.[canon.currentChapter]?.sceneId ?? null });

export class StoryStateError extends Error {
  constructor(message, code = 'STORY_STATE_ERROR', details = []) {
    super(message);
    this.name = 'StoryStateError'; this.code = code; this.details = details;
  }
}

function registryData(registry) {
  if (!record(registry) || !Array.isArray(registry.choices) || !Array.isArray(registry.chapterIds) || !registry.chapterIds.length) throw new StoryStateError('Invalid story registry.', 'INVALID_REGISTRY');
  const choices = new Map();
  for (const definition of registry.choices) {
    if (!record(definition) || !safeKey(definition.id) || choices.has(definition.id) || !registry.chapterIds.includes(definition.chapterId) || !Array.isArray(definition.options) || !definition.options.length) throw new StoryStateError('Invalid or duplicate story choice registration.', 'INVALID_REGISTRY');
    const options = new Map();
    for (const option of definition.options) {
      if (!record(option) || !safeKey(option.id) || options.has(option.id)) throw new StoryStateError('Invalid or duplicate story option registration.', 'INVALID_REGISTRY');
      options.set(option.id, option);
    }
    choices.set(definition.id, { ...definition, options });
  }
  for (const choice of choices.values()) {
    for (const dependency of choice.dependsOn || []) if (!choices.has(dependency)) throw new StoryStateError(`Unknown story dependency: ${dependency}`, 'INVALID_REGISTRY');
  }
  return { choices, chapters: registry.chapterIds };
}

function requirementsMet(requirements = [], choices) {
  if (!Array.isArray(requirements)) return false;
  return requirements.every(requirement => {
    if (!record(requirement) || !safeKey(requirement.choiceId)) return false;
    const selected = choices[requirement.choiceId];
    if (own(requirement, 'optionId')) return selected === requirement.optionId;
    if (Array.isArray(requirement.optionIds)) return requirement.optionIds.includes(selected);
    if (own(requirement, 'notOptionId')) return selected !== undefined && selected !== requirement.notOptionId;
    return selected !== undefined;
  });
}

function canonicalErrors(canon, registry, { derived = true } = {}) {
  const errors = [], { choices, chapters } = registryData(registry);
  if (!record(canon) || canon.schemaVersion !== STORY_SCHEMA_VERSION) return ['Unknown canonical story schema.'];
  if (!record(canon.choices) || !record(canon.progress)) return ['Missing canonical choices or progress.'];
  if (!chapters.includes(canon.currentChapter)) errors.push('Unknown current chapter.');
  for (const [id, selected] of Object.entries(canon.choices)) {
    const choice = choices.get(id), option = choice?.options.get(selected);
    if (!choice) { errors.push(`Unknown choice: ${id}`); continue; }
    if (!option) { errors.push(`Invalid option for ${id}`); continue; }
    if (!requirementsMet(choice.requirements, canon.choices) || !requirementsMet(option.requirements, canon.choices)) errors.push(`Unsatisfied choice requirements: ${id}`);
  }
  for (const [id, progress] of Object.entries(canon.progress)) {
    if (!chapters.some(chapter => String(chapter) === id) || !record(progress)) errors.push(`Unknown chapter progress: ${id}`);
    else if (progress.sceneId !== undefined && (typeof progress.sceneId !== 'string' || !progress.sceneId)) errors.push(`Invalid current scene: ${id}`);
  }
  if (derived && !errors.length) {
    try {
      const expected = deriveStoryState(canon, registry);
      if (!same(expected, canon.derived)) errors.push('Derived story state is stale or contains orphaned effects.');
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}

/** All durable facts are recomputed from selected IDs and sourced base effects. */
export function deriveStoryState(canon, registry) {
  const { choices } = registryData(registry);
  const errors = canonicalErrors(canon, registry, { derived: false });
  if (errors.length) throw new StoryStateError('The canonical story is invalid.', 'INVALID_CANON', errors);
  const result = { flags: {}, relationships: {}, inventory: {}, knowledge: {}, quests: {} };
  const apply = (effect, source) => {
    if (!record(effect) || !safeKey(effect.key) || !safeKey(source)) throw new StoryStateError('A story effect has no valid key or source.', 'INVALID_EFFECT');
    const key = effect.key, value = effect.value ?? true;
    if (!requirementsMet(effect.requirements, canon.choices)) return;
    if (effect.type === 'flag' || effect.type === 'counter') {
      const previous = result.flags[key];
      if (effect.type === 'counter') {
        if (!Number.isFinite(value) || previous && typeof previous.value !== 'number') throw new StoryStateError(`Invalid counter effect: ${key}`, 'INVALID_EFFECT');
        result.flags[key] = { value: (previous?.value || 0) + value, source, sources: [...(previous?.sources || []), { source, value }] };
      } else {
        if (typeof value !== 'boolean' && typeof value !== 'string' && !Number.isFinite(value)) throw new StoryStateError(`Invalid flag effect: ${key}`, 'INVALID_EFFECT');
        if (previous && previous.value !== value) throw new StoryStateError(`Contradictory flag effects: ${key}`, 'CONFLICTING_EFFECTS');
        result.flags[key] = { value, source, sources: [...(previous?.sources || []), { source, value }] };
      }
    } else if (effect.type === 'relationship') {
      if (!Number.isFinite(value)) throw new StoryStateError(`Invalid relationship effect: ${key}`, 'INVALID_EFFECT');
      const relationship = result.relationships[key] ||= { base: registry.relationshipBases?.[key] || 0, modifiers: [], total: registry.relationshipBases?.[key] || 0 };
      relationship.modifiers.push({ source, value }); relationship.total += value;
    } else if (effect.type === 'item') {
      if (value === false) return;
      const item = result.inventory[key] ||= { sources: [] };
      if (!item.sources.includes(source)) item.sources.push(source);
    } else if (effect.type === 'knowledge') {
      if (!safeKey(effect.character)) throw new StoryStateError('Character knowledge needs a character ID.', 'INVALID_EFFECT');
      if (value === false) return;
      const character = result.knowledge[effect.character] ||= {};
      const fact = character[key] ||= { sources: [] };
      if (!fact.sources.includes(source)) fact.sources.push(source);
    } else if (effect.type === 'quest') {
      const previous = result.quests[key];
      result.quests[key] = { value: clone(value), source, sources: [...(previous?.sources || []), { source, value: clone(value) }] };
    } else throw new StoryStateError(`Unknown effect type: ${effect.type}`, 'INVALID_EFFECT');
  };
  for (const [key, base] of Object.entries(registry.relationshipBases || {})) {
    if (!safeKey(key) || !Number.isFinite(base)) throw new StoryStateError('Invalid relationship base.', 'INVALID_REGISTRY');
    result.relationships[key] = { base, modifiers: [], total: base };
  }
  for (const effect of registry.baseEffects || []) {
    if (effect.chapterId !== undefined && !own(canon.progress, effect.chapterId) && ![...choices.values()].some(choice => choice.chapterId === effect.chapterId && own(canon.choices, choice.id))) continue;
    apply(effect, effect.source);
  }
  // Registration order, never insertion order in a loaded JSON, determines effects.
  for (const [id, definition] of choices) {
    if (!own(canon.choices, id)) continue;
    const selected = canon.choices[id], source = `${id}.${selected}`;
    for (const effect of definition.options.get(selected).effects || []) apply(effect, source);
  }
  return result;
}

export function createStoryEnvelope(input = {}, registry) {
  const now = stamp();
  const canon = input.canon ? clone(input.canon) : {
    schemaVersion: STORY_SCHEMA_VERSION, choices: clone(input.choices || {}),
    currentChapter: input.currentChapter ?? registry.chapterIds[0], progress: clone(input.progress || {})
  };
  canon.derived = deriveStoryState(canon, registry);
  return {
    schemaVersion: STORY_SCHEMA_VERSION, saveFormatVersion: 1,
    metadata: { saveId: identifier('story'), createdAt: now, updatedAt: now, gameVersion: '3.1.0', checkpoint: null, ...clone(input.metadata || {}), ...cursorMetadata(canon) },
    canon, discovery: clone(input.discovery || {}), snapshots: clone(input.snapshots || {}),
    backups: clone(input.backups || []), log: clone(input.log || [])
  };
}

export function validateStoryEnvelope(envelope, registry, { validateSnapshot, validateProgress = registry.validateProgress } = {}) {
  const errors = [];
  if (!record(envelope) || envelope.schemaVersion !== STORY_SCHEMA_VERSION || envelope.saveFormatVersion !== 1) return { valid: false, errors: ['Unknown save schema or format.'] };
  if (!record(envelope.metadata) || !safeKey(envelope.metadata.saveId) || typeof envelope.metadata.createdAt !== 'string' || typeof envelope.metadata.updatedAt !== 'string') errors.push('Invalid save metadata.');
  errors.push(...canonicalErrors(envelope.canon, registry));
  if (record(envelope.metadata) && record(envelope.canon)) {
    const expected = cursorMetadata(envelope.canon);
    // Missing fields in an earlier version-one save remain compatible; present caches must agree.
    if (own(envelope.metadata, 'currentChapter') && envelope.metadata.currentChapter !== expected.currentChapter) errors.push('Save metadata has an outdated current chapter.');
    if (own(envelope.metadata, 'sceneId') && envelope.metadata.sceneId !== expected.sceneId) errors.push('Save metadata has an outdated current scene.');
  }
  if (validateProgress && record(envelope.canon?.progress)) {
    for (const [chapter, progress] of Object.entries(envelope.canon.progress)) {
      const chapterId = registry.chapterIds.find(id => String(id) === chapter);
      if (chapterId === undefined || !record(progress)) continue;
      try {
        const result = validateProgress(clone(progress), chapterId, clone(envelope.canon));
        if (result === false || result?.valid === false) errors.push(`Invalid chapter progress or current scene: ${chapter}${result?.errors ? ` (${result.errors.join('; ')})` : ''}`);
      } catch (error) { errors.push(`Invalid chapter progress ${chapter}: ${error.message}`); }
    }
  }
  if (!record(envelope.discovery)) errors.push('Missing discovery state.');
  if (!record(envelope.snapshots)) errors.push('Missing chapter snapshots.');
  else for (const [chapter, snapshot] of Object.entries(envelope.snapshots)) {
    if (!registry.chapterIds.some(id => String(id) === chapter) || !record(snapshot)) { errors.push(`Invalid chapter snapshot: ${chapter}`); continue; }
    if (validateSnapshot) {
      try {
        const result = validateSnapshot(clone(snapshot), registry.chapterIds.find(id => String(id) === chapter), clone(envelope.canon));
        if (result === false || result?.valid === false) errors.push(`Invalid current scene or snapshot: ${chapter}${result?.errors ? ` (${result.errors.join('; ')})` : ''}`);
      } catch (error) { errors.push(`Invalid snapshot ${chapter}: ${error.message}`); }
    }
  }
  if (!Array.isArray(envelope.backups) || !Array.isArray(envelope.log)) errors.push('Invalid recovery metadata.');
  return { valid: !errors.length, errors };
}

/** Consecutive version migrations are registered explicitly; no unknown-version guessing. */
export function migrateStoryEnvelope(input, migrations = {}, targetVersion = STORY_SCHEMA_VERSION) {
  if (!record(input) || !Number.isInteger(input.schemaVersion) || input.schemaVersion < 0) throw new StoryStateError('The official story save is malformed.', 'INVALID_SAVE');
  if (input.schemaVersion > targetVersion) throw new StoryStateError('This save uses an unsupported story schema.', 'UNSUPPORTED_SCHEMA');
  let candidate = clone(input);
  while (candidate.schemaVersion < targetVersion) {
    const from = candidate.schemaVersion, migration = migrations[from];
    if (typeof migration !== 'function') throw new StoryStateError(`Missing save migration from version ${from}.`, 'MISSING_MIGRATION');
    candidate = migration(clone(candidate));
    if (!record(candidate) || candidate.schemaVersion !== from + 1) throw new StoryStateError('A save migration did not advance one version.', 'INVALID_MIGRATION');
  }
  return candidate;
}

/** Portable files are transfer documents, never an additional runtime store.
 * Format migrations run first; story-schema migrations use the existing envelope
 * migration pipeline after the portable canon has been placed in a candidate.
 */
export function migratePortableSave(input, migrations = {}) {
  let candidate;
  try { candidate = typeof input === 'string' ? JSON.parse(input) : clone(input); }
  catch { throw new StoryStateError('The imported file is not valid JSON.', 'INVALID_IMPORT'); }
  if (!record(candidate) || candidate.format !== CANON_SAVE_FORMAT) throw new StoryStateError('This is not a Reverse Falls canon save.', 'UNSUPPORTED_FORMAT');
  if (!Number.isInteger(candidate.saveFormatVersion) || candidate.saveFormatVersion < 0 || candidate.saveFormatVersion > CANON_SAVE_FORMAT_VERSION) throw new StoryStateError('Unsupported portable save format version.', 'UNSUPPORTED_FORMAT_VERSION');
  while (candidate.saveFormatVersion < CANON_SAVE_FORMAT_VERSION) {
    const from = candidate.saveFormatVersion, migration = migrations[from];
    if (typeof migration !== 'function') throw new StoryStateError(`Missing portable save migration from version ${from}.`, 'MISSING_MIGRATION');
    candidate = migration(clone(candidate));
    if (!record(candidate) || candidate.format !== CANON_SAVE_FORMAT || candidate.saveFormatVersion !== from + 1) throw new StoryStateError('A portable save migration did not advance one version.', 'INVALID_MIGRATION');
  }
  if (!Number.isInteger(candidate.schemaVersion) || candidate.schemaVersion < 0 || candidate.schemaVersion !== candidate.canon?.schemaVersion) throw new StoryStateError('Invalid portable story schema.', 'INVALID_IMPORT');
  if (typeof candidate.gameVersion !== 'string' || !candidate.gameVersion.trim() || typeof candidate.exportedAt !== 'string' || !Number.isFinite(Date.parse(candidate.exportedAt))) throw new StoryStateError('Invalid portable save metadata.', 'INVALID_IMPORT');
  return candidate;
}

export function createStoryStateService({ storage, registry, validateSnapshot, validateProgress = registry?.validateProgress, key = STORY_KEY, backupLimit = BACKUP_LIMIT, migrations = {}, portableMigrations = {} } = {}) {
  if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') throw new StoryStateError('Story storage is unavailable.', 'STORAGE_UNAVAILABLE');
  const registered = registryData(registry), recoveryKey = key === STORY_KEY ? RECOVERY_KEY : `${key}:recovery`;
  let state = createStoryEnvelope({}, registry), alternative = null, warnings = [], initialized = false;
  const check = envelope => validateStoryEnvelope(envelope, registry, { validateSnapshot, validateProgress });
  const assertValid = envelope => {
    const result = check(envelope);
    if (!result.valid) throw new StoryStateError('The story could not be validated. Your official save was not changed.', 'INVALID_SAVE', result.errors);
  };
  const persist = (targetKey, value) => {
    try { if (storage.set(targetKey, clone(value)) === false) throw new Error('Storage rejected the write.'); }
    catch (error) { throw new StoryStateError('The browser could not save the story. Your official save was not changed.', 'STORAGE_WRITE_FAILED', [error.message]); }
  };
  const recovery = () => {
    try { const found = storage.get(recoveryKey); return Array.isArray(found) ? found : []; } catch { return []; }
  };
  const usableRecovery = () => recovery().map(entry => {
    try {
      if (!record(entry?.envelope)) return null;
      const envelope = migrateStoryEnvelope(entry.envelope, migrations);
      return check(envelope).valid ? { ...entry, envelope } : null;
    } catch { return null; }
  }).filter(Boolean);
  const backup = (old, reason) => {
    const entry = { id: identifier('checkpoint'), reason, createdAt: stamp(), envelope: clone(old) };
    // Recovery entries do not recursively contain older recovery snapshots.
    entry.envelope.backups = [];
    const entries = [...recovery(), entry].slice(-Math.max(1, Math.min(10, backupLimit)));
    persist(recoveryKey, entries);
    return { id: entry.id, reason, createdAt: entry.createdAt };
  };
  const ensureCanonical = () => {
    if (alternative) throw new StoryStateError('Exit the alternative path before changing the official story.', 'ALTERNATIVE_ACTIVE');
  };
  const finish = (candidate, reason, { checkpoint = false, recoverySource = state } = {}) => {
    candidate.canon.derived = deriveStoryState(candidate.canon, registry);
    candidate.metadata.updatedAt = stamp();
    Object.assign(candidate.metadata, cursorMetadata(candidate.canon));
    const previousChoices = state.canon.choices, nextChoices = candidate.canon.choices;
    const changedChoices = [...new Set([...Object.keys(previousChoices), ...Object.keys(nextChoices)])]
      .filter(id => previousChoices[id] !== nextChoices[id])
      .map(choiceId => ({ choiceId, from: previousChoices[choiceId] ?? null, to: nextChoices[choiceId] ?? null,
        source: `${choiceId}.${nextChoices[choiceId] ?? previousChoices[choiceId]}`, removed: !own(nextChoices, choiceId) }));
    candidate.log = [...(candidate.log || []), { id: identifier('mutation'), at: stamp(), reason, changedChoices }].slice(-LOG_LIMIT);
    assertValid(candidate);
    if (checkpoint) {
      const point = backup(recoverySource, reason);
      candidate.backups = [...(candidate.backups || []), point].slice(-backupLimit);
      candidate.metadata.checkpoint = point.id;
    }
    // localStorage.setItem is the one atomic authoritative publication point.
    persist(key, candidate);
    state = clone(candidate); initialized = true;
    return clone(state);
  };
  const applyPatch = (target, patch) => {
    if (!record(patch)) throw new StoryStateError('Invalid story update.', 'INVALID_UPDATE');
    if (own(patch, 'choices')) target.canon.choices = clone(patch.choices);
    if (own(patch, 'progress')) target.canon.progress = clone(patch.progress);
    if (own(patch, 'currentChapter')) target.canon.currentChapter = patch.currentChapter;
    if (own(patch, 'snapshots')) target.snapshots = clone(patch.snapshots);
    target.canon.derived = deriveStoryState(target.canon, registry);
    Object.assign(target.metadata, cursorMetadata(target.canon));
    return target;
  };

  const importCandidate = input => {
    if (!initialized) throw new StoryStateError('Initialize the official story before importing a save.', 'NOT_INITIALIZED');
    const portable = migratePortableSave(input, portableMigrations);
    // Copy only the canonical payload and resumable engine cursors. Discovery,
    // recovery history and session data from a foreign file are never imported.
    let candidate = clone(state);
    candidate.schemaVersion = portable.schemaVersion;
    candidate.canon = clone(portable.canon);
    candidate.snapshots = own(portable, 'snapshots') ? clone(portable.snapshots) : {};
    Object.assign(candidate.metadata, cursorMetadata(candidate.canon));
    candidate = migrateStoryEnvelope(candidate, migrations);
    // Strictly check transmitted effects AND their provenance before finish()
    // recalculates any derived cache. Tampering must not be silently repaired.
    assertValid(candidate);
    return { candidate, portable };
  };

  const service = {
    init(initialEnvelope = null) {
      warnings = []; alternative = null;
      let stored;
      try { stored = storage.get(key); } catch (error) { throw new StoryStateError('The browser could not read the official story.', 'STORAGE_READ_FAILED', [error.message]); }
      if (stored !== null && stored !== undefined) {
        try {
          let candidate = migrateStoryEnvelope(stored, migrations);
          const migrated = candidate.schemaVersion !== stored.schemaVersion;
          const validation = check(candidate);
          if (validation.valid) {
            if (migrated) { warnings.push('The official story save was migrated to the current format.'); return finish(candidate, 'schema migration', { checkpoint: true, recoverySource: stored }); }
            state = clone(candidate); initialized = true;
            return clone(state);
          }
          // Only derived caches may be repaired automatically. Primary IDs are never guessed.
          if (canonicalErrors(candidate.canon, registry, { derived: false }).length === 0) {
            candidate.canon.derived = deriveStoryState(candidate.canon, registry);
            if (record(candidate.metadata)) Object.assign(candidate.metadata, cursorMetadata(candidate.canon));
            if (check(candidate).valid) {
              warnings.push('Outdated derived story facts were recalculated from your official choices.');
              return finish(candidate, 'repair derived state', { checkpoint: true, recoverySource: stored });
            }
          }
          throw new StoryStateError('The official story save is damaged.', 'INVALID_SAVE', validation.errors);
        } catch (error) {
          if (['STORAGE_WRITE_FAILED', 'STORAGE_READ_FAILED', 'UNSUPPORTED_SCHEMA', 'MISSING_MIGRATION'].includes(error.code)) throw error;
          const recoverable = usableRecovery().at(-1);
          if (recoverable) {
            warnings.push('The official story was restored from a recovery checkpoint.');
            return finish(clone(recoverable.envelope), 'recover invalid save');
          }
          // Never overwrite unsupported/corrupt primary data with an apparently new game.
          throw error;
        }
      }
      const recoveredMissing = usableRecovery().at(-1);
      if (recoveredMissing) {
        warnings.push('A missing or unreadable official story was restored from a recovery checkpoint.');
        return finish(clone(recoveredMissing.envelope), 'recover missing save');
      }
      const candidate = initialEnvelope ? (own(initialEnvelope, 'saveFormatVersion') ? clone(initialEnvelope) : createStoryEnvelope(initialEnvelope, registry)) : createStoryEnvelope({}, registry);
      assertValid(candidate);
      if (initialEnvelope) {
        // Legacy conversion keeps the source archive in recovery before any new publication.
        const point = backup(candidate, 'legacy migration');
        candidate.backups = [point]; candidate.metadata.checkpoint = point.id;
        warnings.push('Your earlier chapter saves were migrated into one official story.');
      }
      return finish(candidate, initialEnvelope ? 'legacy migration' : 'new story');
    },
    exportSave({ gameVersion = '3.1.0' } = {}) {
      if (!initialized) throw new StoryStateError('Initialize the official story before exporting a save.', 'NOT_INITIALIZED');
      assertValid(state);
      if (typeof gameVersion !== 'string' || !gameVersion.trim()) throw new StoryStateError('Invalid game version.', 'INVALID_EXPORT');
      return { format: CANON_SAVE_FORMAT, saveFormatVersion: CANON_SAVE_FORMAT_VERSION,
        schemaVersion: STORY_SCHEMA_VERSION, gameVersion, exportedAt: stamp(),
        canon: clone(state.canon), snapshots: clone(state.snapshots) };
    },
    previewImport(input) {
      const { candidate, portable } = importCandidate(input);
      return { format: CANON_SAVE_FORMAT, saveFormatVersion: CANON_SAVE_FORMAT_VERSION,
        schemaVersion: candidate.schemaVersion, gameVersion: portable.gameVersion,
        exportedAt: portable.exportedAt, canon: clone(candidate.canon), snapshots: clone(candidate.snapshots) };
    },
    importSave(input, { prepare } = {}) {
      const { candidate } = importCandidate(input), previous = clone(state);
      if (prepare) {
        const result = prepare(candidate, previous);
        if (result && typeof result.then === 'function') throw new StoryStateError('Import preparation must be synchronous.', 'ASYNC_PREPARE');
        if (result && result !== candidate) throw new StoryStateError('Import preparation must update its candidate only.', 'INVALID_PREPARE');
      }
      // Adapter work may reconstruct snapshots, but cannot bypass validation.
      assertValid(candidate);
      const committed = finish(candidate, 'import canon save', { checkpoint: true });
      alternative = null;
      return committed;
    },
    getState: () => clone(state),
    read: () => clone(state),
    isInitialized: () => initialized,
    getWarnings: () => [...warnings],
    getCanon: () => clone(state.canon),
    getSessionCanon: () => clone(alternative?.canon || state.canon),
    getAlternativeSession: () => alternative ? clone(alternative) : null,
    getChoice(id, { alternative: temporary = false } = {}) {
      const choices = (temporary && alternative ? alternative.canon : state.canon).choices;
      return own(choices, id) ? choices[id] : null;
    },
    hasFlag(key, { alternative: temporary = false } = {}) { return Boolean((temporary && alternative ? alternative.canon : state.canon).derived.flags[key]?.value); },
    getFlag(key, { alternative: temporary = false } = {}) { return (temporary && alternative ? alternative.canon : state.canon).derived.flags[key]?.value ?? null; },
    getRelationship(key, { alternative: temporary = false } = {}) { return (temporary && alternative ? alternative.canon : state.canon).derived.relationships[key]?.total || 0; },
    hasItem(key, { alternative: temporary = false } = {}) { return own((temporary && alternative ? alternative.canon : state.canon).derived.inventory, key); },
    characterKnows(character, fact, { alternative: temporary = false } = {}) { return own((temporary && alternative ? alternative.canon : state.canon).derived.knowledge[character] || {}, fact); },
    getCanonSummary() {
      const canon = state.canon;
      return clone({ currentChapter: canon.currentChapter, importantChoices: canon.choices, relationships: Object.fromEntries(Object.entries(canon.derived.relationships).map(([id, relation]) => [id, relation.total])), activeStoryFlags: Object.fromEntries(Object.entries(canon.derived.flags).map(([id, flag]) => [id, flag.value])), inventory: canon.derived.inventory, characterKnowledge: canon.derived.knowledge, quests: canon.derived.quests, progress: canon.progress });
    },
    validate: envelope => check(envelope || state),
    updateCanonical(patch, reason = 'story progress', { checkpoint = false } = {}) {
      ensureCanonical();
      return finish(applyPatch(clone(state), patch), reason, { checkpoint });
    },
    recordDiscovery(discovery) {
      if (!record(discovery)) throw new StoryStateError('Invalid discovery data.', 'INVALID_DISCOVERY');
      const candidate = clone(state); candidate.discovery = clone(discovery);
      // Discovery publication does not update the canonical story, even during an alternative.
      assertValid(candidate); persist(key, candidate); state = candidate;
      return clone(state.discovery);
    },
    createAlternativeSession({ canon = state.canon, snapshots = state.snapshots, origin = null, startNode = null } = {}) {
      if (alternative) throw new StoryStateError('An alternative path is already active.', 'ALTERNATIVE_ACTIVE');
      const candidate = clone(state); candidate.canon = clone(canon); candidate.canon.derived = deriveStoryState(candidate.canon, registry); candidate.snapshots = clone(snapshots);
      Object.assign(candidate.metadata, cursorMetadata(candidate.canon));
      assertValid(candidate);
      alternative = { id: identifier('alternative'), active: true, originSaveId: state.metadata.saveId, startNode, origin: clone(origin), canon: candidate.canon, snapshots: candidate.snapshots };
      return clone(alternative);
    },
    updateAlternative(patch) {
      if (!alternative) throw new StoryStateError('No alternative path is active.', 'NO_ALTERNATIVE');
      const candidate = applyPatch({ ...clone(state), canon: clone(alternative.canon), snapshots: clone(alternative.snapshots) }, patch);
      assertValid(candidate);
      alternative = { ...alternative, canon: candidate.canon, snapshots: candidate.snapshots };
      return clone(alternative);
    },
    exitAlternative() {
      const previous = alternative ? clone(alternative) : null;
      alternative = null;
      return previous;
    },
    setChoice(choiceId, optionId) {
      ensureCanonical();
      if (own(state.canon.choices, choiceId) && state.canon.choices[choiceId] !== optionId) return service.rewriteCanonFrom(choiceId, optionId);
      return service.updateCanonical({ choices: { ...state.canon.choices, [choiceId]: optionId } }, `choice ${choiceId} = ${optionId}`);
    },
    rewriteCanonFrom(choiceId, optionId, { prepare } = {}) {
      ensureCanonical();
      const definition = registered.choices.get(choiceId);
      if (!definition?.options.has(optionId)) throw new StoryStateError('This story option is unavailable.', 'INVALID_OPTION');
      const candidate = clone(state), previous = clone(state), removed = [];
      candidate.canon.choices[choiceId] = optionId;
      let dirty = true;
      while (dirty) {
        dirty = false;
        for (const [id, selected] of Object.entries(candidate.canon.choices)) {
          const choice = registered.choices.get(id), option = choice?.options.get(selected);
          if (!choice || !option || !requirementsMet(choice.requirements, candidate.canon.choices) || !requirementsMet(option.requirements, candidate.canon.choices)) {
            if (id === choiceId) throw new StoryStateError('This option cannot occur in the current official history.', 'UNSATISFIED_REQUIREMENTS');
            delete candidate.canon.choices[id]; removed.push(id); dirty = true;
          }
        }
      }
      const uncertain = [...registered.choices.values()].find(choice => own(candidate.canon.choices, choice.id) && choice.dependenciesKnown === false && registered.chapters.indexOf(choice.chapterId) >= registered.chapters.indexOf(definition.chapterId));
      if (uncertain) {
        const boundary = uncertain.fallbackChapterId ?? uncertain.chapterId;
        for (const choice of registered.choices.values()) if (choice.id !== choiceId && registered.chapters.indexOf(choice.chapterId) >= registered.chapters.indexOf(boundary) && own(candidate.canon.choices, choice.id)) { delete candidate.canon.choices[choice.id]; removed.push(choice.id); }
        for (const chapter of registered.chapters) if (registered.chapters.indexOf(chapter) >= registered.chapters.indexOf(boundary)) { delete candidate.snapshots[chapter]; delete candidate.canon.progress[chapter]; }
        candidate.canon.currentChapter = boundary;
      }
      candidate.canon.derived = deriveStoryState(candidate.canon, registry);
      // The adapter replays engine cursors, not story rules. It cannot touch the official object.
      if (prepare) {
        const result = prepare(candidate, previous, { choiceId, optionId, removedChoices: [...new Set(removed)] });
        if (result && typeof result.then === 'function') throw new StoryStateError('Story rewrites must prepare synchronously before publication.', 'ASYNC_PREPARE');
        if (result && result !== candidate) throw new StoryStateError('Rewrite preparation must update its candidate only.', 'INVALID_PREPARE');
      }
      return finish(candidate, `rewrite ${choiceId} = ${optionId}${removed.length ? `; removed ${[...new Set(removed)].join(', ')}` : ''}`, { checkpoint: true });
    },
    rollback(checkpointId = null) {
      ensureCanonical();
      const entry = usableRecovery().reverse().find(point => !checkpointId || point.id === checkpointId);
      if (!entry) throw new StoryStateError('No valid recovery checkpoint is available.', 'NO_CHECKPOINT');
      const candidate = clone(entry.envelope);
      // Seeing a scene remains a discovery even if the official timeline is rolled back.
      candidate.discovery = clone(state.discovery);
      return finish(candidate, `rollback ${entry.id}`);
    }
  };
  return service;
}
