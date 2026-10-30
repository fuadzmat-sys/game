import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { StoryEngine, parseLine, plainText } from '../engine.js';
import { CHAPTERS, CHAPTER3_CHOICES } from '../campaign.js';
import { createStoryEnvelope, createStoryStateService } from '../story-state.js';
import { STORY_REGISTRY, choicesFromSnapshot, progressFromSnapshot, reconcileSnapshot, seedChapterFlags, seedChapterInventory, createCanonicalFlowJump, rebuildSnapshotsForRewrite } from '../story-bridge.js';
import { getFlowGraph } from '../flowchart.js';
import { buildCanonTimeline } from '../canon-timeline.js';
import { dialogueVoiceAllowed } from '../chapter-audio.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const bytes = name => fs.readFileSync(new URL('../' + name, import.meta.url));
const exists = name => fs.existsSync(new URL('../' + name, import.meta.url));
const clone = value => JSON.parse(JSON.stringify(value));
const namespace = 'chapter_3/', languages = ['russian', 'english'];
const scripts3 = read('assets/chapter3-scripts.json');
const scripts = { ...read('assets/scripts.json'), ...read('assets/chapter1-scripts.json'), ...read('assets/chapter2-scripts.json'), ...scripts3 };
const config = read('assets/config.json'), art1 = read('assets/chapter1-art.json'), art2 = read('assets/chapter2-art.json'), art3 = read('assets/chapter3-art.json');
const characters = { ...config.characters, ...art1.characters, ...art2.characters, ...art3.characters };
const userBytes = bytes('выборы.json'), userHash = createHash('sha256').update(userBytes).digest('hex'), supplied = JSON.parse(userBytes), prior = supplied.canon;
const source = Object.assign({}, ...['part1', 'part2'].map(part => read(`tools/chapter3-content-${part}.json`).resources));
const decisions = [
  { id: 'ch3.wendy_approach', flag: 'wendy_approach', scene: 'first_talk', values: ['Direct', 'Bargain', 'Wait'], nodes: ['approach_direct', 'approach_bargain', 'approach_wait'], rejoin: 'waymarks' },
  { id: 'ch3.test_method', flag: 'test_method', scene: 'waymarks', values: ['Mark', 'Listen', 'CheckPlans'], nodes: ['test_mark', 'test_listen', 'test_checkplans'], rejoin: 'cutting_floor' },
  { id: 'ch3.exit_plan', flag: 'exit_plan', scene: 'crossing', values: ['HoldGate', 'Guide', 'SecureBag'], nodes: ['exit_holdgate', 'exit_guide', 'exit_securebag'], rejoin: 'night_gate' }
];
const mainScenes = ['start', 'yard', 'first_talk', 'waymarks', 'cutting_floor', 'service_walk', 'bag', 'crossing', 'night_gate'];
const words = value => String(value).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || [];
const entered = new Set(), completed = [];
const resources = { scripts, characters, language: 'russian' };

