import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StoryEngine, parseLine, plainText } from '../engine.js';
import { createStoryEnvelope } from '../story-state.js';
import { STORY_REGISTRY, choicesFromSnapshot, progressFromSnapshot, reconcileSnapshot, seedChapterFlags, seedChapterInventory } from '../story-bridge.js';
import { getFlowGraph } from '../flowchart.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const exists = name => fs.existsSync(new URL('../' + name, import.meta.url));
const scripts = read('assets/chapter2-scripts.json'), config = read('assets/config.json'), art1 = read('assets/chapter1-art.json');
const art2 = exists('assets/chapter2-art.json') ? read('assets/chapter2-art.json') : {};
// The story tests can run while modular artwork is being produced; the separate
// asset test below still requires every final runtime character/asset reference.
const newCast = Object.fromEntries(['Creature', 'Predator', 'SmallDog', 'Cat'].map(name => [name, { name }]));
const characters = { ...config.characters, ...art1.characters, ...newCast, ...art2.characters };
const actualSave = read('tests/fixtures/chapter1-canon.json');
const namespace = 'chapter_2/';
const languages = ['russian', 'english'], monsters = ['Werewolf', 'Wendigo', 'Vampire'], priorEndings = ['Bold', 'Cautious', 'Observation'];
const decisions = [
  { id: 'ch2.trail_focus', hub: 'two_tracks', flag: 'trail_focus', values: ['LargeTracks', 'Journal', 'Perimeter'], branches: ['trail_largetracks', 'trail_journal', 'trail_perimeter'], merge: 'watch_hut' },
  { id: 'ch2.threat_plan', hub: 'real_threat', flag: 'threat_plan', values: ['Distract', 'Block', 'Protect'], branches: ['plan_distract', 'plan_block', 'plan_protect'], merge: 'water_climax' },
  { id: 'ch2.creature_fate', hub: 'creature_question', flag: 'creature_fate', values: ['Help', 'Expel', 'Neutralize'], branches: ['fate_help', 'fate_expel', 'fate_neutralize'], merge: 'symbol' }
];
const scenes = ['start', 'two_tracks', 'watch_hut', 'rock_hollow', 'hidden_shelter', 'real_picture', 'real_threat', 'creature_question', 'symbol'];
const allowedVisible = new Set(['pacifica', 'gideon', 'creature', 'predator', 'dog', 'smalldog', 'cat']);
const entered = new Set(), soundCues = new Set(), completed = [];
const clone = value => JSON.parse(JSON.stringify(value));
const words = value => String(value).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || [];
function seedCanon(monster = 'Wendigo', ending = 'Cautious', overrides = {}) {
  return createStoryEnvelope({ canon: { ...clone(actualSave.canon), currentChapter: 2,
    choices: { ...actualSave.canon.choices, 'ch0.creature': monster, 'ch1.ending': ending, ...overrides } }
  }, STORY_REGISTRY).canon;
}
function makeEngine(language = 'russian') {
  return new StoryEngine({ scripts, characters, language, onEvent(event) {
    if (event.type === 'script') entered.add(event.resource);
    if (event.type === 'sfx') soundCues.add(event.name);
    if (event.type === 'character') for (const char of Object.values(event.characters || {})) {
      if (char.visible) assert.ok(allowedVisible.has(char.id), `Unrequested cameo/old monster ${char.id} at ${event.sourceScript}`);
    }
  } });
}
function start(engine, canon) { engine.start(namespace + 'start', { flags: seedChapterFlags(canon, 2), inventory: seedChapterInventory(canon, 2) }); }
function projection(engine, canon) {
  const raw = engine.snapshot();
  const current = createStoryEnvelope({ canon: { ...clone(canon), choices: { ...canon.choices, ...choicesFromSnapshot(raw) }, currentChapter: 2,
    progress: { ...canon.progress, 2: progressFromSnapshot(raw) } }
  }, STORY_REGISTRY).canon;
  const fixed = reconcileSnapshot(raw, current);
  engine.state.flags = fixed.flags; engine.state.inventory = fixed.inventory;
  return current;
}
function drive(engine, selected, { taken = 0, canon = null, checkpoints = null } = {}) {
  let steps = 0;
  const captured = new Set();
  const capture = name => {
    if (!checkpoints || captured.has(name)) return;
    captured.add(name);
    if (canon) projection(engine, canon);
    checkpoints.push({ name, taken, snapshot: engine.snapshot() });
  };
  while (engine.state.phase !== 'credits') {
    assert.ok(++steps < 4000, `Nonterminating Chapter 2 route at ${engine.state.script}`);
    const leaf = engine.state.script.slice(namespace.length);
    if (['water_climax', 'creature_question', 'symbol'].includes(leaf)) capture('scene:' + leaf);
    if (engine.events.some(event => event.type === 'sfx' && event.name === 'ch2_water_rush')) capture('cue:rushing_water');
    if (engine.state.phase === 'choice') {
      const decision = decisions[taken];
      assert.ok(decision, 'Chapter 2 must have exactly three decisions');
      assert.equal(engine.state.script, namespace + decision.hub);
      assert.equal(engine.state.choices.length, 3);
      for (const option of engine.state.choices) assert.ok(plainText(option.text).length > 5 && option.order?.length);
      capture('before:' + decision.id);
      engine.choose(selected[taken++]);
      capture('after:' + decision.id);
    } else {
      assert.ok(['dialogue', 'pause'].includes(engine.state.phase), `Unexpected Chapter 2 state: ${engine.state.phase}`);
      engine.advance();
    }
  }
  assert.equal(taken, 3);
  const canonical = canon ? projection(engine, canon) : null;
  return { snapshot: engine.snapshot(), canonical };
}
function checkRoute(snapshot, monster, ending, selected) {
  assert.equal(snapshot.script, namespace + 'symbol'); assert.equal(snapshot.phase, 'credits');
  assert.equal(snapshot.flags.monster, monster); assert.equal(snapshot.flags.ending, ending);
  for (const [index, decision] of decisions.entries()) assert.equal(snapshot.flags[decision.flag], decision.values[selected[index]]);
  assert.deepEqual(snapshot.inventory, ['journal_3'], 'Ordinary preparation and local clues are not persistent loot');
  const paths = [...new Set(snapshot.history.map(row => row.script.slice(namespace.length)))];
  for (const scene of scenes) assert.ok(paths.includes(scene), `Missing main scene ${scene}`);
  assert.ok(paths.includes('water_climax'));
  for (const [index, decision] of decisions.entries()) {
    assert.ok(paths.includes(decision.branches[selected[index]]));
    for (const branch of decision.branches.filter((_, value) => value !== selected[index])) assert.ok(!paths.includes(branch), `Wrong branch ${branch}`);
    const selectedAt = paths.indexOf(decision.branches[selected[index]]), rejoinAt = paths.indexOf(decision.merge);
    assert.ok(rejoinAt > selectedAt, `Branch does not rejoin ${decision.merge}`);
  }
  assert.ok(snapshot.history.every(row => row.script.startsWith(namespace)));
  assert.ok(snapshot.history.length > 300, 'Chapter 2 must remain a full visual novel');
  assert.equal(snapshot.item, 'symbol_ch2_unknown_provisional');
  assert.equal(snapshot.music, null, 'The chapter ends on the symbol without a victory track');
  assert.equal(snapshot.presentation.ambience, 'road_night');
  assert.ok(Object.values(snapshot.chars).every(char => !char.visible), 'The final image contains no hidden observer or cameo');
}

