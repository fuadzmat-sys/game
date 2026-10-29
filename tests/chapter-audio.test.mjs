import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSpeech, createChapterAudio, dialogueVoiceAllowed, voiceLineKey } from '../chapter-audio.js';

function speechEnvironment() {
  const state = { spoken: [], cancelled: 0, paused: 0, resumed: 0 };
  const environment = {
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: {
      speak: utterance => state.spoken.push(utterance),
      cancel: () => state.cancelled++,
      pause: () => state.paused++, resume: () => state.resumed++,
      getVoices: () => [{ name: 'German', lang: 'de-DE' }, { name: 'Russian system', lang: 'ru-RU' }, { name: 'English system', lang: 'en-US' }]
    }
  };
  return { environment, state };
}

function audioEnvironment() {
  const contexts = [];
  class Parameter {
    constructor() { this.value = 0; this.events = []; }
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
    exponentialRampToValueAtTime(value, time) {
      assert.ok(value > 0, 'WebAudio exponential envelopes require positive targets');
      this.events.push(['exponential', value, time]);
    }
  }
  class Node {
    constructor(context, kind) {
      this.context = context; this.kind = kind; this.connections = []; this.stops = []; this.disconnected = false;
      this.gain = new Parameter(); this.frequency = new Parameter(); this.Q = new Parameter();
      context.nodes.push(this);
    }
    connect(node) { this.connections.push(node); }
    disconnect() { this.disconnected = true; }
    start(time) { this.started = time; }
    stop(time) { this.stops.push(time); }
  }
  class AudioContext {
    constructor() { this.state = 'suspended'; this.sampleRate = 1000; this.currentTime = 4; this.nodes = []; this.destination = {}; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return new Node(this, 'gain'); }
    createOscillator() { return new Node(this, 'oscillator'); }
    createBufferSource() { return new Node(this, 'buffer'); }
    createBiquadFilter() { return new Node(this, 'filter'); }
    createBuffer(channels, length, sampleRate) {
      assert.equal(channels, 1); assert.equal(sampleRate, this.sampleRate);
      const samples = new Float32Array(length);
      return { getChannelData: channel => { assert.equal(channel, 0); return samples; } };
    }
  }
  return { environment: { AudioContext }, contexts };
}

test('unsupported browsers and default-disabled speech stay silent without throwing', () => {
  const missing = createChapterAudio({ environment: {} });
  assert.equal(missing.availableSpeech(), false);
  assert.equal(missing.unlock(), false);
  assert.equal(missing.effect('glass_break'), false);
  missing.setSpeechEnabled(true);
  assert.equal(missing.speak({ text: 'Hello' }), false);
  assert.equal(missing.isSpeaking, false);
  assert.equal(missing.pauseSpeech(), false); assert.equal(missing.resumeSpeech(), false);
  missing.stopSpeech(); missing.stopEffects(); missing.updateVolume();
  const { environment, state } = speechEnvironment();
  const disabled = createChapterAudio({ environment });
  assert.equal(disabled.speak({ text: 'Not opted in' }), false);
  assert.equal(state.spoken.length, 0);
});

test('speech reads cleaned text using a language-compatible voice and character settings', () => {
  const { environment, state } = speechEnvironment();
  const audio = createChapterAudio({ environment, getVolume: channel => channel === 'voice' ? .43 : .7 });
  audio.setSpeechEnabled(true);
  assert.equal(audio.speak({ text: '<b>Привет!</b>\\n  Как &amp; почему?', speaker: 'Pacifica', language: 'russian' }), true);
  const utterance = state.spoken.at(-1);
  assert.equal(utterance.text, 'Привет! Как & почему?');
  assert.equal(utterance.lang, 'ru-RU');
  assert.equal(utterance.voice.name, 'Russian system');
  assert.equal(utterance.volume, .43);
  assert.ok(utterance.pitch >= .8 && utterance.pitch <= 1.3);
  assert.equal(audio.isSpeaking, true);
  audio.speak({ text: 'Good morning', speaker: 'Dipper', language: 'english' });
  assert.equal(state.spoken.at(-1).voice.name, 'English system');
  assert.notEqual(state.spoken.at(-1).pitch, utterance.pitch);
});