function canonWith(overrides = {}) {
  return createStoryEnvelope({ canon: { ...clone(prior), choices: { ...prior.choices, ...overrides } } }, STORY_REGISTRY).canon;
}
function makeEngine(language = 'russian', events = []) {
  return new StoryEngine({ scripts, characters, language, onEvent(event) {
    events.push(event);
    if (event.type === 'script' && event.path.startsWith(namespace)) entered.add(event.resource);
    if (event.type === 'character') for (const char of Object.values(event.characters || {})) {
      if (char.visible) assert.ok(['pacifica', 'gideon', 'wendy'].includes(char.id), `Unrequested visible cast ${char.id} in ${event.sourceScript}`);
    }
  } });
}
function start(engine, canon = prior) {
  engine.start(CHAPTERS[3].start, { flags: seedChapterFlags(canon, 3), inventory: seedChapterInventory(canon, 3) });
  return project(engine, canon);
}
function project(engine, earlier) {
  const snapshot = engine.snapshot();
  const canon = createStoryEnvelope({ canon: { ...clone(earlier), choices: { ...earlier.choices, ...choicesFromSnapshot(snapshot) }, currentChapter: 3,
    progress: { ...earlier.progress, 3: progressFromSnapshot(snapshot) } } }, STORY_REGISTRY).canon;
  const projected = reconcileSnapshot(snapshot, canon);
  engine.state.flags = projected.flags; engine.state.inventory = projected.inventory;
  return canon;
}
function drive(engine, selected, { earlier = prior, taken = 0, checkpoints = null } = {}) {
  const seen = new Set(); let steps = 0;
  const capture = name => {
    if (!checkpoints || seen.has(name)) return;
    seen.add(name); const canon = project(engine, earlier);
    checkpoints.push({ name, taken, snapshot: engine.snapshot(), canon });
  };
  while (engine.state.phase !== 'credits') {
    assert.ok(++steps < 6000, `Chapter 3 does not terminate at ${engine.state.script}:${engine.state.line}`);
    const scene = engine.state.script.slice(namespace.length);
    if (['cutting_floor', 'service_walk', 'bag', 'night_gate'].includes(scene)) capture('scene:' + scene);
    if (engine.state.item === 'ch3_wooden_weight') capture('item:wooden_weight');
    if (engine.state.phase === 'choice') {
      const decision = decisions[taken]; assert.ok(decision, 'Exactly three chapter-three choices are expected');
      assert.equal(engine.state.script, namespace + decision.scene); assert.equal(engine.state.choices.length, 3);
      assert.ok(engine.state.choices.every(option => plainText(option.text).length > 5 && option.order?.length));
      capture('before:' + decision.id); engine.choose(selected[taken++]); project(engine, earlier); capture('after:' + decision.id);
    } else {
      assert.ok(['dialogue', 'pause'].includes(engine.state.phase), `Unexpected interpreter phase ${engine.state.phase}`);
      engine.advance();
    }
  }
  assert.equal(taken, 3);
  const canon = project(engine, earlier);
  return { snapshot: engine.snapshot(), canon, selected };
}
function full(selected = [1, 1, 2], language = 'russian', earlier = prior, checkpoints = null, events = []) {
  const engine = makeEngine(language, events); start(engine, earlier);
  return drive(engine, selected, { earlier, checkpoints });
}
function routeAssertions(result, selected, language) {
  const { snapshot, canon } = result;
  assert.equal(snapshot.phase, 'credits'); assert.equal(snapshot.script, namespace + 'night_gate');
  for (const [id, value] of Object.entries(prior.choices)) assert.equal(canon.choices[id], value, 'Chapter 3 must preserve the supplied earlier route');
  assert.equal(snapshot.flags.monster, 'Wendigo'); assert.equal(snapshot.flags.trail_focus, 'Journal'); assert.equal(snapshot.flags.creature_fate, 'Help');
  assert.deepEqual(snapshot.inventory, ['journal_3']);
  const paths = [...new Set(snapshot.history.map(row => row.script.slice(namespace.length)))];
  for (const id of mainScenes) assert.ok(paths.includes(id), `${language}: missing main scene ${id}`);
  decisions.forEach((decision, index) => {
    const selectedNode = decision.nodes[selected[index]];
    assert.equal(canon.choices[decision.id], decision.values[selected[index]]);
    assert.ok(paths.includes(selectedNode)); assert.ok(paths.indexOf(decision.rejoin) > paths.indexOf(selectedNode));
    for (const other of decision.nodes.filter(node => node !== selectedNode)) assert.ok(!paths.includes(other), `${language}: leaked branch ${other}`);
  });
  assert.ok(snapshot.history.every(row => row.script.startsWith(namespace)));
  assert.equal(canon.derived.relationships.pacifica_gideon.total, 3 + Number(selected[2] === 0));
  assert.equal(canon.derived.relationships.creature_trust.total, 1);
  assert.equal(canon.derived.relationships.wendy_respect?.total ?? 0, Number(selected[0] === 1) + Number(selected[2] === 1));
  assert.equal(!!canon.derived.flags.ch3_object_secured, selected[2] === 2);
  assert.equal(canon.derived.quests.wendy_forest_object.value, 'unresolved');
  for (const character of ['pacifica', 'gideon']) {
    assert.deepEqual(canon.derived.knowledge[character].ch3_wendy_has_object.sources, [`ch3.exit_plan.${decisions[2].values[selected[2]]}`]);
    assert.ok(canon.derived.knowledge[character].ch2_track_mismatch);
  }
  assert.equal(snapshot.item, null); assert.equal(snapshot.music, null);
  // The final approach cue restores tension after the apparent escape.
  assert.equal(snapshot.presentation.ambience, 'forest_tension');
}

