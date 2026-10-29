import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildVoicePreview } from '../tools/build-voice-preview.mjs';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reverse-falls-probes-'));
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(24)]);
  const wav = Buffer.from('RIFF0000WAVEfmt ');
  for (const name of ['gideon', 'pacifica']) { fs.writeFileSync(path.join(directory, `${name}.mp3`), mp3); fs.writeFileSync(path.join(directory, `${name}.wav`), wav); }
  const index = { voices: ['Pacifica', 'Gideon'].map(speaker => ({
    speaker, age: speaker === 'Gideon' ? 12 : 14, mp3: `${speaker.toLowerCase()}.mp3`, wav: `${speaker.toLowerCase()}.wav`,
    samples: [{ text: speaker === 'Gideon' ? 'Мы вроде договорились.' : 'Я умею признавать, когда кто-то говорит разумные вещи.' }],
    anchorText: speaker === 'Gideon' ? 'Мы вроде договорились.' : 'Я умею признавать, когда кто-то говорит разумные вещи.',
    approved: true, status: 'final', duration: 3.5
  })) };
  const input = path.join(directory, 'preview-index.json'), output = path.join(directory, 'voice-previews');
  const write = () => fs.writeFileSync(input, JSON.stringify(index)); write();
  return { directory, index, input, output, write, clean: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('a complete package uses local controls, exact transcripts, canon ages and unreviewed metadata', () => {
  const f = fixture();
  try {
    const original = fs.readFileSync(f.input), result = buildVoicePreview(f);
    assert.equal(result.voices, 2); assert.equal(result.audioFiles, 4);
    const html = fs.readFileSync(result.page, 'utf8'), index = JSON.parse(fs.readFileSync(path.join(f.output, 'preview-index.json')));
    assert.equal((html.match(/<audio controls preload="none"/g) || []).length, 2);
    assert.ok(!/autoplay|https?:\/\/|fetch\(/i.test(html));
    assert.match(html, /Экспериментальные пробы/); assert.match(html, /12 лет/); assert.match(html, /14 лет/);
    assert.ok(html.includes(f.index.voices[0].anchorText)); assert.ok(html.includes(f.index.voices[1].anchorText));
    assert.equal(index.approved, false); assert.equal(index.integratedIntoGame, false);
    assert.deepEqual(index.voices.map(voice => [voice.speaker, voice.approved]), [['Gideon', false], ['Pacifica', false]]);
    for (const voice of index.voices) for (const format of ['mp3', 'wav']) {
      assert.equal(path.isAbsolute(voice[format]), false);
      assert.deepEqual(fs.readFileSync(path.join(f.output, voice[format])), fs.readFileSync(path.join(f.directory, voice[format])));
    }
    assert.deepEqual(fs.readFileSync(f.input), original, 'The renderer source report is unchanged');
  } finally { f.clean(); }
});

test('unavailable or mislabeled audio fails before creating a page with broken players', () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.directory, 'gideon.mp3'));
    assert.throws(() => buildVoicePreview(f), /ENOENT/);
    assert.equal(fs.existsSync(path.join(f.output, 'index.html')), false);
    fs.writeFileSync(path.join(f.directory, 'gideon.mp3'), 'not audio');
    assert.throws(() => buildVoicePreview(f), /MP3 header/);
    assert.equal(fs.existsSync(path.join(f.output, 'index.html')), false);
  } finally { f.clean(); }
});

test('audio paths cannot traverse outside the input folder or refer to remote content', () => {
  const f = fixture();
  try {
    for (const unsafe of ['../gideon.mp3', 'https://example.org/gideon.mp3', 'file:///tmp/gideon.mp3', 'nested\\gideon.mp3']) {
      f.index.voices[1].mp3 = unsafe; f.write(); assert.throws(() => buildVoicePreview(f), /Unsafe audio path/);
    }
    const outside = path.join(os.tmpdir(), `reverse-falls-escape-${Date.now()}.mp3`);
    try {
      fs.writeFileSync(outside, Buffer.from('ID3testaudiooooo'));
      fs.symlinkSync(outside, path.join(f.directory, 'escape.mp3'));
      f.index.voices[1].mp3 = 'escape.mp3'; f.write();
      assert.throws(() => buildVoicePreview(f), /inside the input directory/);
    } finally { fs.rmSync(outside, { force: true }); }
  } finally { f.clean(); }
});

test('transcript markup is escaped and contradictory sample metadata is rejected', () => {
  const f = fixture();
  try {
    const payload = '</li><script>alert("x")</script>&';
    f.index.voices[0].samples = [{ text: payload }]; f.index.voices[0].anchorText = payload; f.write();
    buildVoicePreview(f); const html = fs.readFileSync(path.join(f.output, 'index.html'), 'utf8');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;'));
    assert.ok(!html.includes(payload));
    f.index.voices[0].anchorText = 'Another transcript'; f.write();
    assert.throws(() => buildVoicePreview(f), /does not match/);
    f.index.voices[0].anchorText = payload; f.index.voices[0].age = 11; f.write();
    assert.throws(() => buildVoicePreview(f), /Incorrect canon age/);
  } finally { f.clean(); }
});
