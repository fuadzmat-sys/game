import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_KEY, CHAPTERS, ENDINGS, CHAPTER1_CHOICES, chapterForSnapshot, chapterLanguage, chapterTitle,
  completionSummary, markCompleted, normalizeChapter, normalizeMonster, readCampaign,
  saveKey, seedFlags, validCampaign, chapter2Handoff
} from '../campaign.js';

const snapshot = (chapter = 0, flags = { monster: 'Wendigo' }, phase = 'credits') => ({
  version: 1, script: chapter === 0 ? 'chapter_0/part_3_mothman/mothman_3' : 'chapter_1_v3/will',
  scene: 'credits', phase, flags, inventory: []
});
const finalSave = ({ monster = 'Wendigo', reason = 'Openness', tracks = 'Search', descent = 'Pacifica', ending = 'Observation' } = {}) => ({
  ...snapshot(1, {
    monster, reason, tracks, descent, ending,
    gideon_deflects: Number(reason === 'Deflect'), gideon_curiosity: Number(reason === 'Curiosity'), gideon_openness: Number(reason === 'Openness'),
    pacifica_gideon_trust: Number(reason === 'Openness') + Number(descent === 'Pacifica'),
    pacifica_bold: Number(tracks === 'Bold'), journal_doubt: Number(tracks === 'Journal'), extra_clue_01: tracks === 'Search',
    pacifica_protective: Number(descent === 'Gideon'), careful_route: descent === 'Careful',
    chapter1_bold_end: ending === 'Bold', chapter1_cautious_end: ending === 'Cautious', chapter1_observation_end: ending === 'Observation'
  }),
  inventory: tracks === 'Search' ? ['journal_3', 'cloth_scrap'] : ['journal_3']
});

test('the original chapter-zero storage key is untouched and the replacement has an independent slot', () => {
  assert.equal(saveKey(0), 'reverse-falls-chapter0-save-v1');
  assert.equal(saveKey(1), 'reverse-falls-chapter1-v3-save-v1');
  for (const old of ['reverse-falls-chapter1-save-v1', 'reverse-falls-chapter1-v2-save-v1', saveKey(0), CAMPAIGN_KEY]) assert.notEqual(saveKey(1), old);
  const original = JSON.stringify(snapshot()), oldStory = JSON.stringify({ ...snapshot(1), script: 'chapter_1_v2/start' });
  const storage = new Map([[saveKey(0), original], ['reverse-falls-chapter1-v2-save-v1', oldStory]]);
  storage.set(saveKey(1), JSON.stringify(finalSave()));
  assert.equal(storage.get(saveKey(0)), original);
  assert.equal(storage.get('reverse-falls-chapter1-v2-save-v1'), oldStory);
  assert.equal(chapterForSnapshot(JSON.parse(storage.get(saveKey(1)))), 1);
});

test('routing accepts only the original prologue and the new namespace, including localized paths', () => {
  assert.equal(chapterForSnapshot(snapshot(0)), 0);
  assert.equal(chapterForSnapshot(snapshot(1)), 1);
  assert.equal(chapterForSnapshot({ ...snapshot(), script: 'textes/russian/chapter_1_v3/start' }), 1);
  assert.equal(chapterForSnapshot({ ...snapshot(), script: 'Chapter_0\\Part_1_Intro\\Intro_1' }), 0);
  for (const script of ['', 'chapter_4/start', '../chapter_1/start', 'chapter_1/../../secrets', 'chapter_1/start?next=x', 'textes/unknown/chapter_1_v3/start', 'chapter_1/start', 'chapter_1/epilogue_anchor', 'chapter_1_v2/start', 'textes/russian/chapter_1_v2/ending_ask']) {
    assert.equal(chapterForSnapshot({ ...snapshot(), script }), null, script);
  }
  assert.equal(chapterForSnapshot({ ...snapshot(), version: 2 }), null);
  assert.equal(chapterForSnapshot(null), null);
});