test('compiled Chapter 3 is fully bilingual, has exactly three stable choices and valid local reconvergence', () => {
  assert.equal(Object.keys(scripts3).length, 36); assert.equal(Object.keys(source).length, 18);
  for (const language of languages) {
    assert.equal(Object.keys(scripts3).filter(key => key.startsWith(`textes/${language}/`)).length, 18);
    for (const decision of decisions) {
      const definition = STORY_REGISTRY.choices.find(choice => choice.id === decision.id);
      assert.equal(definition.chapterId, 3); assert.equal(definition.sceneId, namespace + decision.scene);
      assert.deepEqual(definition.options.map(option => option.id), decision.values); assert.equal(definition.rejoinNode, decision.rejoin);
    }
  }
  for (const [resource, script] of Object.entries(scripts3)) {
    assert.match(resource, /^textes\/(russian|english)\/chapter_3\/[a-z_]+$/);
    const language = resource.split('/')[1];
    for (const match of script.matchAll(/\bnext\s+(chapter_3\/[a-z_]+)/gi)) assert.ok(scripts3[`textes/${language}/${match[1]}`], `Dangling link in ${resource}`);
    if (language === 'english') for (const line of script.split('\n')) assert.doesNotMatch(parseLine(line).text, /[а-яё]/iu, `Untranslated English paragraph in ${resource}`);
  }
});
for (const language of languages) test(`${language}: all 27 authored routes reach nine main scenes and the shared unresolved ending`, () => {
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const selected = [a, b, c], result = full(selected, language); routeAssertions(result, selected, language);
    completed.push({ ...result, language });
  }
});
test('all 36 compiled resources are reached, while old chapters remain separate from chapter-three history', () => {
  assert.equal(completed.length, 54); assert.deepEqual([...entered].sort(), Object.keys(scripts3).sort());
  assert.ok(completed.every(result => result.snapshot.history.every(row => ['Narrator', 'Pacifica', 'Gideon', 'Wendy'].includes(row.speaker))));
});
test('actual provided canon carries through chapter three without inventing cloth or altering the original unfinished save', () => {
  assert.equal(prior.choices['ch1.tracks'], 'Bold'); assert.equal(prior.derived.relationships.pacifica_gideon.total, 3);
  assert.equal(prior.progress[2].completed, false); assert.equal(prior.progress[2].sceneId, 'chapter_2/symbol'); assert.equal(prior.progress[2].line, 14);
  const result = full([2, 2, 2]);
  assert.equal(result.canon.derived.flags.pacifica_bold.value, 1); assert.equal(result.canon.derived.flags.gideon_openness.value, 1);
  assert.equal(result.canon.derived.flags.chapter1_cautious_end.value, true);
  assert.equal(result.canon.derived.inventory.cloth_scrap, undefined); assert.equal(result.snapshot.flags.extra_clue_01, false);
  assert.equal(createHash('sha256').update(bytes('выборы.json')).digest('hex'), userHash);
  assert.deepEqual(JSON.parse(bytes('выборы.json')).canon, prior);
});
test('Chapter 2 fate variants select only their corresponding continuity paragraphs in the authored opening', () => {
  const guarded = source.start.rows.filter(row => row.when?.flag === 'creature_fate');
  assert.deepEqual(guarded.map(row => row.when.equals).sort(), ['Expel', 'Help', 'Neutralize']);
  for (const fate of ['Help', 'Expel', 'Neutralize']) for (const language of languages) {
    const earlier = canonWith({ 'ch2.creature_fate': fate }), engine = makeEngine(language); start(engine, earlier);
    for (let i = 0; engine.state.phase !== 'choice' && i < 2000; i++) engine.advance();
    assert.equal(engine.state.script, namespace + 'first_talk');
    const text = new Set(engine.state.history.map(row => plainText(row.text)));
    for (const row of guarded) assert.equal(text.has(row[language === 'russian' ? 'ru' : 'en']), row.when.equals === fate, `${language}: ${fate}`);
    assert.equal(engine.state.flags.creature_trust, Number(fate === 'Help'));
  }
});
for (const language of languages) test(`${language}: save/load preserves choice, danger, prop and ending presentation states`, () => {
  const checkpoints = [], selected = [1, 2, 0], original = full(selected, language, prior, checkpoints);
  assert.ok(checkpoints.length >= 10); assert.ok(checkpoints.some(point => point.name === 'item:wooden_weight'));
  for (const checkpoint of checkpoints) {
    const originalBytes = JSON.stringify(checkpoint.snapshot), engine = makeEngine(language);
    engine.restore(clone(checkpoint.snapshot)); assert.deepEqual(engine.snapshot(), checkpoint.snapshot, checkpoint.name);
    const resumed = drive(engine, selected, { earlier: prior, taken: checkpoint.taken });
    assert.deepEqual(resumed.snapshot.history, original.snapshot.history, checkpoint.name);
    assert.deepEqual(resumed.snapshot.flags, original.snapshot.flags, checkpoint.name);
    assert.deepEqual(resumed.snapshot.presentation, original.snapshot.presentation, checkpoint.name);
    assert.deepEqual(resumed.snapshot.chars, original.snapshot.chars, checkpoint.name);
    assert.deepEqual(resumed.canon.choices, original.canon.choices, checkpoint.name);
    assert.deepEqual(resumed.canon.derived, original.canon.derived, checkpoint.name);
    assert.equal(JSON.stringify(checkpoint.snapshot), originalBytes, 'Restore must not mutate the saved checkpoint');
  }
});
test('all 18 decision-map nodes replay real scripts and maintain earlier canonical choices', () => {
  const result = full();
  for (const language of languages) for (const node of getFlowGraph(3).nodes) {
    const snapshot = createCanonicalFlowJump({ ...resources, language, chapter: 3, nodeId: node.id, canon: result.canon });
    assert.equal(snapshot.script, namespace + node.id); assert.equal(snapshot.flags.monster, 'Wendigo');
    assert.equal(snapshot.flags.threat_plan, 'Protect'); assert.equal(snapshot.flags.creature_fate, 'Help');
    assert.deepEqual(snapshot.inventory, ['journal_3']);
    const selected = decisions.flatMap(choice => choice.nodes.map((id, index) => ({ id, choice, index }))).find(row => row.id === node.id);
    if (selected) assert.equal(snapshot.flags[selected.choice.flag], selected.choice.values[selected.index]);
    const replay = makeEngine(language); replay.restore(snapshot);
    const taken = decisions.filter(decision => snapshot.flags[decision.flag]).length;
    const indices = decisions.map(decision => Math.max(0, decision.values.indexOf(snapshot.flags[decision.flag] ?? result.canon.choices[decision.id])));
    assert.equal(drive(replay, indices, { taken, earlier: result.canon }).snapshot.phase, 'credits');
  }
});
test('real chapter-three rewrite, export/import and alternatives preserve all official earlier decisions', () => {
  const official = full([1, 1, 2]), data = new Map(), adapter = { get: key => data.get(key) ?? null, set(key, value) { data.set(key, clone(value)); return true; } };
  const story = createStoryStateService({ storage: adapter, registry: STORY_REGISTRY });
  story.init(createStoryEnvelope({ canon: official.canon, snapshots: { 3: official.snapshot } }, STORY_REGISTRY));
  const exported = story.exportSave(), temporary = full([0, 0, 0]);
  story.createAlternativeSession({ canon: temporary.canon, snapshots: { 3: temporary.snapshot } });
  assert.deepEqual(story.exportSave().canon, exported.canon); assert.equal(story.getRelationship('pacifica_gideon'), 3);
  story.exitAlternative();
  story.rewriteCanonFrom('ch3.exit_plan', 'HoldGate', { prepare(candidate, old) { Object.assign(candidate, rebuildSnapshotsForRewrite(candidate, old, resources)); } });
  assert.equal(story.getRelationship('pacifica_gideon'), 4); assert.equal(story.hasFlag('ch3_object_secured'), false);
  assert.equal(story.getState().snapshots[3].script, namespace + 'night_gate'); assert.equal(story.getState().snapshots[3].phase, 'credits');
  assert.equal(story.exportSave().canon.choices['ch3.exit_plan'], 'HoldGate');
  const timeline = buildCanonTimeline(story.getCanon());
  assert.ok(timeline.nodes.some(node => node.chapterId === 3 && node.nodeId === 'exit_holdgate'));
  assert.ok(!timeline.nodes.some(node => node.chapterId === 3 && node.nodeId === 'exit_securebag'));
  story.importSave(JSON.stringify(exported)); assert.deepEqual(story.getCanon(), official.canon);
  const loaded = createStoryStateService({ storage: adapter, registry: STORY_REGISTRY }); loaded.init();
  assert.deepEqual(loaded.getCanon(), official.canon);
  for (const [id, value] of Object.entries(prior.choices)) assert.equal(loaded.getChoice(id), value);
});
test('acting remains varied but restrained, and chapter-three voice slots cannot use old recordings or system speech', () => {
  const russian = Object.entries(scripts3).filter(([key]) => key.startsWith('textes/russian/')).map(([, source]) => source).join('\n');
  const plan = read('assets/chapter3-voice-plan.json'), paragraphs = plan.lines.filter(slot => slot.language === 'russian').length;
  const expressions = [...russian.matchAll(/\[expression /g)].length, movements = [...russian.matchAll(/\[anim /g)].length;
  assert.ok(expressions >= 20 && expressions < paragraphs, `${expressions} expression commands for ${paragraphs} paragraphs`);
  assert.ok(movements >= 6 && movements < paragraphs / 2, `${movements} transient movements for ${paragraphs} paragraphs`);
  assert.ok([...russian.matchAll(/\[camera shake /g)].length <= 4);
  for (const match of russian.matchAll(/\[camera zoom ([\d.]+)/g)) assert.ok(Number(match[1]) <= 1.08, 'Soft camera scale is retained');
  assert.doesNotMatch(russian, /\[sfx ch2_mimic_|\[voice |\[char showi? (?:Will|Mabel|Dipper|Creature|Predator)\b/i);
  assert.equal(plan.allowSystemSpeech, false); assert.ok(plan.lines.length > 300);
  assert.ok(plan.lines.every(slot => slot.status === 'pending' && slot.script.startsWith(namespace)));
  for (const context of [{ chapter: 3 }, { chapter: 'chapter_3' }, { script: 'textes/russian/chapter_3/bag' }]) assert.equal(dialogueVoiceAllowed(context), false);
});
test('chapter-three scale stays comparable to the installed chapter two without filler-sized inflation', () => {
  const report = read('assets/chapter3-build-report.json'), previous = read('assets/chapter2-build-report.json');
  assert.equal(report.resources, 36); assert.equal(report.scenes, 9); assert.equal(report.choices, 3);
  const rawRussian = Object.values(source).flatMap(resource => resource.rows).reduce((total, row) => total + words(row.ru).length, 0);
  assert.ok(Math.abs(report.counts.russian.words - rawRussian) < 30, 'Build report must count the actual Russian source');
  assert.ok(rawRussian >= 5000 && rawRussian <= 7000, `Actual Russian source has ${rawRussian} words`);
  const ratio = rawRussian / previous.counts.russian.words;
  assert.ok(ratio >= .85 && ratio <= 1.15, `Chapter 3/2 size ratio is ${ratio.toFixed(3)}`);
  assert.equal(report.counts.russian.paragraphs, report.counts.english.paragraphs);
});
test('all runtime backgrounds, props, expressions and sounds resolve to installed resources', () => {
  const manifest = read('assets/manifest.json'), audio = read('assets/chapter2-audio.json');
  const backgrounds = { ...art1.backgrounds, ...art2.backgrounds, ...art3.backgrounds }, items = { ...art1.items, ...art2.items, ...art3.items };
  const textures = new Set(Object.keys(manifest.textures).map(key => key.toLowerCase())), sprites = new Set(Object.keys(manifest.sprites).map(key => key.toLowerCase())), music = new Set(Object.keys(manifest.audio).map(key => key.toLowerCase()));
  for (const [resource, script] of Object.entries(scripts3)) for (const line of script.split('\n')) for (const segment of parseLine(line).segments.filter(segment => segment.type === 'command')) {
    const [command, action, target] = segment.args.map(value => value.toLowerCase());
    if (command === 'bg' && action?.startsWith('change')) {
      const original = config.backgrounds[target]?.texture?.toLowerCase() || target;
      assert.ok(backgrounds[target] || textures.has(original) || target === 'black', `Missing ${target} in ${resource}`);
    }
    if (command === 'item' && action?.startsWith('show')) assert.ok(items[target] || textures.has(target) || sprites.has(target), `Missing prop ${target}`);
    if (command === 'music' && !['stop', 'mute'].includes(action)) assert.ok(music.has(action), `Missing music ${action}`);
    if (command === 'sfx') assert.ok(audio.effects?.[action]?.path || music.has(action) || ['bell', 'forest_wind', 'branch_crack'].includes(action), `Missing SFX ${action}`);
    if (command === 'expression') {
      const character = Object.entries(characters).find(([id]) => id.toLowerCase() === action)?.[1]; assert.ok(character, `Unknown acting character ${action}`);
      // The engine/renderer explicitly allow original defaults and expression fallbacks.
      assert.ok(target && /^[a-z_]+$/.test(target));
    }
  }
  for (const section of ['backgrounds', 'sprites', 'items']) for (const entry of Object.values(art3[section] || {})) for (const descriptor of [entry, ...Object.values(entry.expressions || {})]) {
    if (!descriptor.path) continue;
    assert.ok(!/^https?:/i.test(descriptor.path)); assert.ok(exists(descriptor.path));
    const file = bytes(descriptor.path); assert.ok(file.length > 100);
    if (descriptor.path.endsWith('.png')) {
      assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(file.readUInt32BE(16), descriptor.sourceWidth); assert.equal(file.readUInt32BE(20), descriptor.sourceHeight);
    }
  }
  assert.ok(art3.backgrounds.ch3_lumber_yard && art3.backgrounds.ch3_cutting_floor && art3.items.ch3_wooden_weight);
});