test('new lines cancel old speech and stale completion callbacks cannot finish the new line', () => {
  const { environment, state } = speechEnvironment();
  const finished = [];
  const audio = createChapterAudio({ environment, onSpeechEnd: event => finished.push(event.reason) });
  audio.setSpeechEnabled(true);
  audio.speak({ text: 'One', onEnd: () => finished.push('first') });
  const first = state.spoken.at(-1);
  audio.speak({ text: 'Two', onEnd: () => finished.push('second') });
  first.onend();
  assert.deepEqual(finished, []); assert.equal(audio.isSpeaking, true);
  state.spoken.at(-1).onend();
  assert.deepEqual(finished, ['second', 'end']); assert.equal(audio.isSpeaking, false);
  first.onerror();
  assert.deepEqual(finished, ['second', 'end']);
});

test('pause, resume and disabling speech preserve cancellation boundaries', () => {
  const { environment, state } = speechEnvironment();
  const audio = createChapterAudio({ environment }); audio.setSpeechEnabled(true);
  audio.speak({ text: 'Paused while the choices map is open' });
  const alreadyResumed = state.resumed;
  assert.equal(audio.pauseSpeech(), true); assert.equal(state.paused, 1);
  assert.equal(audio.isSpeaking, true);
  assert.equal(audio.resumeSpeech(), true); assert.equal(state.resumed, alreadyResumed + 1);
  const stale = state.spoken.at(-1);
  audio.setSpeechEnabled(false);
  assert.equal(audio.isSpeaking, false); assert.ok(state.cancelled >= 2);
  stale.onend();
  assert.equal(audio.isSpeaking, false);
  assert.equal(audio.speak({ text: 'Disabled' }), false);
});

test('a fresh line resumes a synthesizer that stays paused after cancelling the old line', () => {
  const { environment, state } = speechEnvironment();
  const synthesis = environment.speechSynthesis;
  synthesis.paused = false;
  synthesis.pause = () => { synthesis.paused = true; state.paused++; };
  synthesis.resume = () => { synthesis.paused = false; state.resumed++; };
  // Match browser implementations where cancel clears the queue but keeps pause.
  synthesis.cancel = () => { state.cancelled++; };
  synthesis.speak = utterance => {
    assert.equal(synthesis.paused, false, 'Fresh dialogue must not enter a paused queue');
    state.spoken.push(utterance);
  };
  const audio = createChapterAudio({ environment });
  audio.setSpeechEnabled(true);
  audio.speak({ text: 'Old scene' });
  const old = state.spoken.at(-1);
  audio.pauseSpeech();
  assert.equal(synthesis.paused, true);
  assert.equal(audio.speak({ text: 'Restored scene after loading a save' }), true);
  assert.equal(synthesis.paused, false);
  assert.equal(state.spoken.at(-1).text, 'Restored scene after loading a save');
  old.onend();
  assert.equal(audio.isSpeaking, true, 'A cancelled utterance must not finish the new one');
});

test('speech errors clear the active line, and missing voices use the requested system language', () => {
  const { environment, state } = speechEnvironment();
  environment.speechSynthesis.getVoices = () => [];
  const events = [], audio = createChapterAudio({ environment, onSpeechEnd: event => events.push(event.reason) });
  audio.setSpeechEnabled(true); audio.speak({ text: 'Системный голос', language: 'ru-RU' });
  assert.equal(state.spoken.at(-1).lang, 'ru-RU');
  state.spoken.at(-1).onerror();
  assert.equal(audio.isSpeaking, false); assert.deepEqual(events, ['error']);
  assert.equal(audio.speak({ text: '<b> </b>\\n' }), false);
});

