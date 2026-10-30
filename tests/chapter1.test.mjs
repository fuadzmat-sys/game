import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { StoryEngine, parseLine, plainText } from '../engine.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../assets/${name}.json`, import.meta.url), 'utf8'));
const scripts = read('chapter1-scripts'), config = read('config'), art = read('chapter1-art'), manifest = read('manifest');
const characters = { ...config.characters, ...art.characters };
const languages = ['russian', 'english'], monsters = ['Werewolf', 'Wendigo', 'Vampire'];
const namespace = 'chapter_1_v3/';
const decisions = [
  { hub: 'reason', selector: 'reason', values: ['Deflect', 'Curiosity', 'Openness'], branches: ['reason_deflect', 'reason_curiosity', 'reason_openness'], merge: 'cafe_after' },
  { hub: 'tracks', selector: 'tracks', values: ['Bold', 'Journal', 'Search'], branches: ['tracks_bold', 'tracks_journal', 'tracks_search'], merge: 'animals' },
  { hub: 'deep_forest', selector: 'descent', values: ['Pacifica', 'Gideon', 'Careful'], branches: ['descent_pacifica', 'descent_gideon', 'descent_careful'], merge: 'clearing' },
  { hub: 'watched', selector: 'ending', values: ['Bold', 'Cautious', 'Observation'], branches: ['ending_bold', 'ending_cautious', 'ending_observation'], merge: 'blue_glow' },
];
const sharedScenes = ['start', 'cafe', 'reason', 'cafe_after', 'yard', 'yard_after', 'forest_edge', 'tracks', 'animals', 'false_alarm', 'deep_forest', 'clearing', 'clearing_after', 'watched', 'blue_glow', 'will'];
const entered = new Set(), effects = new Set(), completed = [];

