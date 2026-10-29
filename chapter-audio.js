// Local sound design, prepared dialogue recordings, and optional system speech fallback.
const EFFECTS = new Set(["footsteps", "sigh", "glass_break", "mabel_laugh", "impact", "fire", "monster_dissolve", "birds", "forest_wind", "branch_crack", "dog_whine", "unknown_call", "blue_spark", "bell"]);
const SPEAKERS = {
  pacifica: { pitch: 1.12, rate: 1.02 },
  gideon: { pitch: 1.06, rate: .96 },
  mabel: { pitch: 1.02, rate: .94 },
  dipper: { pitch: .9, rate: .94 },
  soos: { pitch: .88, rate: .94 },
  narrator: { pitch: 1, rate: .98 }
};

export function cleanSpeech(text) {
  return String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\\n/g, " ")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[entity])
    .replace(/\s+/g, " ").trim();
}

const LANGUAGE_LOCALES = {
  english: 'en-US', russian: 'ru-RU', french: 'fr-FR', german: 'de-DE',
  spanish: 'es-ES', polish: 'pl-PL', ukrainian: 'uk-UA'
};
const LANGUAGE_CODES = { en: 'english', ru: 'russian', fr: 'french', de: 'german', es: 'spanish', pl: 'polish', uk: 'ukrainian' };
function canonicalLanguage(language) {
  const value = String(language ?? 'english').trim().toLowerCase();
  return Object.hasOwn(LANGUAGE_LOCALES, value) ? value : LANGUAGE_CODES[value.split(/[-_]/)[0]] || 'english';
}

export function voiceLineKey(text, speaker = 'Narrator', language = 'english') {
  return `${canonicalLanguage(language)}|${String(speaker).trim().toLowerCase()}|${cleanSpeech(text)}`;
}

/** Chapter one awaits acted recordings. A matching chapter-zero line is not a
 * recording for this chapter, and system TTS must never silently stand in for it.
 * Accept both chapter and script context so callers cannot accidentally enable
 * old clips while changing scenes, loading saves, or replaying from the map.
 */