test('every named effect schedules distinct audible sources and positive envelopes locally', () => {
  const signatures = new Set();
  const names = ['footsteps', 'sigh', 'glass_break', 'mabel_laugh', 'impact', 'fire', 'monster_dissolve', 'birds', 'forest_wind', 'branch_crack', 'dog_whine', 'unknown_call', 'blue_spark'];
  for (const name of names) {
    const { environment, contexts } = audioEnvironment();
    const audio = createChapterAudio({ environment });
    assert.equal(audio.effect(name), true, name);
    assert.equal(contexts.length, 1); assert.equal(contexts[0].state, 'running');
    const sources = contexts[0].nodes.filter(node => ['oscillator', 'buffer'].includes(node.kind));
    assert.ok(sources.length >= 2, `No actual sound sources for ${name}`);
    assert.ok(sources.every(source => source.started >= contexts[0].currentTime && source.stops[0] > source.started));
    signatures.add(JSON.stringify(sources.map(source => [source.kind, source.started, source.stops[0], source.frequency.events])));
    audio.stopEffects();
  }
  assert.equal(signatures.size, names.length, 'Effects must not all be the same beep');
});

test('stopping effects cancels scheduled sources and disconnects their entire audio graphs', () => {
  const { environment, contexts } = audioEnvironment();
  const audio = createChapterAudio({ environment });
  audio.effect('fire'); audio.effect('glass_break');
  const context = contexts[0], sources = context.nodes.filter(node => ['oscillator', 'buffer'].includes(node.kind));
  audio.stopEffects();
  assert.ok(sources.every(source => source.stops.at(-1) === undefined && source.onended === null));
  assert.ok(context.nodes.slice(1).every(node => node.disconnected));
  const stops = sources.map(source => source.stops.length);
  audio.stopEffects();
  assert.deepEqual(sources.map(source => source.stops.length), stops, 'Repeated stop should not retain old sources');
});

test('natural source completion releases effect nodes and current volume knobs apply', () => {
  const { environment, contexts } = audioEnvironment();
  const speech = speechEnvironment(); Object.assign(environment, speech.environment);
  let sound = .6, voice = .8;
  const audio = createChapterAudio({ environment, getVolume: channel => channel === 'sound' ? sound : voice });
  audio.effect('sigh');
  const context = contexts[0], master = context.nodes[0];
  assert.equal(master.gain.value, .6);
  audio.setSpeechEnabled(true); audio.speak({ text: 'A test line' });
  sound = .1; voice = .25; audio.updateVolume();
  assert.equal(master.gain.value, .1); assert.equal(speech.state.spoken.at(-1).volume, .25);
  const sources = context.nodes.filter(node => ['oscillator', 'buffer'].includes(node.kind));
  for (const source of sources) source.onended();
  assert.ok(context.nodes.slice(1).every(node => node.disconnected));
  sound = 0;
  assert.equal(audio.effect('impact'), false);
  voice = 0; assert.equal(audio.speak({ text: 'Muted' }), false);
  assert.equal(audio.isSpeaking, false);
});

test('unknown effects, denied audio startup and invalid volume values fail quietly', () => {
  const { environment, contexts } = audioEnvironment();
  const audio = createChapterAudio({ environment, getVolume: () => NaN });
  assert.equal(audio.effect('not_an_effect'), false); assert.equal(contexts.length, 0);
  assert.equal(audio.effect('impact'), true); assert.equal(contexts[0].nodes[0].gain.value, .7);
  audio.stopEffects();
  const denied = createChapterAudio({ environment: { AudioContext: class { constructor() { throw Error('Denied'); } } } });
  assert.equal(denied.effect('sigh'), false); denied.stopEffects();
});

function recordedEnvironment({ system = true, playResult } = {}) {
  const speech = speechEnvironment();
  const environment = system ? speech.environment : {};
  const recordings = [];
  environment.Audio = class {
    constructor(path) {
      this.path = path; this.currentTime = 0; this.volume = 1;
      this.plays = 0; this.pauses = 0; this.onended = null; this.onerror = null;
      recordings.push(this);
    }
    play() { this.plays++; return playResult?.(this) ?? Promise.resolve(); }
    pause() { this.pauses++; }
  };
  return { environment, recordings, system: speech.state };
}
const voiceRecords = () => ({
  [voiceLineKey('Привет!', 'Gideon', 'russian')]: { path: 'assets/voices/gideon.mp3', text: 'Привет!', speaker: 'Gideon', duration: 1.2 },
  [voiceLineKey('Hello!', 'Dipper', 'english')]: { path: 'assets/voices/dipper.mp3', text: 'Hello!', speaker: 'Dipper', duration: .9 }
});