function makeEngine(language = 'russian') {
  return new StoryEngine({ scripts, characters, language, onEvent(event, state) {
    if (event.type === 'script') entered.add(event.resource);
    if (event.type === 'sfx') effects.add(event.name);
    if (event.type === 'character') for (const char of Object.values(event.characters || {})) {
      if (!char.visible) continue;
      assert.ok(!['mabel', 'dipper', 'vampire', 'wendigo', 'werewolf', 'mothman'].includes(char.id), `Obsolete attack/twins scene: ${char.id} in ${state.script}`);
      if (char.id === 'will') assert.equal(state.script, namespace + 'will', 'Will stays unseen until the final cutaway');
    }
  } });
}
function drive(engine, selected, { taken = 0, snapshots = null } = {}) {
  let steps = 0;
  while (engine.state.phase !== 'credits') {
    assert.ok(++steps < 3000, `Nonterminating route at ${engine.state.script}`);
    if (engine.state.phase === 'choice') {
      const decision = decisions[taken];
      assert.ok(decision, 'Only four decisions are allowed');
      assert.equal(engine.state.script, namespace + decision.hub);
      assert.equal(engine.state.choices.length, 3);
      for (const option of engine.state.choices) assert.ok(plainText(option.text).length > 8 && option.order?.length);
      if (snapshots) snapshots.push({ taken, snapshot: engine.snapshot() });
      engine.choose(selected[taken++]);
    } else {
      assert.ok(['dialogue', 'pause'].includes(engine.state.phase), `Unexpected phase ${engine.state.phase}`);
      engine.advance();
    }
  }
  assert.equal(taken, 4);
  return engine.snapshot();
}
function checkOutcome(snapshot, monster, selected) {
  const flags = snapshot.flags;
  assert.equal(snapshot.script, namespace + 'will');
  assert.equal(flags.monster, monster);
  for (const [i, decision] of decisions.entries()) assert.equal(flags[decision.selector], decision.values[selected[i]]);
  for (const [flag, expected] of Object.entries({
    gideon_deflects: Number(selected[0] === 0), gideon_curiosity: Number(selected[0] === 1), gideon_openness: Number(selected[0] === 2),
    pacifica_bold: Number(selected[1] === 0), journal_doubt: Number(selected[1] === 1), pacifica_protective: Number(selected[2] === 1),
    pacifica_gideon_trust: Number(selected[0] === 2) + Number(selected[2] === 0),
  })) {
    assert.equal(flags[flag] ?? 0, expected, flag);
    if (flags[flag] !== undefined) assert.equal(typeof flags[flag], 'number', `${flag} must be numeric`);
  }
  for (const [flag, expected] of Object.entries({
    extra_clue_01: selected[1] === 2, careful_route: selected[2] === 2,
    chapter1_bold_end: selected[3] === 0, chapter1_cautious_end: selected[3] === 1, chapter1_observation_end: selected[3] === 2,
  })) {
    assert.equal(flags[flag] ?? false, expected, flag);
    if (flags[flag] !== undefined) assert.equal(typeof flags[flag], 'boolean', `${flag} must be boolean`);
  }
  assert.equal(snapshot.inventory.includes('cloth_scrap'), selected[1] === 2);
  assert.equal(new Set(snapshot.inventory).size, snapshot.inventory.length);
  assert.ok(snapshot.inventory.includes('journal_3'), 'Pacifica carries Journal Three');
  for (const obsolete of ['route', 'battle', 'will_trust', 'book1', 'book2', 'show_invitation']) assert.ok(!Object.hasOwn(flags, obsolete), `Old flag leaked: ${obsolete}`);
  const history = snapshot.history;
  assert.ok(history.length >= 350, `Chapter shortened to ${history.length} paragraphs`);
  assert.ok(history.every(row => row.script.startsWith(namespace)));
  const paths = [...new Set(history.map(row => row.script.slice(namespace.length)))];
  for (const scene of sharedScenes) assert.ok(paths.includes(scene), `Missing shared scene ${scene}`);
  for (const prefix of ['cafe', 'yard', 'clearing']) {
    assert.ok(paths.includes(`${prefix}_${monster.toLowerCase()}`));
    for (const other of monsters.filter(value => value !== monster)) assert.ok(!paths.includes(`${prefix}_${other.toLowerCase()}`));
  }
  for (const [i, decision] of decisions.entries()) {
    const branch = decision.branches[selected[i]];
    assert.ok(paths.includes(branch));
    assert.ok(paths.indexOf(branch) < paths.indexOf(decision.merge), `${branch} reconverges at ${decision.merge}`);
    for (const other of decision.branches.filter(value => value !== branch)) assert.ok(!paths.includes(other));
  }
  assert.equal(history.at(-1).script, namespace + 'will');
  assert.equal(history.filter(row => row.speaker === 'Will').length, 1, 'Will only has the prescribed final word');
  const gideon = history.filter(row => row.speaker === 'Gideon').length, pacifica = history.filter(row => row.speaker === 'Pacifica').length;
  assert.ok(gideon > 100 && pacifica > 100);
  assert.ok(gideon / (gideon + pacifica) > .4 && gideon / (gideon + pacifica) < .6, 'Dialogue stays balanced between protagonists');
}
for (const language of languages) for (const monster of monsters) test(`${language}: all 81 four-choice paths for ${monster} complete with exact consequences`, t => {
  let count = 0, min = Infinity, max = 0;
  for (let first = 0; first < 3; first++) for (let second = 0; second < 3; second++) for (let third = 0; third < 3; third++) for (let fourth = 0; fourth < 3; fourth++) {
    const selected = [first, second, third, fourth], engine = makeEngine(language);
    engine.start(namespace + 'start', { flags: { monster } });
    const snapshot = drive(engine, selected);
    checkOutcome(snapshot, monster, selected);
    min = Math.min(min, snapshot.history.length); max = Math.max(max, snapshot.history.length);
    completed.push({ language, monster, selected, snapshot }); count++;
  }
  assert.equal(count, 81);
  t.diagnostic(`${count} paths, ${min}–${max} paragraphs each, four three-way decisions`);
});