test('Chapter 2 has complete bilingual resources, exactly three stable choices and matching reconvergence', () => {
  assert.equal(Object.keys(scripts).length, 38);
  for (const language of languages) {
    const names = Object.keys(scripts).filter(key => key.startsWith(`textes/${language}/`));
    assert.equal(names.length, 19);
    for (const [index, decision] of decisions.entries()) {
      const definition = STORY_REGISTRY.choices.find(choice => choice.id === decision.id);
      assert.equal(definition.chapterId, 2); assert.deepEqual(definition.options.map(option => option.id), decision.values);
      assert.equal(definition.rejoinNode, decision.merge);
    }
  }
  for (const [resource, source] of Object.entries(scripts)) {
    assert.match(resource, /^textes\/(russian|english)\/chapter_2\/[a-z_]+$/);
    const language = resource.split('/')[1];
    for (const match of source.matchAll(/\bnext\s+(chapter_2\/[a-z_]+)/gi)) assert.ok(scripts[`textes/${language}/${match[1]}`], `Dangling transition in ${resource}`);
  }
});
for (const language of languages) test(`${language}: all 243 Chapter 2 routes carry the actual earlier monster/ending and complete all nine scenes`, () => {
  let count = 0;
  for (const monster of monsters) for (const ending of priorEndings) for (let first = 0; first < 3; first++) for (let second = 0; second < 3; second++) for (let third = 0; third < 3; third++) {
    const selected = [first, second, third], engine = makeEngine(language), canon = seedCanon(monster, ending);
    start(engine, canon);
    const { snapshot } = drive(engine, selected);
    checkRoute(snapshot, monster, ending, selected);
    completed.push({ language, monster, ending, selected, snapshot }); count++;
  }
  assert.equal(count, 243);
});
test('every compiled resource is actually reached in both languages, with no extra choice scenes', () => {
  assert.equal(completed.length, 486);
  assert.deepEqual([...entered].sort(), Object.keys(scripts).sort());
  for (const language of languages) {
    const hubs = Object.entries(scripts).filter(([name, source]) => name.startsWith(`textes/${language}/`) && /\[Button text 1 /.test(source));
    assert.deepEqual(hubs.map(([name]) => name.split('/').at(-1)).sort(), decisions.map(choice => choice.hub).sort());
  }
});
for (const language of languages) test(`${language}: saves before/after each choice and during climax/aftermath/finale restore the same remaining chapter`, () => {
  let restores = 0;
  for (const value of [0, 1, 2]) {
    const selected = [value, value, value], canon = seedCanon(), original = makeEngine(language), checkpoints = [];
    start(original, canon);
    const final = drive(original, selected, { canon, checkpoints });
    assert.equal(checkpoints.length, 10);
    for (const { name, taken, snapshot } of checkpoints) {
      const bytes = JSON.stringify(snapshot), engine = makeEngine(language);
      engine.restore(snapshot); assert.deepEqual(engine.snapshot(), snapshot, name);
      const resumed = drive(engine, selected, { taken, canon });
      assert.deepEqual(resumed.snapshot.history, final.snapshot.history, name);
      assert.deepEqual(resumed.snapshot.flags, final.snapshot.flags, name);
      assert.deepEqual(resumed.snapshot.inventory, final.snapshot.inventory, name);
      assert.deepEqual(resumed.snapshot.presentation, final.snapshot.presentation, name);
      assert.deepEqual(resumed.canonical.choices, final.canonical.choices, name);
      assert.deepEqual(resumed.canonical.derived, final.canonical.derived, name);
      assert.equal(JSON.stringify(snapshot), bytes, 'Loading does not mutate its source save'); restores++;
    }
  }
  assert.equal(restores, 30);
});
test('the supplied intended canon keeps its earlier counters and derives only the selected C2 knowledge/relationship sources', () => {
  assert.deepEqual(actualSave.canon.choices, { 'ch0.creature': 'Wendigo', 'ch1.gideon_reason': 'Openness', 'ch1.tracks': 'Journal', 'ch1.slope': 'Pacifica', 'ch1.ending': 'Cautious' });
  for (let first = 0; first < 3; first++) for (let second = 0; second < 3; second++) for (let third = 0; third < 3; third++) {
    const canon = seedCanon(), engine = makeEngine(); start(engine, canon);
    const { snapshot, canonical } = drive(engine, [first, second, third], { canon });
    assert.equal(canonical.derived.flags.gideon_openness.value, 1); assert.equal(canonical.derived.flags.journal_doubt.value, 1);
    assert.equal(canonical.derived.flags.chapter1_cautious_end.value, true);
    const trust = canonical.derived.relationships.pacifica_gideon;
    assert.equal(trust.total, 2 + Number(second === 2));
    assert.equal(trust.modifiers.filter(row => row.source === 'ch2.threat_plan.Protect').length, Number(second === 2));
    assert.equal(canonical.derived.relationships.creature_trust?.total ?? 0, Number(third === 0));
    for (const character of ['pacifica', 'gideon']) {
      const knowledge = canonical.derived.knowledge[character] || {};
      for (const [index, key] of ['ch2_large_fiber', 'ch2_track_mismatch', 'ch2_tracks_separate'].entries()) {
        assert.equal(!!knowledge[key], first === index);
        if (knowledge[key]) assert.deepEqual(knowledge[key].sources, [`ch2.trail_focus.${decisions[0].values[first]}`]);
      }
      assert.equal(!!knowledge.ch2_predator_reacts_to_motion, second === 1);
    }
    assert.equal(snapshot.flags.creature_fate, decisions[2].values[third]);
  }
});
test('a different valid C1 route keeps its cloth clue, relationship base and Journal doubt unchanged', () => {
  const canon = seedCanon('Vampire', 'Bold', { 'ch1.gideon_reason': 'Deflect', 'ch1.tracks': 'Search', 'ch1.slope': 'Gideon' });
  const engine = makeEngine(); start(engine, canon); const { snapshot, canonical } = drive(engine, [1, 2, 2], { canon });
  assert.deepEqual(snapshot.inventory.sort(), ['cloth_scrap', 'journal_3']);
  assert.equal(canonical.derived.relationships.pacifica_gideon.total, 1);
  assert.equal(canonical.derived.flags.journal_doubt?.value ?? 0, 0);
  assert.equal(canonical.derived.inventory.cloth_scrap.sources[0], 'ch1.tracks.Search');
});
test('Creature language stays sparse, Neutralize stays nonlethal, and the shared ending preserves the unclassified symbol', () => {
  const russian = completed.filter(route => route.language === 'russian');
  const creatureLines = russian[0].snapshot.history.filter(row => row.speaker.toLowerCase() === 'creature');
  assert.ok(creatureLines.length >= 20, 'The creature must speak, rather than remain a silent prop');
  assert.ok(creatureLines.every(row => words(plainText(row.text)).length <= 6), 'The creature does not acquire perfect conversational language');
  const final = russian[0].snapshot.history.filter(row => row.script === namespace + 'symbol');
  assert.ok(final.some(row => row.speaker === 'Pacifica' && row.text.includes('Дневник был полезен. Но если бы мы просто ему поверили')));
  assert.ok(final.some(row => row.speaker === 'Gideon' && row.text.includes('Мы бы нашли не того монстра.')));
  assert.ok(final.some(row => /такого нет|ничего похожего нет/i.test(row.text)));
  const neutral = russian.find(route => route.selected[2] === 2).snapshot.history.filter(row => row.script === namespace + 'fate_neutralize').map(row => row.text).join('\n');
  assert.match(neutral, /не значит.{0,30}убивать/i);
  assert.match(neutral, /животных больше не|больше не.{0,20}животных/i);
  assert.match(neutral, /домам|домов/);
  assert.ok(final.every(row => ['Narrator', 'Gideon', 'Pacifica'].includes(row.speaker)));
});
test('the three decisions are visible on the existing map, rejoin locally and expose no future lore', () => {
  const graph = getFlowGraph(2);
  assert.equal(graph.chapter, 2);
  for (const decision of decisions) for (const branch of decision.branches) {
    assert.ok(graph.nodes.some(node => node.id === branch));
    assert.ok(graph.edges.some(edge => edge.from === decision.hub && edge.to === branch));
    assert.ok(graph.edges.some(edge => edge.from === branch && edge.to === decision.merge));
  }
  for (const node of graph.nodes) for (const detail of Object.values(node.detail)) assert.doesNotMatch(detail, /Chapter\s*(?:[3-9]|[1-6]\d)|глав[аы]\s*(?:[3-9]|[1-6]\d)|symbol means|значение символа/i);
});
test('the final authored chapter meets the requested Russian scale without replacing narrative with a few brief scenes', () => {
  const report = read('assets/chapter2-build-report.json');
  assert.equal(report.scenes, 9); assert.equal(report.choices, 3);
  assert.ok(report.counts.russian.words >= 5000 && report.counts.russian.words <= 7000, `Russian chapter has ${report.counts.russian.words} words; expected approximately 5000–7000`);
  assert.ok(report.counts.russian.physicalLines >= 2300 && report.counts.russian.physicalLines <= 3300, `Russian chapter has ${report.counts.russian.physicalLines} script lines`);
  assert.ok(report.counts.russian.paragraphs >= 500);
});
test('final artwork and audio resolve every runtime background, character, prop and sound path', () => {
  assert.ok(exists('assets/chapter2-art.json'), 'Final Chapter 2 art manifest has not been assembled');
  const art = read('assets/chapter2-art.json'), audio2 = read('assets/chapter2-audio.json'), manifest = read('assets/manifest.json');
  const backgroundAliases = { ...art1.backgrounds, ...art.backgrounds };
  const props = { ...art1.items, ...art.items }, addedSprites = { ...art1.sprites, ...art.sprites };
  const knownCharacters = new Set(Object.keys({ ...config.characters, ...art1.characters, ...art.characters }).map(key => key.toLowerCase()));
  const textures = new Set(Object.keys(manifest.textures).map(key => key.toLowerCase())), sprites = new Set(Object.keys(manifest.sprites).map(key => key.toLowerCase())), music = new Set(Object.keys(manifest.audio).map(key => key.toLowerCase()));
  for (const [resource, source] of Object.entries(scripts)) for (const line of source.split('\n')) for (const segment of parseLine(line).segments.filter(segment => segment.type === 'command')) {
    const command = segment.args.map(value => value.toLowerCase()), target = command[2];
    if (command[0] === 'bg' && command[1]?.startsWith('change')) {
      const original = config.backgrounds[target]?.texture?.toLowerCase() || target;
      assert.ok(backgroundAliases[target] || textures.has(original) || target === 'black', `Missing background ${target} in ${resource}`);
    }
    if (command[0] === 'music' && !['stop', 'mute'].includes(command[1])) assert.ok(music.has(command[1]), `Missing music ${command[1]}`);
    if (command[0] === 'sfx') {
      const cue = audio2.effects?.[command[1]] || audio2.voiceCues?.[command[1]];
      assert.ok(cue?.path || music.has(command[1]) || ['bell', 'branch_crack', 'dog_whine'].includes(command[1]), `Missing sound recording ${command[1]}`);
    }
    if (command[0] === 'item' && command[1]?.startsWith('show')) assert.ok(props[target] || addedSprites[target] || textures.has(target) || sprites.has(target), `Missing prop ${target}`);
    if (command[0] === 'char') assert.ok(command.slice(1).some(token => knownCharacters.has(token)), `Unknown character command ${line}`);
  }
  for (const section of ['backgrounds', 'sprites', 'items']) for (const entry of Object.values(art[section] || {})) {
    // Expression replacements are separate files; a valid default sprite must
    // not hide a missing pose that only appears after a later scene/branch.
    for (const layer of [entry, ...Object.values(entry.expressions || {})]) if (layer.path) {
      const file = fs.readFileSync(new URL('../' + layer.path, import.meta.url));
      assert.ok(file.length > 50, `Empty artwork ${layer.path}`);
      if (layer.path.endsWith('.png')) {
        assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `Invalid PNG ${layer.path}`);
        assert.equal(file.readUInt32BE(16), layer.sourceWidth, `Wrong source width ${layer.path}`);
        assert.equal(file.readUInt32BE(20), layer.sourceHeight, `Wrong source height ${layer.path}`);
      }
      if (layer.poseAliasOf) assert.equal(layer.path, entry.expressions[layer.poseAliasOf]?.path, `Undocumented pose alias ${layer.poseAliasOf}`);
    }
  }
  for (const [id, poses] of [['creature', ['neutral', 'defensive', 'listening']], ['predator', ['crouched', 'aggressive', 'recoiling']]]) {
    const sprite = art.sprites[id];
    assert.equal(sprite.provisional, true, `${id} artwork must remain provisional`);
    assert.equal(new Set(poses.map(pose => sprite.expressions[pose]?.path)).size, 3, `${id} needs three distinct documented postures`);
    assert.ok(poses.every(pose => sprite.expressions[pose]?.path), `${id} posture is missing`);
  }
  assert.equal(art.items.symbol_ch2_unknown_provisional.provisional, true);
  for (const name of ['ch2_mimic_buster', 'ch2_mimic_pacifica', 'ch2_mimic_gideon']) assert.ok(soundCues.has(name), `Unused imitation cue ${name}`);
  for (const [name, entry] of Object.entries({ ...audio2.effects, ...audio2.voiceCues })) if (entry.path) assert.ok(fs.statSync(new URL('../' + entry.path, import.meta.url)).size > 100, `Missing audio ${name}`);
});