test('new metadata names the investigation and keeps all original prologue languages', () => {
  assert.equal(CHAPTERS[0].languages.length, 7);
  assert.equal(CHAPTERS[0].authored, false);
  assert.deepEqual(CHAPTERS[1].languages, ['russian', 'english']);
  for (const language of CHAPTERS[0].languages) assert.equal(chapterLanguage(0, language), language);
  assert.equal(chapterLanguage(1, ' RUSSIAN '), 'russian');
  assert.equal(chapterLanguage(1, 'french'), 'english');
  assert.equal(chapterLanguage(1, null), 'english');
  assert.equal(chapterTitle(1, 'russian'), 'Следы в лесу');
  assert.equal(chapterTitle(1, 'german'), 'Tracks in the Forest');
  assert.equal(normalizeChapter('chapter_1_v3'), 1);
  assert.equal(normalizeChapter('chapter_9'), 0);
  assert.equal(CHAPTERS[1].nextChapter.title.russian, 'Не тот монстр');
  assert.equal(CHAPTERS[1].nextChapter.available, true);
  assert.deepEqual(Object.keys(CHAPTER1_CHOICES), ['reason', 'tracks', 'descent', 'ending']);
  assert.ok(Object.values(CHAPTER1_CHOICES).every(values => values.length === 3));
});

test('monster transfer is normalized, independent of old story flags, and never mutates saves', () => {
  assert.equal(normalizeMonster(' vampire '), 'Vampire');
  assert.equal(normalizeMonster('WENDIGO'), 'Wendigo');
  assert.equal(normalizeMonster('unknown'), 'Werewolf');
  assert.equal(normalizeMonster({ toString() { throw Error('must not coerce'); } }), 'Werewolf');
  const old = snapshot(0, { monster: 'Vampire', trust: 'Tell', ending: 'Ask' }, 'dialogue');
  old.chars = { gideon: { visible: true } }; old.inventory = ['journal_3'];
  const campaign = markCompleted(null, snapshot(0, { monster: 'Wendigo' }));
  assert.deepEqual(seedFlags({ chapter0Snapshot: old }), { monster: 'Vampire' });
  assert.deepEqual(seedFlags({ chapter0Snapshot: old, campaign }), { monster: 'Wendigo' });
  assert.deepEqual(seedFlags({ monster: 'Werewolf', chapter0Snapshot: old, campaign }), { monster: 'Werewolf' });
  assert.deepEqual(seedFlags({ monster: 'unknown', chapter0Snapshot: old }), { monster: 'Vampire' });
  assert.deepEqual(seedFlags({ chapter0Snapshot: snapshot(1, { monster: 'Vampire' }) }), { monster: 'Werewolf' });
  assert.deepEqual(seedFlags(), { monster: 'Werewolf' });
  const flags = seedFlags({ chapter0Snapshot: old }); flags.monster = 'Werewolf';
  assert.equal(old.flags.monster, 'Vampire');
});

test('old campaign versions migrate only chapter-zero completion and discard every replaced story outcome', () => {
  for (const ending of ['Anchor', 'Ask', 'Steal', 'Soos', 'Bold', 'Cautious', 'Observation']) {
    const old = { version: 1, chapters: { 0: { completed: true, monster: 'Vampire' }, 1: { completed: true, monster: 'Werewolf', ending } } };
    const migrated = readCampaign(old);
    assert.equal(migrated.version, 2);
    assert.deepEqual(migrated.chapters[0], old.chapters[0]);
    assert.deepEqual(migrated.chapters[1], readCampaign(null).chapters[1]);
    assert.equal(validCampaign(migrated), true);
  }
});

test('malformed campaign data is sanitized and hostile properties cannot create completion or clues', () => {
  for (const input of [undefined, null, '', '{', '[]', [], false, { version: 3, chapters: {} }]) {
    const clean = readCampaign(input);
    assert.equal(validCampaign(clean), true);
    assert.equal(clean.chapters[0].completed, false);
    assert.equal(clean.chapters[1].ending, null);
  }
  const input = JSON.parse('{"version":2,"chapters":{"0":{"completed":true,"monster":"wendigo","trust":"Tell"},"1":{"completed":true,"monster":"Vampire","ending":"Observation","flags":{"monster":"Vampire","reason":"Openness","gideon_openness":"1","journal_doubt":-1,"extra_clue_01":"true","unknown":true},"inventory":["cloth_scrap","injected"]}},"__proto__":{"polluted":true}}');
  const clean = readCampaign(input);
  assert.deepEqual(clean.chapters[0], { completed: true, monster: 'Wendigo' });
  assert.equal(clean.chapters[1].completed, false);
  assert.deepEqual(clean.chapters[1].inventory, []);
  assert.equal(clean.chapters[1].flags.gideon_openness, undefined);
  assert.equal(clean.chapters[1].nextChapter, null);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(validCampaign(JSON.stringify(clean)), true);
  const first = readCampaign(null), second = readCampaign(null);
  first.chapters[1].flags.reason = 'Openness';
  assert.equal(second.chapters[1].flags.reason, undefined);
  for (const ending of ['__proto__', 'constructor', 'toString']) {
    const hostile = readCampaign(null); hostile.chapters[1].ending = ending;
    assert.equal(validCampaign(hostile), false);
  }
});