// Reads the supplied brief independently of the generator's scene/coverage table.
function canonicalRows() {
  const brief = fs.readFileSync(new URL('../docs/CHAPTER1_REWRITE.md', import.meta.url), 'utf8');
  const body = brief.slice(brief.indexOf('## СЦЕНА 1. УТРО'), brief.indexOf('# CHAPTER 1 COMPLETE'));
  const aliases = { 'Пасифика': 'Pacifica', 'Гидеон': 'Gideon', 'Официантка': 'Waitress', 'Женщина №1': 'Woman_1', 'Женщина №2': 'Woman_2', 'Женщина': 'Woman', 'Мужчина': 'Man', 'Уилл тихо': 'Will' };
  const rows = []; let speaker = 'Narrator';
  for (const source of body.split(/\r?\n/)) {
    const line = source.trim();
    if (!line || line.startsWith('#') || line === '---') continue;
    if (/^\*\*(?:Локация:|Время:|Музыка:|Флаг:|Получен предмет:|Отношения )/.test(line)) continue;
    if (['Здесь игра проверяет выбор Chapter 0.', 'Ветки соединяются.', 'Общая сцена:'].includes(line)) continue;
    if (/^(?:Позже в Chapter 2 |В Chapter 2 |Небольшой бонус к уликам в Chapter 2\.)/.test(line)) continue;
    const label = line.match(/^(.+):$/)?.[1];
    if (label && aliases[label]) { speaker = aliases[label]; continue; }
    rows.push({ speaker: line.startsWith('— ') ? speaker : 'Narrator', text: line.replace(/^— /, '').replace(/\*\*/g, '') });
  }
  return rows;
}
function scriptedRows(language) {
  const rows = [], speakers = new Set(['Narrator', 'Gideon', 'Pacifica', 'Waitress', 'Woman_1', 'Woman_2', 'Woman', 'Man', 'Will']);
  for (const [path, source] of Object.entries(scripts)) {
    if (!path.startsWith(`textes/${language}/`)) continue;
    let speaker = 'Narrator';
    for (const line of source.split(/\r?\n/)) {
      const parsed = parseLine(line);
      for (const segment of parsed.segments) if (segment.type === 'command' && segment.args.length === 1 && speakers.has(segment.args[0])) speaker = segment.args[0];
      if (parsed.text.trim()) rows.push({ speaker, text: plainText(parsed.text).trim() });
    }
  }
  return rows;
}
const paragraphs = source => source.split(/\r?\n/).map(line => plainText(parseLine(line).text).trim()).filter(Boolean);
test('every supplied Russian dialogue and narrative row keeps its exact text and speaker', t => {
  const expected = canonicalRows(), actual = scriptedRows('russian');
  const counts = rows => { const result = new Map(); for (const row of rows) { const key = JSON.stringify(row); result.set(key, (result.get(key) || 0) + 1); } return result; };
  const available = counts(actual), needed = counts(expected), missing = [];
  for (const [key, count] of needed) if ((available.get(key) || 0) < count) missing.push({ ...JSON.parse(key), needed: count, actual: available.get(key) || 0 });
  assert.deepEqual(missing, [], `Missing/altered canonical rows:\n${JSON.stringify(missing, null, 2)}`);
  assert.ok(expected.length > 500, 'The audit includes the full brief');
  const brief = fs.readFileSync(new URL('../docs/CHAPTER1_REWRITE.md', import.meta.url), 'utf8');
  const choiceBlocks = [...brief.matchAll(/^# ВЫБОР №\d[^\n]*\n([\s\S]*?)(?=^# СЦЕНА)/gm)];
  assert.equal(choiceBlocks.length, 4);
  for (const [i, block] of choiceBlocks.entries()) {
    const labels = [...block[1].matchAll(/^### [123]\. (.+)$/gm)].map(match => match[1].replace(/^«|»$/g, ''));
    const implemented = [...scripts[`textes/russian/${namespace}${decisions[i].hub}`].matchAll(/\[Button text [123] ([^\]]+)\]/g)].map(match => match[1]);
    assert.deepEqual(implemented, labels, `Exact choice labels for decision ${i + 1}`);
  }
  t.diagnostic(`${expected.length} exact source rows, including all optional/variant dialogue`);
});
test('every replacement resource is played in both languages and old chapter-one scripts are absent', () => {
  assert.equal(completed.length, 486);
  assert.deepEqual([...entered].sort(), Object.keys(scripts).sort());
  assert.ok(Object.keys(scripts).every(key => /^textes\/(russian|english)\/chapter_1_v3\/[a-z_]+$/.test(key)));
  const paths = Object.keys(scripts).filter(key => key.startsWith('textes/russian/')).map(key => key.slice('textes/russian/'.length));
  assert.equal(paths.length, 37);
  const targets = source => [...source.matchAll(/\bnext\s+(chapter_1_v3\/[a-z_]+)/gi)].map(match => match[1]);
  for (const path of paths) {
    const ru = scripts[`textes/russian/${path}`], en = scripts[`textes/english/${path}`];
    assert.ok(en, `Missing translation ${path}`); assert.deepEqual(targets(ru), targets(en));
    for (const language of languages) for (const target of targets(scripts[`textes/${language}/${path}`])) assert.ok(scripts[`textes/${language}/${target}`], `Dangling target ${target}`);
    assert.equal(paragraphs(ru).length, paragraphs(en).length, `Translation preserves every paragraph in ${path}`);
  }
  const ruText = scriptedRows('russian').map(row => row.text).join('\n');
  for (const obsolete of ['Доставай Дневник! У нас есть то, что мы взяли в Главе 0!', 'Ладно, трусишка.', 'Книгу №2', 'Книге №1', 'малыш Гидеон']) assert.ok(!ruText.includes(obsolete), `Old plot remains: ${obsolete}`);
  const npcLine = completed.find(row => row.language === 'russian').snapshot.history.find(row => row.text.includes('Что будете?'));
  assert.equal(npcLine?.speaker, 'Waitress', 'New NPC speakers are registered in the engine data');
});
for (const language of languages) test(`${language}: all four decision saves restore the same remaining story and consequences`, () => {
  let restores = 0;
  for (const monster of monsters) for (const value of [0, 1, 2]) {
    const selected = [value, value, value, value], original = makeEngine(language), snapshots = [];
    original.start(namespace + 'start', { flags: { monster } });
    const final = drive(original, selected, { snapshots });
    assert.equal(snapshots.length, 4);
    for (const { taken, snapshot } of snapshots) {
      const before = JSON.stringify(snapshot), restored = makeEngine(language);
      restored.restore(snapshot); assert.deepEqual(restored.snapshot(), snapshot);
      const resumed = drive(restored, selected, { taken });
      assert.deepEqual(resumed.flags, final.flags); assert.deepEqual(resumed.inventory, final.inventory);
      assert.deepEqual(resumed.history, final.history); assert.deepEqual(resumed.chars, final.chars); assert.equal(resumed.bg, final.bg);
      assert.equal(JSON.stringify(snapshot), before, 'Restore does not modify its source save'); restores++;
    }
  }
  assert.equal(restores, 36);
});
test('forest ambience and blue-glow cues replace old attack sound effects', () => {
  for (const effect of ['birds', 'forest_wind', 'branch_crack', 'dog_whine', 'unknown_call', 'blue_spark']) assert.ok(effects.has(effect), `Unused SFX ${effect}`);
  for (const obsolete of ['mabel_laugh', 'monster_dissolve', 'fire', 'glass_break']) assert.ok(!effects.has(obsolete), `Old attack SFX ${obsolete}`);
  const full = Object.values(scripts).join('\n');
  assert.match(full, /\[effect blue_glow\]/); assert.match(full, /\[effect clear\]/);
  assert.ok(!/\[(?:voice|sound)\b/i.test(full), 'No obsolete dialogue clips or voice babble are scripted');
});
test('current cast ages, artwork and soundtrack references are complete', () => {
  for (const [name, age] of Object.entries({ gideon: 12, pacifica: 14, mabel: 15, dipper: 15, wendy: 18 })) assert.equal(art.cast[name]?.age, age, name);
  const textureNames = new Set(Object.keys(manifest.textures).map(key => key.toLowerCase())), spriteNames = new Set(Object.keys(manifest.sprites).map(key => key.toLowerCase())), audioNames = new Set(Object.keys(manifest.audio).map(key => key.toLowerCase()));
  const backgrounds = Object.fromEntries(Object.entries(config.backgrounds).map(([key, value]) => [key.toLowerCase(), value])), knownCharacters = new Set(Object.keys(characters).map(key => key.toLowerCase())), addedAssets = new Set([...Object.keys(art.sprites || {}), ...Object.keys(art.items || {})].map(key => key.toLowerCase()));
  for (const [path, source] of Object.entries(scripts)) for (const line of source.split('\n')) for (const segment of parseLine(line).segments.filter(segment => segment.type === 'command')) {
    const lower = segment.args.map(word => word.toLowerCase()), command = lower[0] === 'choice' && lower[1] === 'check' ? lower.slice(4) : lower;
    if (command[0] === 'bg' && ['change', 'changei'].includes(command[1])) { const key = command[2], original = backgrounds[key]?.texture?.toLowerCase() || key; assert.ok(art.backgrounds[key] || textureNames.has(original) || key === 'black', `Missing background ${key} in ${path}`); }
    if (['music', 'voice', 'sound'].includes(command[0]) && !['stop', 'mute'].includes(command[1])) assert.ok(audioNames.has(command[1]), `Missing clip ${command[1]}`);
    if (['item', 'light'].includes(command[0]) && command[1]?.startsWith('show')) assert.ok(textureNames.has(command[2]) || spriteNames.has(command[2]) || addedAssets.has(command[2]), `Missing prop ${command[2]} in ${path}`);
    if (command[0] === 'char') assert.ok(command.slice(1).some(word => knownCharacters.has(word)), `Unrenderable character command ${line}`);
  }
  for (const section of ['backgrounds', 'sprites', 'items']) for (const value of Object.values(art[section] || {})) {
    if (!value.path) continue;
    const bytes = fs.readFileSync(new URL(`../${value.path}`, import.meta.url)); assert.ok(bytes.length > 100, `Empty artwork ${value.path}`);
    if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
      if (value.sourceWidth) assert.equal(bytes.readUInt32BE(16), value.sourceWidth, value.path);
      if (value.sourceHeight) assert.equal(bytes.readUInt32BE(20), value.sourceHeight, value.path);
      if (section === 'sprites' && value.path.includes('/v3/')) assert.equal(bytes[25], 6, 'New prop/character PNGs need RGBA');
    }
  }
});
test('Chapter 0 keeps every command and save line position after text localization', () => {
  const original = JSON.parse(fs.readFileSync(new URL('./fixtures/chapter0-command-layout.json', import.meta.url)));
  const scripts = read('scripts');
  assert.deepEqual(Object.keys(scripts), Object.keys(original));
  for (const [key,text] of Object.entries(scripts)) {
    assert.deepEqual([[text.split(/\r\n|\r|\n/).filter(Boolean).length], text.match(/\[[^\]]*\]/g) || []], original[key], key);
  }
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../assets/manifest.json', import.meta.url))).digest('hex'), 'afb100b0ef8a1bad220acfbfda447b7f3ba697218298a03e795dfc4f1750be0d');
});