export function dialogueVoiceAllowed({ chapter, script = '' } = {}) {
  const id = String(chapter ?? '').trim().toLowerCase();
  const path = String(script).trim().toLowerCase().replace(/\\/g, '/');
  return !(['1', 'chapter1'].includes(id) || /^chapter_1(?:_|$)/.test(id)
    || /(?:^|\/)chapter_1(?:_[a-z0-9]+)?\//.test(path));
}

/** Optional `environment` makes unsupported browsers and cancellation testable.
 * `voices` accepts the prepared manifest's lines map (or the manifest itself).
 */
export function createChapterAudio({ getVolume = () => .7, getVoiceContext = () => ({}), onSpeechEnd, voices = {}, environment = globalThis } = {}) {
  let context = null, master = null, speechEnabled = false, activeSpeech = null, generation = 0;
  const records = voices && typeof voices === 'object' ? voices.lines || voices : {};
  const usableRecord = record => record && typeof record.path === 'string' && record.path.length > 0;
  const recordedAvailable = language => typeof environment.Audio === 'function'
    && Object.entries(records).some(([key, record]) => usableRecord(record) && (!language || key.startsWith(`${canonicalLanguage(language)}|`)));
  const groups = new Set();
  const volume = channel => {
    let value;
    try { value = Number(getVolume(channel)); } catch { value = .7; }
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .7;
  };
  const systemAvailable = () => typeof environment.SpeechSynthesisUtterance === 'function'
    && typeof environment.speechSynthesis?.speak === 'function'
    && typeof environment.speechSynthesis?.cancel === 'function';
  const voiceContext = request => ({ ...getVoiceContext(), ...request });
  const availableSpeech = request => dialogueVoiceAllowed(voiceContext(request)) && (recordedAvailable() || systemAvailable());
  const speechMode = request => {
    const context = voiceContext(request);
    if (!dialogueVoiceAllowed(context)) return 'pending';
    return recordedAvailable(context.language || 'english') ? 'recorded' : systemAvailable() ? 'system' : 'unavailable';
  };

  function unlock() {
    try {
      if (!context || context.state === "closed") {
        const Context = environment.AudioContext || environment.webkitAudioContext;
        if (typeof Context !== "function") return false;
        context = new Context();
        master = context.createGain();
        master.gain.value = volume("sound");
        master.connect(context.destination);
      }
      if (context.state === "suspended") context.resume()?.catch?.(() => {});
      return true;
    } catch {
      context = null;
      master = null;
      return false;
    }
  }

  function stopRecording(source) {
    if (!source) return;
    source.onended = null;
    source.onerror = null;
    try { source.pause(); } catch {}
    try { source.currentTime = 0; } catch {}
  }
  function stopSpeech() {
    generation++;
    const previous = activeSpeech;
    activeSpeech = null;
    if (previous?.kind === 'recorded') stopRecording(previous.source);
    if (systemAvailable()) {
      try { environment.speechSynthesis.cancel(); } catch {}
    }
  }
  function speak({ text, speaker = 'Narrator', language = 'english', onEnd, ...context } = {}) {
    stopSpeech();
    const spoken = cleanSpeech(text);
    if (!speechEnabled || !availableSpeech(context) || !spoken || volume('voice') === 0) return false;
    const request = { token: generation, kind: null, source: null, paused: false };
    activeSpeech = request;
    const current = () => generation === request.token && activeSpeech === request && speechEnabled;
    const sameSource = source => current() && request.source === source;
    const finished = reason => {
      if (!current()) return;
      activeSpeech = null;
      try { onEnd?.({ speaker, reason }); } finally { onSpeechEnd?.({ speaker, reason }); }
    };
    function startSystem() {
      if (!current()) return false;
      if (!systemAvailable()) { finished('error'); return false; }
      try {
        const utterance = new environment.SpeechSynthesisUtterance(spoken);
        const lang = LANGUAGE_LOCALES[canonicalLanguage(language)];
        let systemVoices = [];
        try { systemVoices = environment.speechSynthesis.getVoices?.() || []; } catch {}
        const matching = systemVoices.filter(voice => String(voice.lang).toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
        const voice = matching.find(item => item.lang.toLowerCase() === lang.toLowerCase()) || matching[0];
        if (voice) utterance.voice = voice;
        utterance.lang = lang;
        const settings = SPEAKERS[String(speaker).trim().toLowerCase()] || SPEAKERS.narrator;
        utterance.pitch = settings.pitch;
        utterance.rate = settings.rate;
        utterance.volume = volume('voice');
        request.kind = 'system';
        request.source = utterance;
        utterance.onend = () => { if (sameSource(utterance)) finished('end'); };
        utterance.onerror = () => { if (sameSource(utterance)) finished('error'); };
        // cancel() can preserve a stale browser pause. Every fresh line starts unpaused.
        try { environment.speechSynthesis.resume?.(); } catch {}
        environment.speechSynthesis.speak(utterance);
        if (request.paused) environment.speechSynthesis.pause?.();
        return true;
      } catch { finished('error'); return false; }
    }
    const record = records[voiceLineKey(text, speaker, language)];
    if (typeof environment.Audio !== 'function' || !usableRecord(record)) return startSystem();
    let recording;
    try {
      recording = new environment.Audio(record.path);
      recording.preload = 'auto';
      recording.volume = volume('voice');
      recording.playbackRate = 1;
      request.kind = 'recorded';
      request.source = recording;
      const fallback = () => {
        if (!sameSource(recording) || request.kind !== 'recorded') return;
        stopRecording(recording);
        startSystem();
      };
      recording.onended = () => { if (sameSource(recording)) finished('end'); };
      recording.onerror = fallback;
      recording.play()?.catch?.(error => {
        // pause() can reject an in-flight play() without a file/decoder failure.
        if (sameSource(recording) && request.paused && error?.name === 'AbortError') return;
        fallback();
      });
      return true;
    } catch {
      stopRecording(recording);
      return startSystem();
    }
  }
  function pauseSpeech() {
    if (!activeSpeech) return false;
    const request = activeSpeech;
    request.paused = true;
    if (request.kind === 'recorded') {
      try { request.source.pause(); return true; } catch { return false; }
    }
    if (typeof environment.speechSynthesis?.pause !== 'function') return false;
    try { environment.speechSynthesis.pause(); return true; } catch { return false; }
  }
  function resumeSpeech() {
    if (!activeSpeech) return false;
    const request = activeSpeech;
    request.paused = false;
    if (request.kind === 'recorded') {
      const recording = request.source;
      try {
        const result = recording.play();
        result?.catch?.(error => {
          if (activeSpeech !== request || generation !== request.token || request.source !== recording) return;
          if (request.paused && error?.name === 'AbortError') return;
          // Route a real resume failure through the same guarded fallback as load errors.
          recording.onerror?.();
        });
        return true;
      } catch {
        request.source.onerror?.();
        return false;
      }
    }
    if (typeof environment.speechSynthesis?.resume !== 'function') return false;
    try { environment.speechSynthesis.resume(); return true; } catch { return false; }
  }
  function setSpeechEnabled(enabled) {
    speechEnabled = enabled === true;
    if (!speechEnabled) stopSpeech();
  }
  function updateVolume() {
    if (master && context) master.gain.setValueAtTime(volume('sound'), context.currentTime);
    if (activeSpeech?.source) activeSpeech.source.volume = volume('voice');
  }

  function disposeGroup(group, stop = false) {
    if (!groups.has(group)) return;
    groups.delete(group);
    for (const source of group.sources) {
      source.onended = null;
      if (stop) { try { source.stop(); } catch {} }
    }
    for (const node of group.nodes) { try { node.disconnect(); } catch {} }
    group.sources.clear();
    group.nodes.clear();
  }
  function stopEffects() {
    for (const group of [...groups]) disposeGroup(group, true);
  }
  function effect(name) {
    if (!EFFECTS.has(name) || volume("sound") === 0 || !unlock()) return false;
    updateVolume();
    const group = { sources: new Set(), nodes: new Set(), pending: 0 };
    groups.add(group);
    const start = context.currentTime + .015;
    const remember = node => { group.nodes.add(node); return node; };
    const sourceDone = () => { if (--group.pending === 0) disposeGroup(group); };
    function envelope(at, length, level, attack = .008) {
      const gain = remember(context.createGain());
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.linearRampToValueAtTime(level, at + Math.min(attack, length / 3));
      gain.gain.exponentialRampToValueAtTime(.0001, at + length);
      gain.connect(master);
      return gain;
    }
    function schedule(source, at, length) {
      group.sources.add(source);
      group.nodes.add(source);
      group.pending++;
      source.onended = sourceDone;
      source.start(at);
      source.stop(at + length);
    }
    function tone(offset, length, frequency, endFrequency, level, type = "sine", formant = null) {
      const at = start + offset, source = remember(context.createOscillator());
      source.type = type;
      source.frequency.setValueAtTime(frequency, at);
      source.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), at + length);
      const gain = envelope(at, length, level);
      if (formant) {
        const filter = remember(context.createBiquadFilter());
        filter.type = "bandpass";
        filter.frequency.value = formant;
        filter.Q.value = 3;
        source.connect(filter);
        filter.connect(gain);
      } else source.connect(gain);
      schedule(source, at, length);
    }
    function noise(offset, length, level, frequency, endFrequency = frequency, type = "bandpass", brown = false, attack = .008) {
      const at = start + offset, buffer = context.createBuffer(1, Math.max(1, Math.ceil(context.sampleRate * length)), context.sampleRate);
      const samples = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        if (brown) { last = (last + .02 * white) / 1.02; samples[i] = last * 3.5; }
        else samples[i] = white;
      }
      const source = remember(context.createBufferSource());
      source.buffer = buffer;
      const filter = remember(context.createBiquadFilter());
      filter.type = type;
      filter.frequency.setValueAtTime(frequency, at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), at + length);
      filter.Q.value = .8;
      source.connect(filter);
      filter.connect(envelope(at, length, level, attack));
      schedule(source, at, length);
    }
    try {
      switch (name) {
        case "footsteps":
          for (let i = 0; i < 4; i++) {
            noise(i * .21, .09, .42, 450, 170, "lowpass", true);
            tone(i * .21, .07, 150 - i % 2 * 20, 65, .1);
          }
          break;
        case "sigh":
          noise(0, .75, .16, 1200, 350, "bandpass", true, .17);
          tone(.04, .54, 170, 100, .025, "triangle");
          break;
        case "glass_break":
          noise(0, .14, .2, 2200, 5000, "highpass");
          for (let i = 0; i < 8; i++) {
            const f = [1877, 2311, 3043, 4093, 5279, 3427, 6131, 2609][i];
            tone(i < 3 ? 0 : .08 + (i - 3) * .075, .12 + (i % 3) * .08, f, f * .77, .035, "triangle");
          }
          break;
        case "mabel_laugh":
          // Short unsettling chuckles, intentionally synthetic rather than a recording.
          for (let i = 0; i < 5; i++) {
            tone(i * .16, .14, 325 - i * 12, 215 - i * 9, .08, "sawtooth", 1050);
            tone(i * .16, .14, 650 - i * 24, 430 - i * 18, .035, "triangle", 1800);
            noise(i * .16, .1, .035, 1400, 800);
          }
          break;
        case "impact":
          tone(0, .23, 130, 38, .3);
          noise(0, .16, .32, 800, 140, "lowpass", true);
          break;
        case "fire":
          noise(0, 1.3, .26, 350, 1700, "bandpass", true, .12);
          for (let i = 0; i < 14; i++) noise(.06 + i * .078, .025 + i % 3 * .01, .07, 2300 + i % 4 * 550, 600, "highpass");
          break;
        case "monster_dissolve":
          noise(0, .95, .23, 500, 4700, "bandpass", false, .08);
          tone(0, .85, 700, 110, .08, "triangle");
          tone(.08, .74, 1090, 185, .035);
          break;
        case "birds":
          for (let i = 0; i < 5; i++) {
            tone(i * .43, .10, 2200 + i % 3 * 180, 3050 + i % 2 * 250, .028);
            tone(i * .43 + .13, .14, 2800 + i % 2 * 120, 2050, .022);
          }
          break;
        case "forest_wind":
          noise(0, 3.2, .045, 440, 690, "lowpass", true, .9);
          noise(.8, 2.3, .025, 1800, 900, "bandpass", true, .6);
          break;
        case "branch_crack":
          noise(0, .075, .21, 1800, 600, "bandpass");
          noise(.085, .17, .12, 1100, 340, "lowpass", true);
          tone(.012, .1, 190, 65, .045, "triangle");
          break;
        case "dog_whine":
          tone(0, .72, 620, 890, .025, "sine", 1500);
          tone(.06, .62, 1240, 1500, .009, "sine", 2400);
          noise(0, .65, .009, 1400, 1700, "bandpass", true, .13);
          break;
        case "unknown_call":
          noise(0, 2.2, .065, 210, 95, "bandpass", true, .28);
          tone(.05, 1.9, 92, 56, .037, "triangle", 130);
          tone(.23, 1.6, 143, 98, .018, "sine", 220);
          break;
        case "blue_spark":
          noise(0, .35, .018, 3100, 700, "bandpass", false, .045);
          tone(.03, .62, 690, 1040, .018, "sine");
          tone(.08, .49, 1035, 1560, .007, "sine");
          break;
        case "bell":
          tone(0, .42, 1320, 1080, .055, "sine");
          tone(.015, .55, 1980, 1510, .026, "sine");
          tone(.035, .7, 2640, 2020, .012, "triangle");
          break;
      }
      return true;
    } catch {
      disposeGroup(group, true);
      return false;
    }
  }

  return {
    unlock, effect, speak, stopSpeech, pauseSpeech, resumeSpeech, stopEffects,
    setSpeechEnabled, availableSpeech, speechMode, updateVolume,
    get isSpeaking() { return activeSpeech !== null; }
  };
}