test('completion preserves all four decisions, typed flags, trust and cloth without mutating either input', () => {
  const old = markCompleted(null, snapshot(0, { monster: 'Vampire' })), save = finalSave({ monster: 'Vampire' });
  const before = JSON.stringify(old), sourceBefore = JSON.stringify(save);
  const completed = markCompleted(old, save);
  assert.equal(JSON.stringify(old), before);
  assert.equal(JSON.stringify(save), sourceBefore);
  assert.deepEqual(completed.chapters[0], old.chapters[0]);
  assert.equal(completed.chapters[1].completed, true);
  assert.deepEqual(completed.chapters[1].flags, save.flags);
  assert.deepEqual(completed.chapters[1].inventory, ['journal_3', 'cloth_scrap']);
  assert.equal(validCampaign(completed), true);
  assert.deepEqual(readCampaign(JSON.stringify(completed)), completed);
  assert.equal(completionSummary(completed, 1, 'russian'), ENDINGS.Observation.title.russian);
  assert.equal(completionSummary(completed, 0, 'english'), 'Completed');
  assert.equal(completionSummary(null, 1, 'russian'), 'Не завершена');
});

test('only the real final observer scene with consistent decisions can record chapter completion', () => {
  const save = finalSave();
  const invalid = [
    { ...save, phase: 'dialogue' }, { ...save, script: 'chapter_1_v3/ending_observation' },
    { ...save, script: 'chapter_1_v3/start' }, { ...save, script: 'chapter_1_v2/ending_ask' },
    { ...save, flags: { ...save.flags, ending: 'Ask' } },
    { ...save, flags: { ...save.flags, chapter1_observation_end: false } },
    { ...save, flags: { ...save.flags, chapter1_bold_end: true } },
    { ...save, flags: { ...save.flags, reason: null } },
    { ...save, flags: { ...save.flags, pacifica_gideon_trust: 0 } },
    { ...save, inventory: [] }, { ...save, flags: { ...save.flags, monster: null } }
  ];
  for (const bad of invalid) assert.equal(markCompleted(null, bad).chapters[1].completed, false);
});

test('chapter-two handoff retains every combination and applies only the authored ending advantage', () => {
  assert.equal(chapter2Handoff(null), null);
  let checked = 0;
  for (const reason of CHAPTER1_CHOICES.reason) for (const tracks of CHAPTER1_CHOICES.tracks) for (const descent of CHAPTER1_CHOICES.descent) for (const ending of CHAPTER1_CHOICES.ending) {
    const save = finalSave({ reason, tracks, descent, ending });
    const campaign = markCompleted(null, save), hook = chapter2Handoff(campaign);
    assert.equal(campaign.chapters[1].completed, true);
    assert.equal(hook.available, true);
    assert.equal(hook.toChapter, 2);
    assert.equal(hook.title.russian, 'Не тот монстр');
    assert.deepEqual(hook.flags, save.flags);
    assert.deepEqual(hook.inventory, save.inventory);
    assert.deepEqual(hook.setup, { startNearSuspectedLair: ending === 'Bold', extraItemAvailable: ending === 'Cautious', clueBonus: Number(ending === 'Observation') });
    hook.flags.monster = 'Vampire'; hook.inventory.push('tamper');
    assert.equal(campaign.chapters[1].flags.monster, 'Wendigo');
    assert.ok(!campaign.chapters[1].inventory.includes('tamper'));
    checked++;
  }
  assert.equal(checked, 81);
});

test('new endings remain distinct and retain no old Book One, theft, or show metadata', () => {
  assert.deepEqual(Object.keys(ENDINGS), ['Bold', 'Cautious', 'Observation']);
  assert.equal(new Set(Object.values(ENDINGS).map(ending => ending.title.russian)).size, 3);
  assert.doesNotMatch(JSON.stringify({ chapters: CHAPTERS, endings: ENDINGS }), /Глифулов|Книг[аи] №[12]|Book (?:One|Two)|Steal|Soos/);
});