test('voice-line keys normalize markup, whitespace, locales and speaker case without losing blank speakers', () => {
  assert.equal(cleanSpeech('<b> Hi </b>\\n &amp; bye '), 'Hi & bye');
  assert.equal(voiceLineKey('<b>Привет!</b>', ' GIDEON ', 'ru-RU'), 'russian|gideon|Привет!');
  assert.equal(voiceLineKey('Hello!', 'DIPPER', 'en-GB'), 'english|dipper|Hello!');
  assert.equal(voiceLineKey('Text', '', 'ru_RU'), 'russian||Text');
});

test('prepared dialogue works without Web Speech and uses the exact recording at its authored rate', () => {
  const { environment, recordings } = recordedEnvironment({ system: false });
  const events = [], audio = createChapterAudio({ environment, voices: { version: 1, lines: voiceRecords() }, getVolume: () => .4 });
  assert.equal(audio.availableSpeech(), true);
  assert.equal(audio.speechMode({ language: 'ru-RU' }), 'recorded');
  assert.equal(audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' }), false);
  audio.setSpeechEnabled(true);
  assert.equal(audio.speak({ text: '<b>Привет!</b>', speaker: 'GIDEON', language: 'ru-RU', onEnd: event => events.push(event.reason) }), true);
  assert.equal(recordings.length, 1);
  assert.equal(recordings[0].path, 'assets/voices/gideon.mp3');
  assert.equal(recordings[0].playbackRate, 1);
  assert.equal(recordings[0].volume, .4);
  assert.equal(recordings[0].plays, 1);
  assert.equal(audio.isSpeaking, true);
  recordings[0].onended();
  assert.deepEqual(events, ['end']);
  assert.equal(audio.isSpeaking, false);
  assert.equal(audio.speechMode({ language: 'french' }), 'unavailable');
});

test('recorded speech is preferred, pauses and resumes, updates volume and cancels cleanly on a new line', () => {
  const { environment, recordings, system } = recordedEnvironment();
  let level = .7;
  const audio = createChapterAudio({ environment, voices: voiceRecords(), getVolume: () => level });
  audio.setSpeechEnabled(true);
  audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' });
  const first = recordings[0], staleEnded = first.onended, staleError = first.onerror;
  assert.equal(system.spoken.length, 0);
  assert.equal(audio.pauseSpeech(), true); assert.equal(first.pauses, 1);
  assert.equal(audio.resumeSpeech(), true); assert.equal(first.plays, 2);
  level = .12; audio.updateVolume(); assert.equal(first.volume, .12);
  level = 0; audio.updateVolume(); assert.equal(first.volume, 0);
  level = .7; first.currentTime = .8;
  audio.speak({ text: 'Hello!', speaker: 'Dipper', language: 'english' });
  assert.equal(first.currentTime, 0); assert.equal(first.onended, null); assert.equal(first.onerror, null);
  assert.ok(first.pauses >= 2);
  staleEnded(); staleError();
  assert.equal(system.spoken.length, 0);
  assert.equal(audio.isSpeaking, true);
  audio.setSpeechEnabled(false);
  assert.equal(audio.isSpeaking, false);
  assert.equal(recordings[1].onended, null);
});

test('missing recordings use system speech while mode and API availability stay language-aware', () => {
  const { environment, recordings, system } = recordedEnvironment();
  const records = { [voiceLineKey('Привет!', 'Gideon', 'russian')]: voiceRecords()[voiceLineKey('Привет!', 'Gideon', 'russian')] };
  const audio = createChapterAudio({ environment, voices: records });
  assert.equal(audio.speechMode({ language: 'russian' }), 'recorded');
  assert.equal(audio.speechMode({ language: 'english' }), 'system');
  audio.setSpeechEnabled(true);
  assert.equal(audio.speak({ text: 'An unrecorded line', language: 'english' }), true);
  assert.equal(recordings.length, 0); assert.equal(system.spoken.length, 1);
  const localOnly = recordedEnvironment({ system: false });
  assert.equal(createChapterAudio({ environment: localOnly.environment, voices: records }).speechMode({ language: 'english' }), 'unavailable');
});

test('a failed recording falls back once, and stale audio events cannot end the replacement system line', async () => {
  const failure = new Error('Decoder failed');
  const { environment, recordings, system } = recordedEnvironment({ playResult: () => Promise.reject(failure) });
  const ended = [], audio = createChapterAudio({ environment, voices: voiceRecords(), onSpeechEnd: e => ended.push(e.reason) });
  audio.setSpeechEnabled(true);
  assert.equal(audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' }), true);
  const staleEnded = recordings[0].onended, staleError = recordings[0].onerror;
  await Promise.resolve();
  assert.equal(system.spoken.length, 1);
  assert.equal(audio.isSpeaking, true);
  staleEnded(); staleError();
  assert.equal(system.spoken.length, 1); assert.deepEqual(ended, []);
  system.spoken[0].onend();
  assert.deepEqual(ended, ['end']); assert.equal(audio.isSpeaking, false);
});

test('late play rejection cannot speak over a later line or a disabled player', async () => {
  const rejections = [];
  const { environment, system } = recordedEnvironment({ playResult: () => new Promise((resolve, reject) => rejections.push(reject)) });
  const audio = createChapterAudio({ environment, voices: voiceRecords() }); audio.setSpeechEnabled(true);
  audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' });
  audio.speak({ text: 'Hello!', speaker: 'Dipper', language: 'english' });
  rejections[0](new Error('Old request failed'));
  await Promise.resolve(); assert.equal(system.spoken.length, 0); assert.equal(audio.isSpeaking, true);
  audio.setSpeechEnabled(false); rejections[1](new Error('Disabled request failed'));
  await Promise.resolve(); assert.equal(system.spoken.length, 0); assert.equal(audio.isSpeaking, false);
});

test('overlay pause aborts an in-flight play without switching the prepared voice to the system voice', async () => {
  let rejectPlay;
  const { environment, recordings, system } = recordedEnvironment({ playResult: source => source.plays === 1 ? new Promise((resolve, reject) => { rejectPlay = reject; }) : Promise.resolve() });
  const audio = createChapterAudio({ environment, voices: voiceRecords() }); audio.setSpeechEnabled(true);
  audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' });
  audio.pauseSpeech(); rejectPlay(Object.assign(new Error('Paused'), { name: 'AbortError' }));
  await Promise.resolve();
  assert.equal(system.spoken.length, 0); assert.equal(audio.isSpeaking, true);
  assert.equal(audio.resumeSpeech(), true); assert.equal(recordings[0].plays, 2);
});

test('failed local playback without system speech finishes rather than trapping automatic reading', async () => {
  const { environment } = recordedEnvironment({ system: false, playResult: () => Promise.reject(Error('No decoder')) });
  const events = [], audio = createChapterAudio({ environment, voices: voiceRecords(), onSpeechEnd: e => events.push(e.reason) });
  audio.setSpeechEnabled(true); audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' });
  await Promise.resolve();
  assert.equal(audio.isSpeaking, false); assert.deepEqual(events, ['error']);
});

test('all original chapter languages retain their own system locale instead of selecting English recordings', () => {
  const { environment, recordings, system } = recordedEnvironment();
  const getVoices = environment.speechSynthesis.getVoices;
  environment.speechSynthesis.getVoices = () => [...getVoices(), { name: 'French system', lang: 'fr-FR' }];
  const audio = createChapterAudio({ environment, voices: voiceRecords() });
  audio.setSpeechEnabled(true);
  assert.equal(audio.speechMode({ language: 'fr-CA' }), 'system');
  assert.equal(audio.speak({ text: 'Bonjour !', speaker: 'Gideon', language: 'french' }), true);
  assert.equal(system.spoken.at(-1).lang, 'fr-FR');
  assert.equal(system.spoken.at(-1).voice.name, 'French system');
  assert.equal(recordings.length, 0);
  const locales = { german: 'de-DE', spanish: 'es-ES', polish: 'pl-PL', ukrainian: 'uk-UA' };
  for (const [language, locale] of Object.entries(locales)) {
    assert.equal(audio.speechMode({ language }), 'system');
    audio.speak({ text: 'Translated chapter text', language });
    assert.equal(system.spoken.at(-1).lang, locale);
    assert.equal(voiceLineKey('Text', '', locale), `${language}||Text`);
  }
  assert.equal(voiceLineKey('Text', '', 'unknown-language'), 'english||Text');
  const localOnly = recordedEnvironment({ system: false });
  const limited = createChapterAudio({ environment: localOnly.environment, voices: voiceRecords() });
  assert.equal(limited.speechMode({ language: 'french' }), 'unavailable');
  assert.equal(limited.speechMode({ language: 'pl-PL' }), 'unavailable');
  assert.equal(limited.speechMode({ language: 'ru-RU' }), 'recorded');
  assert.equal(limited.speechMode({ language: 'en-US' }), 'recorded');
});

test('new and legacy chapter-one scenes stay silent even when identical text has a chapter-zero recording', () => {
  const { environment, recordings, system } = recordedEnvironment();
  const audio = createChapterAudio({ environment, voices: voiceRecords() });
  audio.setSpeechEnabled(true);
  for (const script of ['chapter_1_v3/start', 'textes/russian/chapter_1_v3/cafe', 'chapter_1_v2/start', 'chapter_1/start', 'Chapter_1_v3\\last_frame']) {
    assert.equal(dialogueVoiceAllowed({ script }), false);
    assert.equal(audio.speechMode({ script, language: 'russian' }), 'pending');
    assert.equal(audio.availableSpeech({ script }), false);
    assert.equal(audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian', script }), false);
    assert.equal(audio.isSpeaking, false);
  }
  assert.equal(audio.speak({ text: 'No matching record', chapter: 1 }), false);
  assert.deepEqual(recordings, []);
  assert.deepEqual(system.spoken, []);
  assert.equal(audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian', script: 'chapter_0/part_1_intro/intro_1' }), true);
  assert.equal(recordings.length, 1, 'Chapter-zero recording still works');
});

test('chapter context cancels stale recordings on entry to silent chapter one and resumes chapter zero normally', async () => {
  let rejectPlay;
  const { environment, recordings, system } = recordedEnvironment({ playResult: () => new Promise((resolve, reject) => { rejectPlay = reject; }) });
  let context = { chapter: 0, script: 'chapter_0/part_1_intro/intro_1' };
  const audio = createChapterAudio({ environment, voices: voiceRecords(), getVoiceContext: () => context });
  audio.setSpeechEnabled(true);
  assert.equal(audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' }), true);
  const staleEnd = recordings[0].onended;
  context = { chapter: 1, script: 'chapter_1_v3/start' };
  assert.equal(audio.speak({ text: 'Привет!', speaker: 'Gideon', language: 'russian' }), false);
  assert.equal(audio.speechMode(), 'pending');
  assert.equal(audio.availableSpeech(), false);
  assert.equal(audio.isSpeaking, false);
  assert.equal(recordings[0].onended, null);
  assert.ok(recordings[0].pauses > 0);
  rejectPlay(new Error('Old recording failed late'));
  staleEnd();
  await Promise.resolve();
  assert.deepEqual(system.spoken, []);
  assert.equal(audio.isSpeaking, false, 'Auto mode cannot wait on an unstarted voice');
  context = { chapter: 0, script: 'chapter_0/part_1_intro/intro_1' };
  assert.equal(audio.speechMode({ language: 'russian' }), 'recorded');
  assert.equal(audio.availableSpeech(), true);
  assert.equal(audio.speak({ text: 'Other Chapter 0 text' }), true);
  assert.equal(system.spoken.length, 1);
});
