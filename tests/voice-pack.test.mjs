import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectVoiceLines } from '../tools/collect-voice-lines.mjs';
import { voiceLineKey } from '../chapter-audio.js';
import { buildChapterOneVoicePlan, collectChapterOneVoiceSlots } from '../tools/build-chapter1-voice-plan.mjs';

const pack = JSON.parse(fs.readFileSync(new URL('../assets/voices/manifest.json', import.meta.url), 'utf8'));
const expected = collectVoiceLines();

test('the retained voice pack covers every played Russian line in chapter zero only', () => {
  assert.equal(pack.scope, 'chapter_0');
  assert.deepEqual(new Set(pack.languages), new Set(['russian']));
  assert.equal(Object.keys(pack.lines).length, expected.filter(line => line.language === 'russian' && !pack.pendingRussianLines?.includes(line.text)).length);
  for (const line of expected.filter(line => line.language === 'russian' && !pack.pendingRussianLines?.includes(line.text))) {
    const record = pack.lines[voiceLineKey(line.text, line.speaker, line.language)];
    assert.ok(record, `${line.language}/${line.speaker}: ${line.text}`);
    assert.equal(record.text, line.text);
    assert.equal(record.speaker, line.speaker);
    assert.ok(Number.isFinite(record.duration) && record.duration > 0);
  }
});

test('all prepared voice files are delivered MP3s, including Wendy, Soos and the rest of the cast', () => {
  const paths = new Set();
  const speakers = new Set();
  for (const record of Object.values(pack.lines)) {
    assert.ok(record.path.startsWith('assets/voices/') && record.path.endsWith('.mp3'));
    assert.ok(!record.path.includes('..'));
    const bytes = fs.readFileSync(new URL('../' + record.path, import.meta.url));
    assert.ok(bytes.length > 1000, `Empty recording: ${record.path}`);
    assert.ok(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && bytes[1] >= 224), `Invalid MP3: ${record.path}`);
    paths.add(record.path); speakers.add(record.speaker.toLowerCase());
  }
  assert.equal(paths.size, Object.keys(pack.lines).length);
  for (const name of ['gideon', 'pacifica', 'mabel', 'wendy', 'soos', 'robbie', 'bud', 'priscilla', 'preston', 'will', 'candy', 'grenda', 'mothman']) assert.ok(speakers.has(name), name);
});

test('chapter-zero voice profiles remain unchanged and do not retain a chapter-one-only casting profile', () => {
  for (const language of pack.languages) {
    const cast = pack.profiles[language];
    assert.equal(cast.gideon.pitch, 1.28);
    assert.equal(cast.gideon.formant, 1.09);
    assert.equal(cast.dipper, undefined);
    assert.notEqual(cast.wendy.pitch, cast.mabel.pitch);
    assert.ok(cast.soos.pitch < cast.gideon.pitch);
    const speakers = new Set(expected.filter(l => l.language === language).map(l => l.speaker.toLowerCase() || 'narrator'));
    assert.deepEqual(new Set(Object.keys(cast)), speakers);
  }
});

test('chapter-one recording slots are script-specific and pending, without legacy text or synthetic fallback', () => {
  const scripts = {
    'textes/russian/chapter_1_v3/last_frame': '[Narrator]\nСвет исчезает.\n[Will]\nЛюбопытно.',
    'textes/english/chapter_1_v3/cafe': '[emotion Gideon neutral]\n[Gideon]\nI came.\n[Waitress]\nWhat would you like?',
    'textes/russian/chapter_1_v2/start': '[Gideon]\nOld scene.',
    'textes/russian/chapter_0/part_1_intro/intro_1': '[Gideon]\nPrologue.'
  };
  const slots = collectChapterOneVoiceSlots(scripts);
  assert.equal(slots.length, 4);
  assert.deepEqual(slots.map(slot => slot.speaker), ['Narrator', 'Will', 'Gideon', 'Waitress']);
  assert.equal(new Set(slots.map(slot => slot.id)).size, slots.length);
  for (const slot of slots) {
    assert.equal(slot.approved, false);
    assert.equal(slot.path, null);
    assert.equal(slot.status, 'awaiting_acted_recording');
    assert.ok(slot.script.startsWith('chapter_1_v3/'));
    assert.ok(slot.direction);
  }
  assert.match(slots.find(slot => slot.speaker === 'Will').direction, /Whisper/);
  const plan = buildChapterOneVoicePlan(scripts);
  assert.equal(plan.playback, 'silent_until_reviewed');
  assert.equal(plan.allowSystemSpeech, false);
  assert.equal(plan.allowLegacyChapterOneClips, false);
  assert.equal(plan.allowChapterZeroClipReuse, false);
  assert.equal(plan.cast.Gideon.age, 12);
  assert.equal(plan.cast.Pacifica.age, 14);
  assert.equal(plan.cast.Mabel.age, 15);
  assert.equal(plan.cast.Dipper.age, 15);
  assert.equal(plan.cast.Wendy.age, 18);
});

test('the delivered audio directory contains no retired chapter-one-only MP3s', () => {
  const directory = new URL('../assets/voices/', import.meta.url);
  const delivered = fs.readdirSync(directory, { recursive: true }).filter(path => path.endsWith('.mp3'));
  const referenced = new Set(Object.values(pack.lines).map(record => record.path.replace(/^assets\/voices\//, '')));
  assert.deepEqual(new Set(delivered), referenced);
});
