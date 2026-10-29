import { StoryEngine } from './engine.js';
import { CHAPTERS, CHAPTER1_CHOICES, chapterForSnapshot, chapterLanguage, readCampaign } from './campaign.js';
import { getFlowGraph, readFlowProgress } from './flowchart.js';
import { createFlowJump } from './flow-jump.js';
import { createStoryEnvelope, deriveStoryState } from './story-state.js';

const clone = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const path = value => String(value ?? '').toLowerCase().replace(/\\/g, '/').replace(/^textes\/[a-z]+\//, '');
const selected = (value, options) => typeof value === 'string' ? options.find(id => id.toLowerCase() === value.trim().toLowerCase()) : undefined;
const effect = (type, key, value) => ({ type, key, value });
const flag = (key, value) => effect('flag', key, value);
const counter = key => effect('counter', key, 1);
const relationship = () => effect('relationship', 'pacifica_gideon', 1);
const MONSTERS = ['Werewolf', 'Wendigo', 'Vampire'];
const CITIES = ['arcade', 'hardware_store', 'telepathy_tent'];
const C0_PATHS = {
  intro: 'chapter_0/part_1_intro/intro_1', werewolf: 'chapter_0/part_1_intro/intro_2_werewolf',
  wendigo: 'chapter_0/part_1_intro/intro_2_wendigo', vampire: 'chapter_0/part_1_intro/intro_2_vampire',
  gideon: 'chapter_0/part_1_intro/intro_3_gideon', arcade: 'chapter_0/part_2_freetime/arcade/first',
  hardware: 'chapter_0/part_2_freetime/hardware_store/first', tent: 'chapter_0/part_2_freetime/telepathy_tent/first',
  forest: 'chapter_0/part_3_mothman/mothman_1', moth_paper: 'chapter_0/part_3_mothman/mothman_2_werewolf',
  moth_heat: 'chapter_0/part_3_mothman/mothman_2_wendigo', moth_reflection: 'chapter_0/part_3_mothman/mothman_2_vampire',
  finale: 'chapter_0/part_3_mothman/mothman_3'
};
const makeChoice = (id, chapterId, legacyKey, sceneId, entries, rejoinNode) => ({
  id, chapterId, legacyKey, sceneId, dependsOn: [], requirements: [], rejoinNode,
  options: entries.map(([id, nodeId, effects]) => ({ id, nodeId, effects }))
});
const choices = [
  makeChoice('ch0.creature', 0, 'monster', C0_PATHS.intro, MONSTERS.map(id => [id, id.toLowerCase(), [flag('monster', id)]]), 'gideon'),
  makeChoice('ch1.gideon_reason', 1, 'reason', 'chapter_1_v3/reason', [
    ['Deflect', 'reason_deflect', [counter('gideon_deflects')]],
    ['Curiosity', 'reason_curiosity', [counter('gideon_curiosity')]],
    ['Openness', 'reason_openness', [counter('gideon_openness'), relationship()]]
  ], 'cafe_after'),
  makeChoice('ch1.tracks', 1, 'tracks', 'chapter_1_v3/tracks', [
    ['Bold', 'tracks_bold', [counter('pacifica_bold')]],
    ['Journal', 'tracks_journal', [counter('journal_doubt')]],
    ['Search', 'tracks_search', [flag('extra_clue_01', true), effect('item', 'cloth_scrap', true)]]
  ], 'animals'),
  makeChoice('ch1.slope', 1, 'descent', 'chapter_1_v3/deep_forest', [
    ['Pacifica', 'descent_pacifica', [relationship()]],
    ['Gideon', 'descent_gideon', [counter('pacifica_protective')]],
    ['Careful', 'descent_careful', [flag('careful_route', true)]]
  ], 'clearing'),
  makeChoice('ch1.ending', 1, 'ending', 'chapter_1_v3/watched', [
    ['Bold', 'ending_bold', [flag('chapter1_bold_end', true)]],
    ['Cautious', 'ending_cautious', [flag('chapter1_cautious_end', true)]],
    ['Observation', 'ending_observation', [flag('chapter1_observation_end', true)]]
  ], 'blue_glow')
];
const byId = Object.fromEntries(choices.map(choice => [choice.id, choice]));
const choiceForNode = Object.fromEntries(choices.flatMap(choice => choice.options.map(option => [`${choice.chapterId}:${option.nodeId}`, { choiceId: choice.id, optionId: option.id }])));
const monsterNodes = { moth_paper: 'Werewolf', moth_heat: 'Wendigo', moth_reflection: 'Vampire' };
for (const location of ['cafe', 'yard', 'clearing']) for (const monster of MONSTERS) choiceForNode[`1:${location}_${monster.toLowerCase()}`] = { choiceId: 'ch0.creature', optionId: monster };
for (const [nodeId, optionId] of Object.entries(monsterNodes)) choiceForNode[`0:${nodeId}`] = { choiceId: 'ch0.creature', optionId };

/** All story IDs stay language independent; released option values remain intact. */
export const STORY_REGISTRY = {
  chapterIds: [0, 1], choices,
  baseEffects: [{ type: 'item', key: 'journal_3', value: true, source: 'chapter1.start', chapterId: 1 }],
  chapters: [0, 1].map(chapterId => ({ chapterId, start: CHAPTERS[chapterId].start, available: true })),
  graphs: [0, 1].map(chapterId => {
    const graph = getFlowGraph(chapterId);
    return { ...clone(graph), nodes: graph.nodes.map(node => {
      const selection = choiceForNode[`${chapterId}:${node.id}`];
      const definition = selection && byId[selection.choiceId];
      return { ...clone(node), nodeId: node.id, chapterId,
        parents: graph.edges.filter(edge => edge.to === node.id).map(edge => edge.from),
        children: graph.edges.filter(edge => edge.from === node.id).map(edge => edge.to),
        requirements: selection ? [{ choiceId: selection.choiceId, optionId: selection.optionId }] : [],
        effects: selection ? clone(definition.options.find(option => option.id === selection.optionId).effects) : [],
        ...(selection || {}), rejoinNode: definition?.rejoinNode ?? null };
    }) };
  })
};

export function choiceForFlowNode(chapter, nodeId) { return clone(choiceForNode[`${chapter}:${nodeId}`] ?? null); }
export const decisionForNode = choiceForFlowNode;

/** Migration/engine boundary only: never reads discovery or map visitation. */
export function choicesFromSnapshot(snapshot) {
  const chapter = chapterForSnapshot(snapshot), result = {};
  if (chapter === null || !record(snapshot.flags)) return result;
  for (const choice of choices) {
    if (choice.chapterId !== chapter && choice.id !== 'ch0.creature') continue;
    const option = selected(snapshot.flags[choice.legacyKey], choice.options.map(option => option.id));
    if (option) result[choice.id] = option;
  }
  return result;
}

const FLAG_DEFAULTS = {
  gideon_deflects: 0, gideon_curiosity: 0, gideon_openness: 0, pacifica_gideon_trust: 0,
  pacifica_bold: 0, journal_doubt: 0, pacifica_protective: 0, extra_clue_01: false,
  careful_route: false, chapter1_bold_end: false, chapter1_cautious_end: false, chapter1_observation_end: false
};

function scalarFlags(derived) {
  const result = Object.fromEntries(Object.entries(derived.flags ?? {}).map(([key, entry]) => [key, entry.value]));
  result.pacifica_gideon_trust = derived.relationships?.pacifica_gideon?.total ?? 0;
  return result;
}

/** Render a reached portion of canon into the legacy engine without injecting future choices. */
export function reconcileSnapshot(snapshot, canon) {
  const result = clone(snapshot), chapter = chapterForSnapshot(result);
  if (chapter === null) throw new Error('Unknown chapter in story snapshot');
  const reached = choicesFromSnapshot(result), active = {};
  for (const choice of choices) {
    if (!Object.hasOwn(canon.choices ?? {}, choice.id)) continue;
    if (Object.hasOwn(reached, choice.id) || chapter === 1 && choice.id === 'ch0.creature') active[choice.id] = canon.choices[choice.id];
  }
  const projection = { ...clone(canon), choices: active, currentChapter: chapter, progress: { [chapter]: { sceneId: result.script } } };
  const derived = deriveStoryState(projection, STORY_REGISTRY);
  result.flags = record(result.flags) ? result.flags : {};
  for (const choice of choices) delete result.flags[choice.legacyKey];
  if (chapter === 1) Object.assign(result.flags, FLAG_DEFAULTS);
  for (const choice of choices) if (active[choice.id]) result.flags[choice.legacyKey] = active[choice.id];
  Object.assign(result.flags, scalarFlags(derived));
  if (chapter === 0) delete result.flags.pacifica_gideon_trust;
  if (chapter === 1) result.inventory = Object.keys(derived.inventory ?? {});
  return result;
}

export function progressFromSnapshot(snapshot) {
  const chapter = chapterForSnapshot(snapshot);
  if (chapter === null) throw new Error('Unknown chapter in story snapshot');
  return { sceneId: path(snapshot.script), line: snapshot.line, phase: snapshot.phase,
    language: snapshot.language,
    completed: snapshot.phase === 'credits', visited: Array.isArray(snapshot.visited) ? [...snapshot.visited] : [] };
}

/** Engine history is a small cursor cache, never the authoritative timeline. */
export function boundSnapshotCache(snapshots, currentChapter, limit = 2) {
  if (!record(snapshots)) return {};
  const maximum = Number.isSafeInteger(limit) && limit > 0 ? limit : 2;
  const keys = Object.keys(snapshots).filter(key => record(snapshots[key]));
  // Chapter IDs use registry order today and remain numeric as chapters are added.
  const ordered = [...keys].sort((a, b) => Number(b) - Number(a));
  const current = String(currentChapter);
  const keep = [...(keys.includes(current) ? [current] : []), ...ordered.filter(key => key !== current)].slice(0, maximum);
  return Object.fromEntries(keep.map(key => [key, clone(snapshots[key])]));
}

function nodeForScene(chapter, sceneId) {
  const normalized = path(sceneId);
  if (chapter === 1) return getFlowGraph(1).nodes.find(node => normalized === `chapter_1_v3/${node.id}`)?.id ?? null;
  return Object.keys(C0_PATHS).find(id => C0_PATHS[id] === normalized) ?? null;
}
function sceneForNode(chapter, nodeId) { return chapter === 0 ? C0_PATHS[nodeId] : `chapter_1_v3/${nodeId}`; }
function routeNodeAllowed(chapter, node, canon) {
  const required = choiceForNode[`${chapter}:${node.id}`];
  return !required || canon.choices?.[required.choiceId] === required.optionId;
}

/** A flow-only snapshot: history is constructed from explicit canon and progress. */
export function canonicalFlowSnapshot(chapter, canon, snapshots = {}) {
  if (!STORY_REGISTRY.chapterIds.includes(chapter)) return null;
  const progress = canon.progress?.[chapter];
  if (!progress) return null;
  const graph = getFlowGraph(chapter), sceneId = progress.sceneId ?? snapshots[chapter]?.script;
  let current = progress.nodeId ?? nodeForScene(chapter, sceneId);
  const visited = Array.isArray(progress.visited) ? progress.visited : [];
  if (chapter === 0 && progress.phase === 'map') current = 'town';
  // Auxiliary original scripts belong to the last explicitly recorded checkpoint.
  if (!current) current = chapter === 0 ? visited.includes('forest') ? 'forest' : visited.length ? 'town' : 'intro' : 'start';
  let nodes;
  if (chapter === 0) {
    const monster = canon.choices?.['ch0.creature'];
    const cityNode = { arcade: 'arcade', hardware_store: 'hardware', telepathy_tent: 'tent' };
    nodes = ['intro', ...(monster ? [monster.toLowerCase()] : []), 'gideon', 'town'];
    for (const city of visited.filter(id => CITIES.includes(id))) nodes.push(cityNode[city], 'town');
    nodes.push('forest', { Werewolf: 'moth_paper', Wendigo: 'moth_heat', Vampire: 'moth_reflection' }[monster], 'finale');
    const at = current === 'town' ? nodes.lastIndexOf('town') : nodes.indexOf(current);
    nodes = nodes.slice(0, Math.max(0, at) + 1).filter(Boolean);
  } else {
    const at = graph.nodes.find(node => node.id === current)?.x ?? 0;
    nodes = graph.nodes.filter(node => node.x <= at && routeNodeAllowed(chapter, node, canon)).map(node => node.id);
  }
  const scripts = nodes.filter(id => id !== 'town').map(id => sceneForNode(chapter, id));
  const currentScript = current === 'town' ? scripts.at(-1) ?? C0_PATHS.gideon : sceneForNode(chapter, current);
  return { version: 1, script: currentScript, line: Math.max(0, Number(progress.line) || 0),
    phase: progress.completed ? 'credits' : progress.phase ?? 'dialogue',
    history: scripts.map(script => ({ script })), flags: Object.fromEntries(choices.filter(choice => canon.choices?.[choice.id]).map(choice => [choice.legacyKey, canon.choices[choice.id]])), visited };
}

/** Prefer the latest selected chapter's real manual save, never discovered branches. */
export function migrateLegacyStory({ chapter0 = null, chapter1 = null, campaign = null, discovery = null, currentChapter = 0, validateSnapshot = null, replay = null } = {}) {
  const warnings = [], snapshots = {}, progress = {}, legacy = { chapter0, chapter1, campaign, discovery, currentChapter };
  for (const [chapter, snapshot] of [[0, chapter0], [1, chapter1]]) {
    if (!snapshot) continue;
    try {
      if (chapterForSnapshot(snapshot) !== chapter || validateSnapshot && validateSnapshot(snapshot, chapter) === false) throw Error('invalid snapshot');
      snapshots[chapter] = clone(snapshot); progress[chapter] = progressFromSnapshot(snapshot);
    } catch { warnings.push(`Сохранение главы ${chapter} повреждено и оставлено в резервной копии.`); }
  }
  const oldCampaign = readCampaign(campaign), activeChapter = currentChapter === 1 && snapshots[1] ? 1 : snapshots[0] ? 0 : snapshots[1] ? 1 : 0;
  const c0 = choicesFromSnapshot(snapshots[0]), c1 = choicesFromSnapshot(snapshots[1]);
  const completed1 = oldCampaign.chapters[1];
  const campaignChoices = completed1.completed ? choicesFromSnapshot({ version: 1, script: 'chapter_1_v3/will', flags: completed1.flags }) : {};
  // A manual in-progress chapter is a whole timeline, not a patch over its old ending.
  const migratedChoices = { ...(snapshots[1] ? {} : campaignChoices), ...c0, ...c1 };
  const priority = activeChapter === 1 ? c1['ch0.creature'] : c0['ch0.creature'];
  const monster = priority ?? c0['ch0.creature'] ?? c1['ch0.creature'] ?? selected(oldCampaign.chapters[0].monster, MONSTERS) ?? campaignChoices['ch0.creature'];
  if (monster) migratedChoices['ch0.creature'] = monster;
  if (c0['ch0.creature'] && c1['ch0.creature'] && c0['ch0.creature'] !== c1['ch0.creature']) warnings.push('Старые сохранения расходились по существу. Выбрана версия текущей главы; остальные сцены пересчитаны.');
  for (const chapter of [0, 1]) if (!progress[chapter] && oldCampaign.chapters[chapter].completed) {
    progress[chapter] = { sceneId: chapter === 0 ? C0_PATHS.finale : 'chapter_1_v3/will', phase: 'credits', completed: true, line: 0, visited: chapter === 0 ? [...CITIES, 'forest'] : [] };
  }
  let envelope = createStoryEnvelope({ choices: migratedChoices, progress, currentChapter: activeChapter, snapshots, discovery: readFlowProgress(discovery) }, STORY_REGISTRY);
  // The service owns bounded checkpoints and strips nested backups. Keep the one
  // immutable conversion archive outside that list so future checkpoints retain it.
  envelope.metadata.legacyArchive = clone(legacy);
  envelope.backups = [{ id: 'legacy-migration', reason: 'legacy_migration', createdAt: new Date().toISOString(), legacy: clone(legacy) }];
  envelope.log = [{ type: 'migration', from: 'legacy', to: 1, at: new Date().toISOString() }];
  for (const [chapter, snapshot] of Object.entries(snapshots)) {
    const conflictingMonster = choicesFromSnapshot(snapshot)['ch0.creature'] !== monster && monster;
    if (conflictingMonster && replay) {
      try {
        const rebuilt = replay(Number(chapter), envelope.canon, snapshot);
        if (!rebuilt || validateSnapshot && validateSnapshot(rebuilt, Number(chapter)) === false) throw Error('invalid replay');
        envelope.snapshots[chapter] = rebuilt; envelope.canon.progress[chapter] = progressFromSnapshot(rebuilt);
      } catch {
        delete envelope.snapshots[chapter]; delete envelope.canon.progress[chapter];
        warnings.push(`Глава ${chapter}: несовместимая точка сохранения оставлена в резервной копии; продолжите с начала главы.`);
      }
    } else if (conflictingMonster) {
      delete envelope.snapshots[chapter]; delete envelope.canon.progress[chapter];
      warnings.push(`Глава ${chapter}: прежняя сцена требует безопасного перепрохождения.`);
    } else envelope.snapshots[chapter] = reconcileSnapshot(snapshot, envelope.canon);
  }
  envelope.canon.derived = deriveStoryState(envelope.canon, STORY_REGISTRY);
  envelope.warnings = warnings;
  return envelope;
}

function canonicalScene(sceneId, canon) {
  let result = path(sceneId);
  const creature = canon.choices?.['ch0.creature'];
  if (creature) result = result.replace(/(intro_2_|mothman_2_|cafe_|yard_|clearing_)(werewolf|wendigo|vampire)$/, (_, prefix) => prefix + creature.toLowerCase());
  for (const choice of choices.filter(choice => choice.chapterId === 1)) {
    const prefix = choice.legacyKey;
    if (new RegExp(`/(${prefix})_(?:${choice.options.map(option => option.id.toLowerCase()).join('|')})$`).test(result) && canon.choices?.[choice.id]) result = `chapter_1_v3/${prefix}_${canon.choices[choice.id].toLowerCase()}`;
  }
  return result;
}

/** Replay uses only registry choices and canonical travel progress, never history hints. */
export function replayCanonicalSnapshot(chapter, canon, oldSnapshot, { scripts, characters, language = 'english' } = {}) {
  if (!scripts || !STORY_REGISTRY.chapterIds.includes(chapter)) throw Error('Replay resources unavailable');
  const target = canon.progress?.[chapter] ?? (oldSnapshot ? progressFromSnapshot(oldSnapshot) : { sceneId: CHAPTERS[chapter].start, line: 0, phase: 'dialogue' });
  const chosenLanguage = chapterLanguage(chapter, oldSnapshot?.language ?? target.language ?? language);
  const targetScript = canonicalScene(target.sceneId ?? oldSnapshot?.script ?? CHAPTERS[chapter].start, canon);
  const targetLine = Number.isInteger(target.line) ? target.line : oldSnapshot?.line ?? 0;
  const cityOrder = [...new Set([...(target.visited ?? []).filter(id => CITIES.includes(id)), ...CITIES])];
  const engine = new StoryEngine({ scripts, characters, language: chosenLanguage });
  engine.start(CHAPTERS[chapter].start, { flags: chapter === 1 ? { monster: canon.choices?.['ch0.creature'] ?? 'Werewolf' } : {} });
  const done = () => reconcileSnapshot(engine.snapshot(), canon);
  const initialCheckpoint = engine.snapshot();
  let targetEntry = null;
  for (let step = 0; step < 16000; step++) {
    const state = engine.state;
    if (state.flags.monster && canon.choices?.['ch0.creature'] && state.flags.monster !== canon.choices['ch0.creature']) {
      throw Error('The original script cannot reproduce this creature in the selected language. Choose English or Russian; your story has not been changed.');
    }
    if (state.script === targetScript && !targetEntry && !['running', 'idle'].includes(state.phase)) targetEntry = engine.snapshot();
    if (targetEntry && state.script !== targetScript) return reconcileSnapshot(targetEntry, canon);
    if (state.script === targetScript && state.phase === target.phase && (state.line >= targetLine || target.phase === 'credits')) return done();
    if (state.script === targetScript && !['running', 'idle'].includes(state.phase) && state.line >= targetLine && !target.completed) return done();
    if (state.phase === 'credits') return state.script === targetScript || target.completed ? done() : reconcileSnapshot(initialCheckpoint, canon);
    if (state.phase === 'choice') {
      const definition = choices.find(choice => choice.chapterId === chapter && choice.sceneId === state.script);
      const optionId = definition && canon.choices?.[definition.id];
      if (!definition || !optionId) return done(); // Safest checkpoint: first unresolved choice.
      const index = definition.options.findIndex(option => option.id === optionId);
      if (index < 0) throw Error('Unknown canonical option during replay');
      engine.choose(index); continue;
    }
    if (state.phase === 'map') {
      if (chapter !== 0) throw Error('Unexpected travel map in replay');
      if (target.phase === 'map' && targetScript === state.script && state.visited.length >= (target.visited?.length ?? 0)) return done();
      const city = cityOrder.find(id => !state.visited.includes(id));
      if (city) engine.visit(city, { script: `chapter_0/part_2_freetime/${city}/first`, background: city });
      else if (!state.visited.includes('forest')) engine.visit('Forest', { script: C0_PATHS.forest, background: 'forest_1_dusk', final: true });
      else throw Error('Canonical travel could not reach its checkpoint');
      continue;
    }
    if (!['dialogue', 'pause', 'running'].includes(state.phase)) throw Error('Canonical replay became idle');
    engine.advance();
  }
  throw Error('Canonical replay exceeded its safe execution budget');
}

export function rebuildSnapshotsForRewrite(candidate, old, resources = {}) {
  const result = clone(candidate);
  result.snapshots ??= {};
  const cached = new Set(Object.keys(old.snapshots ?? {}));
  cached.add(String(result.canon.currentChapter));
  for (const chapter of STORY_REGISTRY.chapterIds) {
    if (!result.canon.progress?.[chapter] && !old.snapshots?.[chapter]) continue;
    if (!cached.has(String(chapter))) {
      const progress = result.canon.progress?.[chapter];
      if (progress) {
        const rebuiltScene = canonicalScene(progress.sceneId, result.canon);
        if (rebuiltScene !== progress.sceneId) {
          progress.sceneId = rebuiltScene;
          if (!progress.completed) progress.line = 0;
        }
      }
      delete result.snapshots[chapter];
      continue;
    }
    const previous = old.snapshots?.[chapter] ?? null;
    const rebuilt = replayCanonicalSnapshot(chapter, result.canon, previous, resources);
    const verifier = new StoryEngine({ scripts: resources.scripts, characters: resources.characters, language: rebuilt.language });
    verifier.restore(rebuilt);
    result.snapshots[chapter] = rebuilt;
    result.canon.progress[chapter] = progressFromSnapshot(rebuilt);
  }
  result.snapshots = boundSnapshotCache(result.snapshots, result.canon.currentChapter);
  result.canon.derived = deriveStoryState(result.canon, STORY_REGISTRY);
  return result;
}

/** Enter an already unlocked node with explicit choices. No save is mutated. */
export function createCanonicalFlowJump({ chapter, nodeId, canon, snapshots = {}, ...resources }) {
  return createFlowJump({ ...resources, chapter, nodeId, snapshot: null,
    canonicalChoices: canon.choices ?? {}, monster: canon.choices?.['ch0.creature'] ?? 'Werewolf',
    cityOrder: canon.progress?.[chapter]?.visited ?? snapshots[chapter]?.visited ?? [] });
}
