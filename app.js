import { StoryEngine, plainText } from "./engine.js";
import { CAMPAIGN_KEY, CHAPTERS, CHAPTER_IDS, ENDINGS, CHAPTER2_ENDINGS, CHAPTER3_ENDINGS, normalizeMonster, normalizeChapter, chapterForSnapshot, saveKey, chapterTitle, seedFlags, readCampaign, markCompleted, chapter2Handoff } from "./campaign.js";
import { BitmapText } from "./bitmap-font.js";
import { FLOW_KEY, readFlowProgress, observeFlow, getFlowGraph } from "./flowchart.js";
import { createFlowchart } from "./flowchart-view.js";
import { STORY_KEY, createStoryStateService } from "./story-state.js";
import { STORY_REGISTRY, choicesFromSnapshot, reconcileSnapshot, progressFromSnapshot, canonicalFlowSnapshot, migrateLegacyStory, replayCanonicalSnapshot, rebuildSnapshotsForRewrite, createCanonicalFlowJump, choiceForFlowNode, boundSnapshotCache, seedChapterFlags, seedChapterInventory } from "./story-bridge.js";
import { createChapterAudio, voiceLineKey } from "./chapter-audio.js";
import { AMBIENCE_PRESETS, ANIMATION_PRESETS, EXPRESSION_FALLBACKS, normalizePresentationState } from "./presentation.js";
const { manifest, config, scripts, chapter1Art: baseChapter1Art = {}, chapter2Art = {}, chapter3Art = {}, chapter2Audio = {}, voices = {} } = window.REVERSE_FALLS_DATA;
const chapter1Art = { ...baseChapter1Art, ...chapter2Art, ...chapter3Art };
for (const group of ['backgrounds','characters','sprites','items','cast','emotions']) chapter1Art[group] = { ...baseChapter1Art[group], ...chapter2Art[group], ...chapter3Art[group] };
const $ = (id) => document.getElementById(id);
const visible = (id, yes) => {
  $(id).hidden = !yes;
};
const lower = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
const sprites = lower(manifest.sprites), textures = lower(manifest.textures), audio = lower({ ...manifest.audio, ...chapter2Audio.effects, ...chapter2Audio.ambience });
const storyCharacters = { ...config.characters, ...chapter1Art.characters };
const characters = lower(storyCharacters), backgrounds = lower(config.backgrounds);
const font = new BitmapText(config.fonts, manifest);
const storage = { get(k) {
  try {
    const raw = localStorage.getItem(k);
    try { return JSON.parse(raw); }
    catch { return k === STORY_KEY && raw !== null ? { schemaVersion: 'invalid', originalData: raw } : null; }
  } catch { return null; }
}, set(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}, remove(k) {
  try {
    localStorage.removeItem(k);
  } catch {
  }
} };
const chapterLanguage = () => "russian";
const preferences = { chapter: 0, language: "russian", textColor: "gradient", master: 1, music: 0.6, voice: 0.8, sound: 0.7, ambience: 0.55, effectsQuality: "high", reducedMotion: false, speed: 20, speech: false, ...storage.get("reverse-falls-preferences") };
preferences.language = "russian";
if (!["high", "medium", "low"].includes(preferences.effectsQuality)) preferences.effectsQuality = "high";
preferences.reducedMotion = preferences.reducedMotion === true;
const channelVolume = channel => Math.max(0, Math.min(1, Number(preferences.master ?? 1) * Number(preferences[channel] ?? 1)));
const chapterAudio = createChapterAudio({ voices, chapter2Audio, getVolume: channel => channelVolume(channel), getVoiceContext: () => ({ chapter: currentChapter, script: engine?.state.script, sourceLine: engine?.state.line - 1, language: preferences.language }) });
const ambienceAudio = createChapterAudio({ chapter2Audio, getVolume: () => channelVolume("ambience") });
chapterAudio.setSpeechEnabled(preferences.speech);
let spokenSequence = -1, speechDeadline = 0, speechPausedAt = 0, diegeticUntil = 0;
let currentChapter = normalizeChapter(preferences.chapter);
let campaign = readCampaign(null);
let flowProgress = readFlowProgress(null);
let storyReady = false, storyFailure = null, synchronizingStory = false;
const replayResources = () => ({ scripts, characters: storyCharacters, language: preferences.language });
function validateStorySnapshot(snapshot, chapter, canon) {
  if (chapterForSnapshot(snapshot) !== chapter) return false;
  const verifier = new StoryEngine({ scripts, characters: storyCharacters, language: snapshot.language });
  verifier.restore(snapshot);
  if (!canon) return true;
  const cursor = canon.progress[chapter];
  if (cursor && (cursor.sceneId !== snapshot.script || cursor.line !== snapshot.line || cursor.phase !== snapshot.phase)) return false;
  for (const [id, option] of Object.entries(choicesFromSnapshot(snapshot))) if (canon.choices[id] !== option) return false;
  const projected = reconcileSnapshot(snapshot, canon);
  if (Object.keys(projected.flags).length !== Object.keys(snapshot.flags || {}).length || Object.entries(projected.flags).some(([key, value]) => snapshot.flags[key] !== value)) return false;
  if (CHAPTERS[chapter]?.authored && JSON.stringify(projected.inventory) !== JSON.stringify(snapshot.inventory)) return false;
  const variant = snapshot.script.match(/(?:intro_2_|mothman_2_|cafe_|yard_|clearing_)(werewolf|wendigo|vampire)$/);
  return !variant || variant[1] === canon.choices['ch0.creature']?.toLowerCase();
}
function validateStoryProgress(progress, chapter, canon) {
  const language = chapterLanguage(chapter, progress.language || preferences.language);
  const verifier = new StoryEngine({ scripts, characters: storyCharacters, language });
  const namespace = CHAPTERS[chapter].start.split('/')[0] + '/';
  return typeof progress.sceneId === 'string' && progress.sceneId.startsWith(namespace) && verifier.hasScript(progress.sceneId) &&
    Number.isInteger(progress.line) && progress.line >= 0 && ['running','dialogue','pause','choice','map','credits'].includes(progress.phase);
}
const storyState = createStoryStateService({ storage, registry: STORY_REGISTRY, validateSnapshot: validateStorySnapshot, validateProgress: validateStoryProgress });
function refreshCampaignProjection() {
  const data = storyState.getState();
  campaign = readCampaign(null);
  for (const chapter of STORY_REGISTRY.chapterIds) if (data.canon.progress[chapter]?.completed && data.snapshots[chapter]) campaign = markCompleted(campaign, reconcileSnapshot(data.snapshots[chapter], data.canon));
  flowProgress = readFlowProgress(data.discovery);
}
function storyError(error) {
  const ru = preferences.language === 'russian';
  console.error('Story operation failed:', error.code || error.name, error.message, error.details || []);
  notify(ru ? 'Не удалось сохранить изменение истории. Основное сохранение осталось прежним.' : 'The story change could not be saved. Your official save is unchanged.');
}
function sessionData() {
  const temporary = storyState.getAlternativeSession();
  return temporary || storyState.getState();
}
function syncStory(snapshot) {
  if (!storyReady || synchronizingStory || !snapshot?.script) return;
  const chapter = chapterForSnapshot(snapshot);
  if (chapter === null) return;
  const session = sessionData();
  const choices = { ...session.canon.choices, ...choicesFromSnapshot(snapshot) };
  const progress = { ...session.canon.progress, [chapter]: progressFromSnapshot(snapshot) };
  const projected = reconcileSnapshot(snapshot, { ...session.canon, choices, progress, currentChapter: chapter });
  const snapshots = boundSnapshotCache({ ...session.snapshots, [chapter]: projected }, chapter);
  const patch = { choices, progress, currentChapter: chapter, snapshots };
  if (storyState.getAlternativeSession()) storyState.updateAlternative(patch);
  else storyState.updateCanonical(patch, 'chapter progress');
  if (engine?.state.script === snapshot.script && engine.state.sequence === snapshot.sequence) {
    engine.state.flags = projected.flags;
    engine.state.inventory = projected.inventory;
  }
  refreshCampaignProjection();
}
function syncAlternativeIndicator() {
  const active = !!storyState.getAlternativeSession();
  const indicator = $('alternative-indicator');
  if (indicator) indicator.hidden = !active;
  if ($('alternative-label')) $('alternative-label').textContent = preferences.language === 'russian' ? 'Альтернативный путь' : 'Alternative path';
  if ($('alternative-exit')) $('alternative-exit').textContent = preferences.language === 'russian' ? 'Вернуться к основной истории' : 'Return to official story';
}
function initializeStory() {
  try {
    let initial = null;
    if (!storage.get(STORY_KEY)) {
      const chapter0 = storage.get(saveKey(0)), chapter1 = storage.get(saveKey(1)), oldCampaign = storage.get(CAMPAIGN_KEY), discovery = storage.get(FLOW_KEY);
      if (chapter0 || chapter1 || oldCampaign || discovery) initial = migrateLegacyStory({ chapter0, chapter1, campaign: oldCampaign, discovery, currentChapter, validateSnapshot: validateStorySnapshot,
        replay: (chapter, canon, snapshot) => replayCanonicalSnapshot(chapter, canon, snapshot, replayResources()) });
    }
    storyState.init(initial);
    storyReady = true;
    refreshCampaignProjection();
    const diagnostics = storyState.getWarnings();
    const localized = diagnostics.map(message => {
      if (preferences.language !== 'russian') return message;
      if (message.includes('migrated')) return 'Сохранения перенесены в единую основную историю. Исходные данные сохранены для восстановления.';
      if (message.includes('recalculated')) return 'Производные данные пересчитаны по основным решениям. Резервная копия сохранена.';
      if (message.includes('restored')) return 'Основная история восстановлена из контрольной точки.';
      return 'Система сохранений обновлена. Проверьте основной путь на карте решений.';
    });
    return [...(initial?.warnings || []).map(() => "Старое сохранение перенесено в основную историю. Исходные данные сохранены."), ...localized];
  } catch (error) {
    storyFailure = error;
    storyReady = false;
    storyError(error);
    return [preferences.language === 'russian' ? 'Основная история требует восстановления. Исходное сохранение сохранено; запуск приостановлен.' : 'Your official story needs recovery. The original save is retained; playback is paused.'];
  }
}
let flowSignature = "";
let engine, mode = "menu", auto = false, skip = false, hidden = false, frameStart = 0, displayed = 0, textCount = 0, finishedAt = 0, lineSequence = -1, lastTick = 0, readyAt = 0, inlinePause = 0, renderedBackground = "", previous = [], toastTimer;
const charNodes = /* @__PURE__ */ new Map();
let visualChars = {}, effectTimers = [], effectGeneration = 0, ambienceTimer = null, ambienceName = null, ambienceStep = 0;
function cancelEffects() {
  diegeticUntil = 0;
  chapterAudio.stopEffects();
  ambienceAudio.stopEffects();
  for (const timer of effectTimers) clearTimeout(timer);
  effectTimers = [];
  effectGeneration++;
  document.querySelectorAll(".background-transition").forEach((x) => x.remove());
  document.querySelectorAll(".story-effect").forEach(x => x.remove());
  $("story-blue-glow")?.remove();
  $("background").classList.remove("shaking");
  for (const cls of [...$("camera-layer").classList]) if (cls.startsWith("camera-shake-")) $("camera-layer").classList.remove(cls);
  stopAmbience();
}
function later(fn, delay) {
  const generation = effectGeneration;
  if (delay <= 1) {
    fn();
    return;
  }
  effectTimers.push(setTimeout(() => {
    if (generation === effectGeneration) fn();
  }, delay));
}
const playing = { music: null, voice: null, ambience: null, sound: /* @__PURE__ */ new Set() };
const soundtrack = { name: null };
const imageCache = /* @__PURE__ */ new Map();
function asset(name, group = textures) {
  return name ? group[String(name).toLowerCase()]?.path : null;
}
function image(path) {
  if (!imageCache.has(path)) {
    const im = new Image();
    im.src = path;
    imageCache.set(path, im);
  }
  return imageCache.get(path);
}
function notify(text) {
  $("toast").textContent = text;
  visible("toast", true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => visible("toast", false), 2200);
}
function savePreferences() {
  storage.set("reverse-falls-preferences", preferences);
}
function labels(kind) {
  const text = scripts[`textes/${preferences.language}/lists/${kind}`] || scripts[`textes/russian/lists/${kind}`] || "";
  return Object.fromEntries([...text.matchAll(/\[([^\s\]]+)(?:\s+[^\]]*)?\]\s*([^\r\n]+)/g)].map((m) => [m[1].toLowerCase(), m[2].trim()]));
}
function label(key, fallback) {
  return labels("options")[key.toLowerCase()] || fallback;
}
function uiText() {
  const ru = preferences.language === "russian";
  $("start-button").textContent = ru ? "Играть" : "Play";
  $("continue-button").textContent = ru ? "Продолжить" : "Continue";
  $("quit-button").textContent = ru ? "ВЫХОД" : "EXIT";
  $("credits-button").textContent = ru ? "Авторы" : "Credits";
  $("settings").querySelector("h1").textContent = label("option", "OPTION");
  const ids = { "save-button": ["save", "Save"], "load-button": ["reload_last_save", "Reload Last Save"], "restart-button": ["delete_save", "Restart Chapter"], "menu-button": ["return_menu", "Return to Menu"], "settings-close": ["return", "Return"], "settings-quit": ["quit", "Quit"], "save-quit-button": ["save_quit", "Save & Quit"] };
  for (const [id, [k, f]] of Object.entries(ids)) $(id).textContent = label(k, f);
  document.documentElement.lang = ru ? "ru" : "en";
  const volumeNames = ru ? { master: "Общая громкость", music: "Музыка", voice: "Голос", sound: "Звуки", ambience: "Атмосфера" } : { master: "Master", music: "Music", voice: "Voice", sound: "SFX", ambience: "Ambience" };
  for (const range of document.querySelectorAll("[data-volume]")) range.closest(".volume-row").querySelector("span").textContent = volumeNames[range.dataset.volume] || range.dataset.volume;
  $("effects-quality-label").textContent = ru ? "Качество эффектов" : "Effects Quality";
  for (const option of $("effects-quality").options) option.textContent = ru ? ({ high: "Высокое", medium: "Среднее", low: "Низкое" }[option.value]) : ({ high: "High", medium: "Medium", low: "Low" }[option.value]);
  $("reduced-motion-label").textContent = ru ? "Меньше движения" : "Reduced Motion";
  $("reduced-motion-note").textContent = ru ? "Уменьшает приближения, тряску и резкие движения персонажей." : "Reduces zoom, shake and large character movement.";
  document.querySelector(".text-color-setting>span").textContent = label("text_color", "Text Color");
  for (const option of $("text-color-select").options) option.textContent = label(option.value, option.value);
  $("settings").querySelector("h1").style.fontSize = `${200 * languageScale()}px`;
  for (const span of document.querySelectorAll(".volume-row:not(.text-speed-row)>span")) span.style.fontSize = `${150 * languageScale()}px`;
  document.querySelector(".text-color-setting>span").style.fontSize = `${100 * languageScale()}px`;
  $("text-color-select").style.fontSize = `${100 * languageScale()}px`;
  chapterUI();
  if (font.fonts.size) paintMenu();
}
function paintMenu() {
  for (const [id, size] of [["chapters-button", 100], ["start-button", 180], ["continue-button", 150], ["quit-button", 220], ["credits-button", 90], ...Array.from(document.querySelectorAll("#settings button")).map((b) => [b.id, parseFloat(getComputedStyle(b).fontSize)])]) {
    const button = $(id);
    const text = button.textContent || button.getAttribute("aria-label") || "";
    const canvas = document.createElement("canvas");
    const width = button.clientWidth || parseFloat(getComputedStyle(button).width), height = button.clientHeight || parseFloat(getComputedStyle(button).height);
    let fitted = size * languageScale();
    if (button.closest("#settings")) {
      button.style.padding = "0";
      while (fitted > 40 && font.layout(text, { font: currentFont(true), size: fitted, maxWidth: width - 20 }).height > height - 16) fitted -= 2;
    }
    font.draw(canvas, text, { font: currentFont(true), size: fitted, color: button.closest("#settings") ? "#000" : "#fff", outline: button.closest("#settings") ? 0 : 3, width, height, maxWidth: width, align: "center" });
    button.setAttribute("aria-label", text);
    button.replaceChildren(canvas);
  }
}
function resize() {
  const s = Math.min(innerWidth / 3840, innerHeight / 2160);
  $("stage").style.setProperty("--scale", s);
}
window.addEventListener("resize", resize);
resize();
function stopAudio(channel, { fade = 0 } = {}) {
  if (channel === "voice") { chapterAudio.stopSpeech(); speechPausedAt = 0; }
  if (channel === "sound") chapterAudio.stopEffects();
  const current = playing[channel];
  const finish = audioNode => {
    if (!audioNode) return;
    try { audioNode.pause(); audioNode.currentTime = 0; } catch {}
  };
  if (channel === "sound") {
    for (const a of current) finish(a);
    current.clear();
  } else if (current) {
    if (fade > 0 && !skip) fadeAudio(current, current.volume, 0, fade, () => finish(current));
    else finish(current);
    playing[channel] = null;
  }
  if (channel === "music") soundtrack.name = null;
}
function fadeAudio(node, from, to, seconds, onDone) {
  const duration = Math.max(0, Number(seconds) || 0) * 1000;
  if (!node || duration < 16 || skip) { if (node) node.volume = to; onDone?.(); return; }
  const started = performance.now();
  const step = now => {
    if (!node) return;
    const t = Math.max(0, Math.min(1, (now - started) / duration));
    node.volume = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(step); else onDone?.();
  };
  requestAnimationFrame(step);
}
function playAudio(channel, name, { muted = false, fade = 0, crossfade = false, gain = 1 } = {}) {
  const targetVolume = muted ? 0 : channelVolume(channel) * Math.max(0, Math.min(1, Number(gain) || 0));
  if (channel === "music" && name && soundtrack.name === String(name).toLowerCase()) {
    if (playing.music) {
      playing.music.volume = targetVolume;
      if (playing.music.paused) playing.music.play().catch(() => {});
    }
    return;
  }
  if (!name) { stopAudio(channel, { fade }); return; }
  const record = audio[String(name).toLowerCase()];
  if (!record) {
    console.debug("Audio not present in original build:", name);
    return;
  }
  const previousAudio = channel === "music" ? playing.music : null;
  if (channel !== "music" || !crossfade) stopAudio(channel, { fade: channel === "music" ? fade : 0 });
  const a = new Audio(record.path);
  a.volume = fade > 0 && !skip ? 0 : targetVolume;
  a.loop = channel === "music" || channel === "ambience";
  if (channel === "sound") {
    playing.sound.add(a);
    a.addEventListener("ended", () => playing.sound.delete(a), { once: true });
  } else playing[channel] = a;
  if (channel === "music") soundtrack.name = String(name).toLowerCase();
  a.play().catch(() => {});
  if (fade > 0 && !skip) fadeAudio(a, 0, targetVolume, fade);
  if (previousAudio && crossfade) {
    fadeAudio(previousAudio, previousAudio.volume, 0, fade || .6, () => { try { previousAudio.pause(); } catch {} });
  }
}
function updateVolume() {
  chapterAudio.updateVolume();
  ambienceAudio.updateVolume();
  for (const ch of ["music", "voice", "ambience"]) if (playing[ch]) playing[ch].volume = ch === "music" && engine?.state.musicMuted ? 0 : channelVolume(ch) * (ch === "music" ? engine?.state.musicGain ?? 1 : 1);
  for (const a of playing.sound) a.volume = channelVolume("sound");
  savePreferences();
}
function setBackground(name, instant = false, duration = 2.5) {
  const key = String(name || "black").toLowerCase();
  if (key === renderedBackground) return;
  renderedBackground = key;
  const replacement = currentChapter >= 1 ? chapter1Art.backgrounds?.[key] : null;
  const path = replacement?.path || asset(backgrounds[key]?.texture || key);
  const filter = replacement?.filter || "none";
  const bg = $("background");
  document.querySelectorAll(".background-transition").forEach((x) => x.remove());
  if (instant) {
    bg.style.opacity = path ? "1" : "0";
    bg.style.filter = filter;
    if (path) bg.src = path;
    bg.style.objectFit = mode === "menu" ? "cover" : "fill";
    return;
  }
  const next2 = document.createElement("div");
  next2.className = "background-transition";
  Object.assign(next2.style, { position: "absolute", inset: "0", zIndex: "1", pointerEvents: "none", backgroundColor: "#00000f", backgroundImage: path ? `url("${path}")` : "none", backgroundSize: "100% 100%", filter, opacity: "0", transition: `opacity ${duration}s linear` });
  bg.after(next2);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    next2.style.opacity = "1";
  }));
  later(() => {
    if (renderedBackground !== key) { next2.remove(); return; }
    if (path) bg.src = path;
    bg.style.opacity = path ? "1" : "0";
    bg.style.filter = filter;
    bg.style.objectFit = "fill";
    next2.remove();
  }, duration * 1e3 + 50);
}

function syncPresentationPreferences() {
  $("stage").dataset.effectsQuality = preferences.effectsQuality;
  $("stage").dataset.reducedMotion = String(preferences.reducedMotion);
  $("effects-quality").value = preferences.effectsQuality;
  $("reduced-motion").checked = preferences.reducedMotion;
}
function renderCamera(camera = engine?.state.presentation?.camera, instant = false) {
  const state = normalizePresentationState({ camera }).camera;
  const layer = $("camera-layer");
  let x = state.x, y = state.y, zoom = state.zoom;
  if (state.focus) {
    const char = visualChars[state.focus];
    if (char?.visible) x = Math.max(-80, Math.min(80, -Number(char.x || 0) * .10));
  }
  if (preferences.reducedMotion) {
    zoom = 1 + (zoom - 1) * .35;
    x *= .35;
    y *= .35;
  }
  const duration = instant || skip ? 0 : Math.max(0, Number(state.duration || .45));
  layer.style.transition = duration ? `transform ${duration}s ${state.easing || "ease"}` : "none";
  layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
}
function renderBackgroundEffect(name = engine?.state.presentation?.backgroundEffect) {
  const fx = $("background-fx");
  if (!name || preferences.effectsQuality === "low") delete fx.dataset.effect;
  else fx.dataset.effect = name;
}
function cameraShake(strength = "small", duration = .3) {
  if (preferences.reducedMotion || preferences.effectsQuality === "low" || skip) return;
  const layer = $("camera-layer");
  for (const cls of [...layer.classList]) if (cls.startsWith("camera-shake-")) layer.classList.remove(cls);
  void layer.offsetWidth;
  const cls = `camera-shake-${strength}`;
  layer.classList.add(cls);
  later(() => layer.classList.remove(cls), Math.max(120, Number(duration || .3) * 1000 + 30));
}
function animateCharacter(id, preset, duration) {
  if (preferences.reducedMotion || preferences.effectsQuality === "low" || skip) return;
  const el = charNodes.get(String(id).toLowerCase());
  if (!el || !ANIMATION_PRESETS[preset]) return;
  for (const cls of [...el.classList]) if (cls.startsWith("motion-")) el.classList.remove(cls);
  void el.offsetWidth;
  const cls = `motion-${preset}`;
  el.style.animationDuration = `${Math.max(.12, Number(duration || ANIMATION_PRESETS[preset].duration / 1000))}s`;
  el.classList.add(cls);
  later(() => { el.classList.remove(cls); el.style.animationDuration = ''; }, Math.max(120, Number(duration || ANIMATION_PRESETS[preset].duration / 1000) * 1000 + 40));
}
function expressionTransition(id, seconds = .18) {
  if (preferences.reducedMotion || skip || Number(seconds) <= 0) return;
  const el = charNodes.get(String(id).toLowerCase());
  if (!el) return;
  el.style.setProperty("--expression-duration", `${seconds}s`);
  el.classList.remove("expression-transition");
  void el.offsetWidth;
  el.classList.add("expression-transition");
  later(() => el.classList.remove("expression-transition"), seconds * 1000 + 40);
}
function stopAmbience() {
  if (ambienceTimer) clearTimeout(ambienceTimer);
  ambienceTimer = null;
  ambienceName = null;
  ambienceStep = 0;
  stopAudio("ambience");
  ambienceAudio.stopEffects();
}
function playAmbience(name, { fade = .6 } = {}) {
  if (!name) { stopAmbience(); return; }
  if (ambienceName === name) return;
  stopAmbience();
  ambienceName = name;
  const record = audio[String(name).toLowerCase()];
  if (record) {
    playAudio("ambience", name, { fade });
    return;
  }
  const preset = AMBIENCE_PRESETS[name];
  if (!preset || currentChapter < 1 || preferences.effectsQuality === "low") return;
  const pulse = () => {
    if (ambienceName !== name) return;
    if (!skip && channelVolume("ambience") > 0) {
      const effect = preset.effects[ambienceStep++ % preset.effects.length];
      ambienceAudio.effect(effect);
    }
    ambienceTimer = setTimeout(pulse, preset.interval);
  };
  pulse();
}
function previewPresentation(kind, id, target = "pacifica") {
  if (kind === "animation") animateCharacter(target, id, ANIMATION_PRESETS[id]?.duration / 1000);
  if (kind === "camera" && engine) {
    const camera = { ...normalizePresentationState(engine.state.presentation).camera, ...(id === "normal" ? { zoom: 1, x: 0, y: 0 } : id === "close" ? { zoom: 1.08 } : id === "dramatic" ? { zoom: 1.12, y: 28 } : id === "horror" ? { zoom: 1.1, y: 18 } : {}) };
    renderCamera(camera);
  }
  if (kind === "fx") renderBackgroundEffect(id === "clear" ? null : id);
  if (kind === "sfx") chapterAudio.effect(id);
}

function setupEngine() {
  engine = new StoryEngine({ scripts, language: preferences.language, characters: storyCharacters });
  window.game = { get engine() {
    return engine;
  }, get mode() {
    return mode;
  }, get chapter() {
    return currentChapter;
  }, get campaign() {
    return campaign;
  }, get story() { return storyState; }, get alternative() { return storyState.getAlternativeSession(); },
  exportCanonSave, selectCanonSave, commitCanonImport, startChapter: start, openChapters, openFlowchart, jumpToNode, exitAlternative, rewriteStoryChoice, next, choose, visitLocation, save, load, showMenu, presentation: { preview: previewPresentation, renderCamera, renderBackgroundEffect }, get preferences() {
    return preferences;
  } };
}
function applyEffect(event, { fast = skip } = {}) {
  switch (event.type) {
    case "audio":
      if (event.channel === "voice") break; // Original short voice clips are in English.
      playAudio(event.channel, event.name, event);
      break;
    case "sfx":
      if (!skip && currentChapter >= 1) {
        const played = chapterAudio.effect(event.name); visualCue(event.name);
        if (played && String(event.name).startsWith('ch2_mimic_')) diegeticUntil = performance.now() + (chapter2Audio.effects?.[event.name]?.duration || 0) * 1000;
      }
      break;
    case "background":
      setBackground(event.name, fast || event.instant, event.duration);
      break;
    case "character":
      if (event.characters) visualChars = event.characters;
      else visualChars[event.id] = event.character;
      renderCharacters(fast || event.instant, event.duration);
      if (event.actions?.transition) expressionTransition(event.id, event.actions.transition);
      break;
    case "animation":
      animateCharacter(event.id, event.preset, event.duration);
      break;
    case "camera":
      renderCamera(event.camera, fast);
      break;
    case "camera-shake":
      cameraShake(event.strength, event.duration);
      break;
    case "background-fx":
      renderBackgroundEffect(event.name);
      break;
    case "ambience":
      playAmbience(event.name, event);
      break;
    case "speaker":
      for (const char of Object.values(visualChars)) char.speaking = char.id === String(event.name).toLowerCase();
      break;
    case "shake":
      $("background").classList.toggle("shaking", event.active);
      break;
    case "light":
      renderLight();
      break;
    case "item":
      renderItem();
      break;
    case "effect":
      renderStoryEffect(event.name);
      break;
    case "map":
      mode = "map";
      stopAudio("voice");
      render();
      break;
    case "credits":
      completeChapter();
      break;
    case "dialogue":
      mode = "story";
      render();
      break;
    case "clean":
      visible("dialogue", false);
      break;
  }
}
function handle(result, { restoring = false } = {}) {
  try { syncStory(engine.snapshot()); } catch (error) {
    storyError(error);
    // Restore the last published cursor as well as keeping the authoritative save intact.
    const last = sessionData().snapshots[currentChapter];
    if (last) { engine.restore(last); result = { state: engine.state, events: [] }; restoring = true; }
    else { mode = 'menu'; render(); return; }
  }
  syncAlternativeIndicator();
  recordFlow(result.state, restoring);
  if (restoring) {
    cancelEffects();
    visualChars = JSON.parse(JSON.stringify(engine.state.chars));
    mode = engine.state.phase === "map" ? "map" : engine.state.phase === "credits" ? currentChapter >= 1 ? "ending" : "credits" : "story";
    readyAt = 0;
    playAudio("music", engine.state.music, { muted: engine.state.musicMuted, gain: engine.state.musicGain ?? 1 });
    renderedBackground = "";
    setBackground(engine.state.bg, true);
    $("background").classList.toggle("shaking", !!engine.state.shake);
    renderCharacters(true);
    renderCamera(engine.state.presentation?.camera, true);
    renderBackgroundEffect(engine.state.presentation?.backgroundEffect);
    playAmbience(engine.state.presentation?.ambience, { fade: 0 });
    render();
    return;
  }
  const speed = skip ? 0.025 : 1;
  let cursor = 0, lastLine = null, lastScript = null, delay = 0;
  const startAt = performance.now();
  for (const event of result.events) {
    if (event.sourceLine !== lastLine || event.sourceScript !== lastScript) {
      cursor += delay * speed;
      delay = 0;
      lastLine = event.sourceLine;
      lastScript = event.sourceScript;
    }
    if (event.type === "wait" && !event.inline) delay = Math.max(0, event.duration * 1e3);
    if (event.type === "background") delay = event.instant ? 0 : (event.duration || 2.5) * 1e3;
    if (event.type === "character") delay = event.instant ? 0 : (event.duration ?? (currentChapter >= 1 ? .45 : 2)) * 1e3;
    later(() => applyEffect(event, { fast: speed < 1 }), cursor);
  }
  if (result.state.phase === "pause") cursor += delay * speed;
  readyAt = startAt + cursor;
  later(() => render(), cursor + 2);
  render();
}
function start(chapter = currentChapter, { language, monster } = {}) {
  if (!storyReady) { storyError(storyFailure || new Error('Story is unavailable')); return false; }
  if (storyState.getAlternativeSession()) exitAlternative({ restore: false });
  const requested = normalizeChapter(chapter), data = storyState.getState();
  if (requested === 0 && (Object.keys(data.canon.choices).length || Object.keys(data.canon.progress).length)) {
    const ru = preferences.language === 'russian';
    if (!window.confirm(ru ? 'Начать новую основную историю? Текущий путь будет сохранён в контрольной точке восстановления.' : 'Start a new official story? The current path will be kept in a recovery checkpoint.')) return false;
    try { storyState.updateCanonical({ choices: {}, progress: {}, snapshots: {}, currentChapter: 0 }, 'new game', { checkpoint: true }); }
    catch (error) { storyError(error); return false; }
  }
  if (requested >= 2 && !data.canon.progress[requested - 1]?.completed) {
    notify(preferences.language === 'russian' ? 'Сначала заверши предыдущую главу в основной истории.' : 'Complete the preceding chapter in your official story first.'); return false;
  }
  if (requested >= 1 && data.canon.progress[requested]) {
    storyState.createAlternativeSession({ origin: { chapter: currentChapter, mode, snapshot: engine?.state.script ? engine.snapshot() : null }, startNode: 'start' });
    const temporary = storyState.getAlternativeSession();
    const choices = Object.fromEntries(Object.entries(temporary.canon.choices).filter(([id]) => STORY_REGISTRY.choices.find(choice => choice.id === id)?.chapterId < requested));
    const progress = { ...temporary.canon.progress }, snapshots = { ...temporary.snapshots };
    for (const id of CHAPTER_IDS) if (id >= requested) { delete progress[id]; delete snapshots[id]; }
    storyState.updateAlternative({ choices, progress, snapshots, currentChapter: requested });
  }
  spokenSequence = -1;
  flowchart.close();
  const selected = normalizeChapter(chapter);
  const canonicalMonster = storyState.getSessionCanon().choices['ch0.creature'];
  const flags = selected === 0 ? {} : selected === 1 ? { monster: canonicalMonster || normalizeMonster(monster) } : seedChapterFlags(storyState.getSessionCanon(), selected);
  const inventory = selected >= 2 ? seedChapterInventory(storyState.getSessionCanon(), selected) : [];
  currentChapter = selected;
  preferences.chapter = selected;
  preferences.language = chapterLanguage(selected, language || preferences.language);
  savePreferences();
  cancelEffects();
  visualChars = {};
  renderedBackground = "";
  setBackground("black", true);
  mode = "story";
  auto = false;
  skip = false;
  hidden = false;
  previous = [];
  lineSequence = -1;
  charNodes.clear();
  $("characters").replaceChildren();
  for (const channel of ["music", "voice", "sound", "ambience"]) stopAudio(channel);
  visible("chapter-picker", false);
  visible("chapter-ending", false);
  visible("settings", false);
  visible("history", false);
  readyAt = 0;
  uiText();
  setupEngine();
  handle(engine.start(CHAPTERS[selected].start, { flags, inventory }));
}
function next() {
  if (!engine || flowchart.isOpen() || ["menu", "credits", "ending"].includes(mode) || !$("settings").hidden || !$("history").hidden) return;
  if (hidden) {
    hidden = false;
    render();
    return;
  }
  if (mode === "map") return;
  if (performance.now() < readyAt || !skip && performance.now() < diegeticUntil) return;
  if (displayed < textCount) {
    displayed = textCount;
    const reveal = engine.reveal(Infinity);
    for (const event of reveal.events) applyEffect(event);
    drawDialogue();
    return;
  }
  if (engine.state.phase === "choice") return;
  previous.push(engine.snapshot());
  if (previous.length > 80) previous.shift();
  displayed = 0;
  lineSequence = -1;
  readyAt = 0;
  stopAudio("voice");
  handle(engine.advance());
}
function choose(i) {
  if (flowchart.isOpen() || !storyReady || !engine || engine.state.phase !== 'choice') return;
  const definition = STORY_REGISTRY.choices.find(choice => choice.sceneId === engine.state.script);
  const oldOption = definition && storyState.getChoice(definition.id);
  const option = definition?.options[i]?.id;
  if (!storyState.getAlternativeSession() && oldOption && oldOption !== option) {
    notify(preferences.language === 'russian' ? 'Чтобы изменить прошлое, открой «Полный режим» карты решений.' : 'Use Full mode on the choices map to change an earlier decision.');
    return;
  }
  chapterAudio.stopSpeech();
  previous.push(engine.snapshot());
  displayed = 0;
  lineSequence = -1;
  handle(engine.choose(i));
}
const missingExpressionWarnings = new Set();
function charSpec(char) {
  const data = characters[char.id] || {};
  let expression = currentChapter >= 1 && char.emotion && char.emotion !== "neutral" ? chapter1Art.emotions?.[char.id]?.[char.emotion] || char.expression : char.expression;
  let expr = data.expressions?.[expression] || data.customExpressions?.[expression];
  if (!expr && currentChapter >= 1 && !chapter1Art.sprites?.[char.id]) {
    const fallback = EXPRESSION_FALLBACKS[char.id]?.[expression];
    if (fallback) { expression = fallback; expr = data.expressions?.[expression] || data.customExpressions?.[expression]; }
    if (!expr && expression && expression !== "idle") {
      const key = `${char.id}:${expression}`;
      if (!missingExpressionWarnings.has(key)) { console.warn(`Missing expression ${key}; using neutral/default fallback`); missingExpressionWarnings.add(key); }
    }
  }
  expr ||= {};
  const talk = char.speaking && displayed < textCount && Math.floor(performance.now() / 140) % 2;
  const baseReplacement = currentChapter >= 1 ? chapter1Art.sprites?.[char.id] : null;
  const replacement = baseReplacement?.expressions?.[expression] || baseReplacement?.expressions?.[char.emotion] || baseReplacement;
  return { replacement, data, head: (talk ? expr.talk || data.defaultTalk : expr.shut) || data.default, body: expr.body || data.body };
}
function renderCharacters(instant = null, duration = null) {
  if (!engine) return;
  const state = engine.state;
  for (const char of Object.values(visualChars)) {
    const { data, head, body, replacement } = charSpec(char);
    if (!head && !body && !replacement) continue;
    let el = charNodes.get(char.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "character";
      el.dataset.character = char.id;
      for (const part of ["body", "head"]) {
        const im = new Image();
        im.className = "character-" + part;
        im.draggable = false;
        el.append(im);
      }
      $("characters").append(el);
      charNodes.set(char.id, el);
    }
    const offset = data.offset || { x: 0, y: 0 };
    if (instant !== null) {
      const seconds = duration ?? (currentChapter >= 1 ? .45 : 2);
      el.style.transition = instant ? "none" : `left ${seconds}s ease, bottom ${seconds}s ease, opacity ${Math.min(.45, seconds)}s ease, transform ${Math.min(.4, seconds)}s ease`;
    }
    el.style.left = `${1920 + char.x + offset.x}px`;
    el.style.bottom = `${offset.y}px`;
    el.style.opacity = char.visible ? "1" : "0";
    el.dataset.emotion = currentChapter >= 1 ? char.emotion || "neutral" : "neutral";
    el.style.zIndex = char.order || 0;
    const scaleBase = replacement?.scaleBase || 1;
    el.style.transform = `scale(${(char.flip === "left" ? -1 : 1) * (char.scaleX || 1)/scaleBase},${(char.scaleY || 1)/scaleBase})`;
    const color = char.color || [1, 1, 1];
    const levels = currentChapter >= 1 ? color.slice(0, 3) : color;
    el.style.filter = [levels.every((x) => x >= 0.99) ? "" : `brightness(${Math.max(...levels)})`, replacement?.filter || ""].filter(Boolean).join(" ") || "none";
    const bodyData = replacement ? null : sprites[String(body).toLowerCase()], headData = replacement || sprites[String(head).toLowerCase()];
    for (const [part, spec, y] of [["body", bodyData, 0], ["head", headData, bodyData?.height || 0]]) {
      const im = el.querySelector(".character-" + part);
      if (!spec) {
        im.hidden = true;
        continue;
      }
      im.hidden = false;
      if (im.getAttribute("src") !== spec.path) im.src = spec.path;
      Object.assign(im.style, { width: `${spec.width}px`, height: `${spec.height}px`, left: `${-spec.width / 2}px`, bottom: `${y}px` });
    }
  }
  for (const [id, el] of charNodes) if (!visualChars[id]) el.style.opacity = 0;
}
function visualCue(name) {
  if (!["glass_break", "fire", "monster_dissolve", "impact"].includes(name)) return;
  const cue = document.createElement("div");
  cue.className = `story-effect story-effect-${name}`;
  cue.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 16; i++) {
    const particle = document.createElement("i");
    particle.style.setProperty("--angle", `${i * 22.5}deg`);
    particle.style.setProperty("--distance", `${180 + i % 4 * 110}px`);
    particle.style.setProperty("--delay", `${i % 3 * .04}s`);
    cue.append(particle);
  }
  $("stage").append(cue);
  later(() => cue.remove(), 1400);
}
function renderLight() {
  const light = engine?.state.light;
  let el = $("scene-light");
  if (!el) {
    el = new Image();
    el.id = "scene-light";
    $("characters").after(el);
  }
  const p = asset(light);
  el.hidden = !p;
  if (p) el.src = p;
}
function renderItem() {
  let el = $("scene-item");
  if (!el) {
    el = new Image();
    el.id = "scene-item";
    $("shade").after(el);
  }
  const item = engine?.state.item;
  el.dataset.item = currentChapter >= 1 ? String(item || "") : "";
  const replacement = currentChapter >= 1 ? chapter1Art.items?.[String(item).toLowerCase()] : null;
  const p = replacement?.path || asset(item) || asset(item, sprites);
  el.hidden = !p;
  if (p) {
    el.src = p;
    el.alt = replacement?.name?.[preferences.language] || "";
    el.style.width = `${replacement?.width || 700}px`;
    el.style.height = `${replacement?.height || 700}px`;
  }
}
function renderStoryEffect(name = engine?.state.visualEffect) {
  let el = $("story-blue-glow");
  if (currentChapter !== 1 || name !== "blue_glow" || mode !== "story") {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = "story-blue-glow";
    el.setAttribute("aria-hidden", "true");
    $("characters").before(el);
  }
  el.dataset.subject = engine.state.script.endsWith("/will") ? "will" : "forest";
}
function languageScale() {
  return ["russian", "ukrainian", "polish"].includes(preferences.language) ? 0.7 : 1;
}
function currentFont(bold = false) {
  return ["russian", "ukrainian", "polish"].includes(preferences.language) ? bold ? "AccentsRobotoBoldC" : "AccentsRobotoMediumC" : bold ? "AgendaBoldEC" : "AgendaMediumEC";
}
function drawDialogue() {
  if (!engine) return;
  const s = engine.state;
  const sp = { ...characters[String(s.speaker).toLowerCase()], ...(currentChapter >= 1 ? chapter1Art.cast?.[String(s.speaker).toLowerCase()]?.dialogueStyle : null) };
  const rgb = sp?.color || [1, 1, 1];
  const color = "#" + rgb.slice(0, 3).map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
  const speakerNames = labels("names");
  const isNarrator = String(s.speaker).toLowerCase() === "narrator";
  const castName = currentChapter >= 1 ? chapter1Art.cast?.[String(s.speaker).toLowerCase()]?.name?.[preferences.language] : null;
  const name = isNarrator ? "" : s.chars[String(s.speaker).toLowerCase()]?.secret ? "???" : castName || speakerNames[String(s.speaker).toLowerCase()] || "Персонаж";
  let canvas = $("speaker").querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    $("speaker").replaceChildren(canvas);
  }
  font.draw(canvas, name, { font: currentFont(true), size: 144 * languageScale(), color: preferences.textColor === "white" ? "#fff" : color, gradient: preferences.textColor === "gradient" ? sp?.gradient : null, width: 2276, height: 180, maxWidth: 2276, outline: 2 });
  font.draw($("text-canvas"), s.text, { font: currentFont(), extendedGlyphs: true, size: 124 * languageScale(), color: isNarrator || preferences.textColor === "white" ? "#fff" : color, gradient: preferences.textColor === "gradient" && !isNarrator ? sp?.gradient : null, width: 2276, height: 466, maxWidth: 2276, maxChars: displayed, outline: 2 });
  $("text-accessible").textContent = plainText(s.text);
  $("speaker").setAttribute("aria-label", name);
  $("advance-mark").hidden = displayed < textCount || s.phase === "choice";
}
function render() {
  const s = engine?.state;
  visible("menu", mode === "menu");
  visible("credits", mode === "credits");
  visible("chapter-ending", mode === "ending");
  const story = mode === "story";
  visible("dialogue", story && !hidden && performance.now() >= readyAt && (s?.phase === "dialogue" || s?.phase === "pause" || s?.phase === "choice"));
  visible("toolbar", mode === "story" || mode === "map");
  visible("map", mode === "map");
  visible("choice-list", story && !hidden && s?.phase === "choice");
  $("characters").hidden = ["menu", "credits", "ending", "map"].includes(mode);
  $("shade").style.opacity = 0;
  renderStoryEffect();
  if (mode === "menu") {
    setBackground("black", true);
    visible("continue-button", hasSave(currentChapter));
    return;
  }
  if (mode === "credits" || mode === "ending") return;
  if (s.sequence !== lineSequence && s.phase === "dialogue") {
    lineSequence = s.sequence;
    displayed = 0;
    textCount = [...plainText(s.text)].length;
    frameStart = performance.now();
    finishedAt = 0;
    lastTick = frameStart;
    inlinePause = 0;
  }
  if (mode === "map" && currentChapter === 0) {
    const done = s.visited.filter((x) => ["arcade", "hardware_store", "telepathy_tent"].includes(x)).length;
    if (done >= 3 && !s.visited.includes("forest")) {
      const pendingEngine = engine;
      setTimeout(() => {
        if (engine === pendingEngine && mode === "map" && engine.state.phase === "map" && engine.state.visited.filter(x => ["arcade", "hardware_store", "telepathy_tent"].includes(x)).length >= 3 && !engine.state.visited.includes("forest")) visitLocation("Forest");
      }, 0);
      return;
    }
    renderMap();
    return;
  }
  renderCharacters();
  renderCamera(s.presentation?.camera);
  renderBackgroundEffect(s.presentation?.backgroundEffect);
  renderLight();
  renderItem();
  drawDialogue();
  if (s.phase === "choice") {
    const importance = s.presentation?.choiceImportance || "normal";
    $("choice-list").dataset.importance = importance;
    $("choice-list").classList.remove("choice-confirming");
    $("choice-list").replaceChildren(...s.choices.map((choice, i) => {
      const b = document.createElement("button");
      b.textContent = plainText(choice.text);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (importance !== "important" || skip || preferences.reducedMotion) { choose(i); return; }
        $("choice-list").classList.add("choice-confirming");
        b.classList.add("choice-selected");
        later(() => choose(i), 240);
      });
      return b;
    }));
  }
  for (const action2 of ["auto", "skip"]) document.querySelector(`[data-action=${action2}]`).setAttribute("aria-pressed", String(action2 === "auto" ? auto : skip));
}
function renderMap() {
  setBackground("map", true);
  const names = labels("maps");
  const ru = preferences.language === "russian";
  $("map-title").textContent = names.town || "Town";
  const host = $("map-locations");
  host.replaceChildren();
  for (const name of ["Arcade", "Hardware_Store", "Telepathy_Tent"]) {
    const loc = config.locations[name];
    const b = document.createElement("button");
    b.className = "location-button";
    const visited = engine.state.visited.includes(name.toLowerCase());
    b.disabled = visited;
    b.textContent = (names[name.toLowerCase()] || name.replaceAll("_", " ")) + (visited ? " ✓" : "");
    const rect = loc.labelBounds;
    Object.assign(b.style, { left: `${rect[0]}px`, top: `${rect[1]}px`, width: `${Math.max(rect[2], 700)}px`, height: `${rect[3]}px` });
    b.addEventListener("click", () => visitLocation(name));
    host.append(b);
  }
  const done = engine.state.visited.filter((x) => ["arcade", "hardware_store", "telepathy_tent"].includes(x)).length;
  $("map-forest").hidden = done < 3;
  $("map-forest").textContent = ru ? "В лес" : "Forest";
}
function visitLocation(name) {
  if (flowchart.isOpen() || engine.state.phase !== "map") return;
  displayed = 0;
  lineSequence = -1;
  const key = name.toLowerCase();
  if (key === "forest") {
    mode = "story";
    handle(engine.visit("Forest", { script: "chapter_0/part_3_mothman/mothman_1", background: "forest_1_dusk", final: true }));
    return;
  }
  const base = `chapter_0/part_2_freetime/${key}`;
  mode = "story";
  handle(engine.visit(name, { script: base + "/first", background: key, repeatScript: "defaultmap/alreadyhere" }));
}
function save() {
  if (!engine?.state.script || !storyReady) {
    notify(preferences.language === 'russian' ? 'Сначала начни игру' : 'Start the chapter first'); return;
  }
  if (storyState.getAlternativeSession()) {
    notify(preferences.language === 'russian' ? 'Это временная альтернатива. Основное сохранение защищено.' : 'This is a temporary alternative. Your official save is protected.'); return;
  }
  try { syncStory(engine.snapshot()); notify(preferences.language === 'russian' ? 'Основная история сохранена' : 'Official story saved'); }
  catch (error) { storyError(error); }
}
function load(chapter = currentChapter) {
  if (!storyReady) { storyError(storyFailure); return; }
  if (storyState.getAlternativeSession()) exitAlternative({ restore: false });
  const selected = normalizeChapter(chapter), saved = storyState.getState();
  if (!saved.canon.progress[selected]) { notify(preferences.language === 'russian' ? 'Нет сохранения этой главы' : 'No save for this chapter'); return; }
  try {
    const data = saved.snapshots[selected] || replayCanonicalSnapshot(selected, saved.canon, null, replayResources());
    restoreGameSnapshot(selected, reconcileSnapshot(data, saved.canon));
  } catch (error) { storyError(error); }
}
function restoreGameSnapshot(selected, data, { publish = true } = {}) {
  if (data.language !== 'russian' || /Go-Kart|GO-KART|Gravity Falls|Reverse Falls|BUSTER/.test(data.text || '')) {
    const canon = sessionData().canon;
    const progress = { ...canon.progress, [selected]: { ...canon.progress[selected], language: 'russian' } };
    data = replayCanonicalSnapshot(selected, { ...canon, progress }, { ...data, language: 'russian' }, replayResources());
  }
  flowchart.close();
  currentChapter = selected;
  spokenSequence = -1;
  preferences.chapter = selected;
  preferences.language = chapterLanguage(selected, data.language);
  savePreferences();
  auto = false;
  skip = false;
  hidden = false;
  stopAudio("voice");
  stopAudio("sound");
  visible("chapter-picker", false);
  visible("history", false);
  visible("settings", false);
  uiText();
  setupEngine();
  lineSequence = -1;
  displayed = 0;
  previous = [];
  const wasSynchronizing = synchronizingStory;
  if (!publish) synchronizingStory = true;
  try { handle(engine.restore(data), { restoring: true }); }
  finally { synchronizingStory = wasSynchronizing; }
  if (data.phase === "credits") {
    if (selected >= 1) showEnding();
    else showCredits(false);
  }
}
// Portable files are transport only; StoryState remains the sole runtime authority.
let pendingImport = null, importReturnFocus = null, importReadGeneration = 0;
const portableCopy = () => preferences.language === 'russian' ? {
  failure: 'Не удалось загрузить сохранение. Текущий путь не был изменён.',
  exported: 'Основной путь сохранён в JSON.', imported: 'Сохранённый путь загружен. Контрольная точка создана.'
} : {
  failure: 'Could not import the save. Your current path was not changed.',
  exported: 'Your official path was exported as JSON.', imported: 'Saved path loaded. A recovery checkpoint was created.'
};
function exportCanonSave() {
  try {
    if (!storyReady) throw new Error('Story is unavailable');
    const portable = storyState.exportSave();
    const blob = new Blob([JSON.stringify(portable, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'reverse_falls_canon_save.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(portableCopy().exported);
    return portable;
  } catch (error) { storyError(error); return null; }
}
function closeImportDialog() {
  pendingImport = null;
  visible('flow-import-confirm', false);
  importReturnFocus?.focus();
  importReturnFocus = null;
}
async function selectCanonSave(file) {
  const generation = ++importReadGeneration;
  $('flow-import-error').textContent = '';
  if (!file) return;
  try {
    if (!storyReady || file.size > 16 * 1024 * 1024) throw new Error('Save file unavailable or too large');
    const text = await file.text();
    if (generation !== importReadGeneration) return;
    storyState.previewImport(text);
    pendingImport = text;
    importReturnFocus = document.activeElement;
    $('flow-import-confirm-error').textContent = '';
    visible('flow-import-confirm', true);
    $('flow-import-confirm-cancel').focus();
  } catch {
    if (generation === importReadGeneration) $('flow-import-error').textContent = portableCopy().failure;
  } finally { $('flow-import-file').value = ''; }
}
function prepareImportedStory(candidate) {
  // Rebuild omitted resume caches from the imported canon, never from local saves.
  for (const chapter of STORY_REGISTRY.chapterIds) {
    const progress = candidate.canon.progress[chapter];
    if (!progress || candidate.snapshots[chapter]) continue;
    const snapshot = replayCanonicalSnapshot(chapter, candidate.canon, null, replayResources());
    if (snapshot.script !== progress.sceneId || snapshot.phase !== progress.phase || snapshot.line !== progress.line) {
      throw new Error('Imported story cursor cannot be reproduced');
    }
    candidate.snapshots[chapter] = snapshot;
  }
  candidate.snapshots = boundSnapshotCache(candidate.snapshots, candidate.canon.currentChapter);
}
function commitCanonImport() {
  if (!pendingImport) return false;
  let data;
  try { data = storyState.importSave(pendingImport, { prepare: prepareImportedStory }); }
  catch {
    $('flow-import-confirm-error').textContent = portableCopy().failure;
    return false;
  }
  // Publication has succeeded. Rendering below cannot report a failed import.
  try {
    closeImportDialog();
    cancelEffects();
    syncAlternativeIndicator();
    refreshCampaignProjection();
    flowSignature = '';
    const snapshot = data.snapshots[data.canon.currentChapter];
    if (snapshot) restoreGameSnapshot(data.canon.currentChapter, snapshot, { publish: false });
    else {
      currentChapter = data.canon.currentChapter; preferences.chapter = currentChapter;
      setupEngine(); showMenu();
    }
    flowchart.open(currentChapter);
    flowchart.refresh();
    syncSpeechPause();
    notify(portableCopy().imported);
    return true;
  } catch (error) {
    setupEngine(); showMenu();
    notify(preferences.language === 'russian' ? 'Путь загружен. Откройте главу, чтобы продолжить.' : 'Path imported. Open the chapter to continue.');
    console.error('Imported story display failed:', error.message);
    return true;
  }
}
function flowSnapshot(chapter) {
  const data = sessionData();
  return data.snapshots[chapter] || null;
}
function canonMapSnapshot(chapter) {
  const data = storyState.getState();
  return canonicalFlowSnapshot(chapter, data.canon, data.snapshots);
}
function alternativeMapSnapshot(chapter) {
  const alternative = storyState.getAlternativeSession();
  return alternative ? canonicalFlowSnapshot(chapter, alternative.canon, alternative.snapshots) : null;
}
function nodeDecision(chapter, nodeId) {
  const selection = choiceForFlowNode(chapter, nodeId);
  if (!selection) return null;
  const definition = STORY_REGISTRY.choices.find(choice => choice.id === selection.choiceId);
  const ru = preferences.language === 'russian', graph = getFlowGraph(definition.chapterId);
  const found = new Set(flowProgress.chapters[definition.chapterId]?.nodes || []);
  const options = definition.options.map(option => {
    const node = graph.nodes.find(node => node.id === option.nodeId);
    const discovered = found.has(option.nodeId) || STORY_REGISTRY.graphs.some(graph => graph.nodes.some(candidate =>
      candidate.choiceId === definition.id && candidate.optionId === option.id &&
      flowProgress.chapters[graph.chapter]?.nodes.includes(candidate.nodeId)));
    return { id: option.id, label: node?.label[ru ? 'russian' : 'english'] || option.id, discovered };
  });
  const beforeChoice = STORY_REGISTRY.choices.slice(0, STORY_REGISTRY.choices.indexOf(definition));
  const requiresPrefix = !storyState.getChoice(selection.choiceId) && beforeChoice.some(choice => !storyState.getChoice(choice.id));
  return { ...selection, label: options.find(option => option.id === selection.optionId)?.label,
    currentOption: storyState.getChoice(selection.choiceId), requiresPrefix, options };
}
function canOpenDecision({ chapter, nodeId, choiceId, optionId }) {
  const decision = nodeDecision(chapter, nodeId);
  return !!decision && decision.choiceId === choiceId && decision.optionId === optionId &&
    decision.options.some(option => option.id === optionId);
}
function enterAlternative({ chapter, nodeId, choiceId, optionId }) {
  if (!storyReady || !canOpenDecision({ chapter, nodeId, choiceId, optionId })) return false;
  try {
    if (storyState.getAlternativeSession()) exitAlternative({ restore: false });
    const data = storyState.getState(), canon = JSON.parse(JSON.stringify(data.canon));
    canon.choices[choiceId] = optionId;
    // Build on detached copies first: a failed replay cannot change the running story.
    const snapshot = createCanonicalFlowJump({ chapter, nodeId, canon, snapshots: data.snapshots, ...replayResources(), language: chapterLanguage(chapter, preferences.language) });
    const candidate = rebuildSnapshotsForRewrite({ ...data, canon }, data, replayResources());
    const choices = Object.fromEntries(Object.entries(candidate.canon.choices).filter(([id]) => STORY_REGISTRY.choices.find(choice => choice.id === id).chapterId < chapter));
    Object.assign(choices, choicesFromSnapshot(snapshot), { [choiceId]: optionId });
    candidate.canon.choices = choices;
    for (const id of STORY_REGISTRY.chapterIds) if (id > chapter) { delete candidate.canon.progress[id]; delete candidate.snapshots[id]; }
    candidate.canon.currentChapter = chapter;
    candidate.canon.progress[chapter] = progressFromSnapshot(snapshot);
    candidate.snapshots[chapter] = reconcileSnapshot(snapshot, candidate.canon);
    candidate.snapshots = boundSnapshotCache(candidate.snapshots, chapter);
    storyState.createAlternativeSession({ canon: candidate.canon, snapshots: candidate.snapshots,
      origin: { chapter: currentChapter, mode, snapshot: engine?.state.script ? engine.snapshot() : null }, startNode: nodeId });
    restoreGameSnapshot(chapter, candidate.snapshots[chapter]);
    return true;
  } catch (error) {
    if (storyState.getAlternativeSession()) exitAlternative({ restore: false });
    storyError(error); return false;
  }
}
function exitAlternative({ restore = true, openMap = false } = {}) {
  const temporary = storyState.exitAlternative();
  if (!temporary) return;
  cancelEffects();
  syncAlternativeIndicator();
  refreshCampaignProjection();
  // Clearing a session must also detach its engine, including on menu/load/cancel paths.
  // Otherwise a later Save could publish an abandoned alternative as the official story.
  const origin = temporary.origin;
  const canon = storyState.getCanon();
  const snapshot = (chapterForSnapshot(origin?.snapshot) !== null ? origin?.snapshot : null) || storyState.getState().snapshots[canon.currentChapter];
  if (snapshot) restoreGameSnapshot(chapterForSnapshot(snapshot), reconcileSnapshot(snapshot, canon));
  else { setupEngine(); showMenu(); }
  if (restore && openMap) openFlowchart();
}
function rewriteStoryChoice({ chapter, nodeId, choiceId, optionId }) {
  if (!storyReady || !canOpenDecision({ chapter, nodeId, choiceId, optionId })) return false;
  if (storyState.getAlternativeSession()) exitAlternative({ restore: false });
  try {
    storyState.rewriteCanonFrom(choiceId, optionId, { prepare(candidate, old) {
      Object.assign(candidate, rebuildSnapshotsForRewrite(candidate, old, replayResources()));
      // A newly selected, previously unplayed option needs a real scene cursor too.
      if (!candidate.canon.progress[chapter] || !Object.hasOwn(old.canon.choices, choiceId)) {
        const snapshot = createCanonicalFlowJump({ chapter, nodeId, canon: candidate.canon, ...replayResources(), language: chapterLanguage(chapter, preferences.language) });
        // A confirmed jump into an unplayed choice establishes its complete prefix.
        // Replay uses existing official selections first, then first-option defaults.
        candidate.canon.choices = { ...choicesFromSnapshot(snapshot), ...candidate.canon.choices };
        candidate.canon.currentChapter = chapter;
        candidate.canon.progress[chapter] = progressFromSnapshot(snapshot);
        candidate.snapshots = boundSnapshotCache({ ...candidate.snapshots, [chapter]: reconcileSnapshot(snapshot, candidate.canon) }, chapter);
      }
    } });
    refreshCampaignProjection();
    const data = storyState.getState(), snapshot = data.snapshots[data.canon.currentChapter];
    if (snapshot) restoreGameSnapshot(data.canon.currentChapter, snapshot);
    else showMenu();
    openFlowchart();
    notify(preferences.language === 'russian' ? 'Основной путь изменён. Контрольная точка сохранена.' : 'Official path updated. A recovery checkpoint was saved.');
    return true;
  } catch (error) { storyError(error); return false; }
}
// Public legacy entry remains safe: it can only start a registered temporary branch.
function jumpToNode(chapter, nodeId) {
  const selection = choiceForFlowNode(chapter, nodeId);
  return selection ? enterAlternative({ chapter, nodeId, ...selection }) : false;
}
function showMenu() {
  if (storyState.getAlternativeSession()) exitAlternative({ restore: false });
  syncAlternativeIndicator();
  flowchart.close();
  cancelEffects();
  stopAudio("voice");
  stopAudio("sound");
  mode = "menu";
  auto = false;
  skip = false;
  hidden = false;
  visible("settings", false);
  visible("chapter-picker", false);
  visible("chapter-ending", false);
  visible("history", false);
  $("scene-item")?.setAttribute("hidden", "");
  $("scene-light")?.setAttribute("hidden", "");
  renderedBackground = "";
  render();
  playAudio("music", "reverse_falls_theme");
}
function showCredits(fromMenu = true) {
  mode = "credits";
  auto = false;
  skip = false;
  visible("settings", false);
  visible("chapter-ending", false);
  visible("credits-next", currentChapter === 0);
  const copied = config.ui.credits?.find((x) => x.name === "Text Box")?.components?.find((x) => x.m_text)?.m_text;
  const p = $("credits-copy");
  p.replaceChildren();
  if (currentChapter === 1) {
    const note = document.createElement("p");
    note.textContent = preferences.language === "russian" ? "Глава 1 «Следы в лесу» — авторское продолжение по сценарию и библии пользователя. Иллюстрации улик и новые фоны созданы для этой версии. Авторы материалов оригинальной игры:" : "Chapter 1: Tracks in the Forest is an original continuation based on the user's script and story bible. Clue illustrations and new backgrounds were created for this version. Original game art and audio credits:";
    p.append(note);
  }
  if (currentChapter === 2) {
    const note = document.createElement('p');
    note.textContent = preferences.language === 'russian' ? 'Глава 2 «Не тот монстр» — авторское продолжение по заданию пользователя. Новые фоны и временные дизайны существ подготовлены для этой версии. Голосовые приманки — независимые вымышленные голоса; полная озвучка пока не готова. Авторы материалов оригинальной игры:' : 'Chapter 2: The Wrong Monster is an original continuation based on the user’s specification. New backgrounds and provisional creature designs were prepared for this version. Spoken lures use independently designed fictional voices; full dialogue voice acting is pending. Original game art and audio credits:';
    p.append(note);
  }
  for (const name of ["Giddy_Fresh_Logo", "Helvest_Logo"]) {
    const im = new Image();
    im.src = asset(name);
    im.alt = name.replaceAll("_", " ");
    p.append(im);
  }
  const text = document.createElement("div");
  text.textContent = copied;
  p.append(text);
  render();
}
function back() {
  if (flowchart.isOpen()) return;
  if (!["story", "map"].includes(mode)) return;
  if (!previous.length) return;
  const snapshot = previous.pop();
  chapterAudio.stopSpeech();
  spokenSequence = -1;
  lineSequence = -1;
  displayed = 0;
  handle(engine.restore(snapshot), { restoring: true });
}
function action(name) {
  switch (name) {
    case "back":
      back();
      break;
    case "auto":
      auto = !auto;
      skip = false;
      render();
      break;
    case "skip":
      skip = !skip;
      auto = false;
      render();
      break;
    case "hide":
      hidden = !hidden;
      render();
      break;
    case "settings":
      visible("settings", $("settings").hidden);
      syncSpeechPause();
      break;
    case "fullscreen":
      if (document.fullscreenElement) document.exitFullscreen?.();
      else $("viewport").requestFullscreen?.();
      break;
    case "history":
      showHistory();
      break;
    case "flowchart":
      openFlowchart();
  }
}
function showHistory() {
  $("history-list").replaceChildren(...engine.state.history.map((x) => {
    const p = document.createElement("p");
    p.textContent = (x.speaker === "Narrator" ? "" : (labels("names")[String(x.speaker).toLowerCase()] || chapter1Art.cast?.[String(x.speaker).toLowerCase()]?.name?.russian || "Персонаж") + ": ") + plainText(x.text);
    return p;
  }));
  visible("history", true);
  syncSpeechPause();
  $("history-list").scrollTop = $("history-list").scrollHeight;
}
function tick(t) {
  if (engine && mode === "story" && !flowchart.isOpen() && $("settings").hidden && $("history").hidden) {
    if (preferences.speech && !skip && engine.state.phase === "dialogue" && t >= readyAt && spokenSequence !== engine.state.sequence) {
      spokenSequence = engine.state.sequence;
      const recording = voices.lines?.[voiceLineKey(engine.state.text, engine.state.speaker, preferences.language)];
      speechDeadline = t + (recording?.duration ? recording.duration * 1000 + 3000 : Math.min(45000, Math.max(6000, plainText(engine.state.text).length * 100)));
      chapterAudio.speak({ text: engine.state.text, speaker: engine.state.speaker, language: preferences.language, chapter: currentChapter, script: engine.state.script, sourceLine: engine.state.line - 1 });
    }
    if (chapterAudio.isSpeaking && t > speechDeadline) chapterAudio.stopSpeech();
    if (engine.state.phase === "dialogue" && displayed < textCount && t >= readyAt && t >= inlinePause) {
      const step = (t - lastTick) * preferences.speed / 1e3 * (skip ? 20 : 1);
      displayed = Math.min(textCount, displayed + step);
      const r = engine.reveal(Math.floor(displayed));
      for (const event of r.events) {
        if (event.type === "wait") inlinePause = Math.max(inlinePause, t + event.duration * 1e3);
        else applyEffect(event);
      }
      drawDialogue();
      renderCharacters();
    }
    if (displayed >= textCount && !finishedAt) finishedAt = t;
    if ((skip || auto) && (!chapterAudio.isSpeaking || skip) && displayed >= textCount && engine.state.phase !== "choice" && t >= Math.max(readyAt, skip ? 0 : diegeticUntil, finishedAt + (skip ? 50 : Math.max(900, textCount * 54)))) {
      next();
      frameStart = t;
    }
  }
  lastTick = t;
  requestAnimationFrame(tick);
}
$("start-button").addEventListener("click", () => start());
$("continue-button").addEventListener("click", () => load());
$("credits-button").addEventListener("click", () => showCredits(true));
$("quit-button").addEventListener("click", () => {
  stopAmbience();
  stopAudio("music");
  notify(preferences.language === "russian" ? "Игру можно закрыть вместе с этой вкладкой" : "You can close this browser tab");
});
$("credits-back").addEventListener("click", showMenu);
for (const b of document.querySelectorAll("[data-action]")) b.addEventListener("click", (e) => {
  e.stopPropagation();
  action(b.dataset.action);
});
for (const range of document.querySelectorAll("[data-volume]")) {
  range.value = preferences[range.dataset.volume];
  range.addEventListener("input", () => {
    preferences[range.dataset.volume] = Number(range.value);
    updateVolume();
  });
}
syncPresentationPreferences();
$("effects-quality").addEventListener("change", event => {
  preferences.effectsQuality = event.target.value;
  syncPresentationPreferences();
  if (preferences.effectsQuality === "low") stopAmbience();
  else if (engine?.state.presentation?.ambience) playAmbience(engine.state.presentation.ambience, { fade: .2 });
  renderBackgroundEffect();
  savePreferences();
});
$("reduced-motion").addEventListener("change", event => {
  preferences.reducedMotion = event.target.checked;
  syncPresentationPreferences();
  renderCamera(engine?.state.presentation?.camera, true);
  savePreferences();
});
$("text-speed").value = preferences.speed;
$("text-speed").addEventListener("input", (e) => {
  preferences.speed = Number(e.target.value);
  savePreferences();
});
$("settings-close").addEventListener("click", () => { visible("settings", false); syncSpeechPause(); });
$("save-button").addEventListener("click", save);
$("load-button").addEventListener("click", () => load());
$("restart-button").addEventListener("click", () => {
  visible("settings", false);
  start(currentChapter, { monster: currentChapter >= 1 ? engine.state.flags.monster : void 0 });
});
$("menu-button").addEventListener("click", showMenu);
$("history-close").addEventListener("click", () => { visible("history", false); syncSpeechPause(); });
$("map-forest").addEventListener("click", () => visitLocation("Forest"));
$("stage").addEventListener("click", (e) => {
  if (!e.target.closest("button,select,input,#settings,#history,#credits,#menu,#map,#chapter-picker,#chapter-ending,#flowchart")) next();
});
$("stage").addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (mode === "story" && !flowchart.isOpen()) action("settings");
});
document.addEventListener("keydown", (e) => {
  if (!$('flow-import-confirm').hidden) {
    if (e.code === 'Escape') { e.preventDefault(); closeImportDialog(); }
    if (e.code === 'Tab') {
      const first = $('flow-import-confirm-cancel'), last = $('flow-import-confirm-accept');
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    e.stopImmediatePropagation(); return;
  }
  if (flowchart.isOpen()) return;
  if (e.target.matches("input,select")) return;
  if (e.code === "KeyB") { e.preventDefault(); openFlowchart(); return; }
  if (e.target.closest("button") && ["Space", "Enter"].includes(e.code)) return;
  if (["Space", "Enter", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
    next();
  }
  if (e.code === "Escape") {
    if (!$("chapter-picker").hidden) visible("chapter-picker", false);
    else if (!$("history").hidden) visible("history", false);
    else if (mode === "story" || mode === "map") action("settings");
    syncSpeechPause();
  }
  if (e.code === "KeyH") action("hide");
  if (e.code === "KeyA") action("auto");
  if (e.code === "KeyF") action("fullscreen");
  if (e.code === "KeyL" && mode === "story") showHistory();
  if (e.code === "ArrowLeft") back();
  if (e.code === "ControlLeft" || e.code === "ControlRight") skip = true;
});
document.addEventListener("keyup", (e) => {
  if (e.code.startsWith("Control")) skip = false;
});
window.addEventListener("blur", () => {
  skip = false;
});
$("settings-quit").addEventListener("click", () => {
  stopAmbience();
  stopAudio("music");
  notify(preferences.language === "russian" ? "Игру можно закрыть вместе с этой вкладкой" : "You can close this browser tab");
});
$("save-quit-button").addEventListener("click", () => {
  save();
  showMenu();
});
$("text-color-select").value = preferences.textColor;
$("text-color-select").addEventListener("change", (event) => {
  preferences.textColor = event.target.value;
  savePreferences();
  drawDialogue();
});
$("speech-enabled").addEventListener("change", event => {
  stopAudio("voice");
  preferences.speech = event.target.checked;
  chapterAudio.setSpeechEnabled(preferences.speech);
  spokenSequence = -1;
  savePreferences();
});
document.addEventListener("pointerdown", () => {
  chapterAudio.unlock();
  ambienceAudio.unlock();
  if (mode === "menu") playAudio("music", "reverse_falls_theme");
}, { once: true });
function hasSave(chapter) {
  return storyReady && !!storyState.getCanon().progress[normalizeChapter(chapter)];
}
function syncSpeechPause() {
  if (flowchart.isOpen() || !$("settings").hidden || !$("history").hidden) {
    if (!speechPausedAt) speechPausedAt = performance.now();
    chapterAudio.pauseSpeech();
  } else {
    if (speechPausedAt) speechDeadline += performance.now() - speechPausedAt;
    speechPausedAt = 0;
    chapterAudio.resumeSpeech();
  }
}
function recordFlow(snapshot = engine?.state, force = false) {
  if (!snapshot?.script) return;
  const signature = JSON.stringify([snapshot.script, snapshot.phase, snapshot.flags, snapshot.visited]);
  if (!force && signature === flowSignature) return;
  flowSignature = signature;
  const nextProgress = observeFlow(flowProgress, snapshot);
  if (JSON.stringify(nextProgress) !== JSON.stringify(flowProgress)) {
    flowProgress = nextProgress;
    try { storyState.recordDiscovery(flowProgress); } catch (error) { storyError(error); }
  }
}
const flowchart = createFlowchart({
  getProgress: () => flowProgress,
  getSnapshot: flowSnapshot,
  getLanguage: () => preferences.language,
  getCanonState: () => storyState.getCanon(),
  getCanonSnapshot: canonMapSnapshot,
  getAlternativeSnapshot: alternativeMapSnapshot,
  getNodeDecision: nodeDecision,
  onAlternative: enterAlternative,
  onRewrite: rewriteStoryChoice,
  onClose: elapsed => {
    // Preserve reading/auto delays while the story is paused behind the map.
    readyAt += elapsed;
    if (finishedAt) finishedAt += elapsed;
    if (inlinePause) inlinePause += elapsed;
    if (engine && mode === "map") render();
    syncSpeechPause();
  }
});
$('flow-export-save').addEventListener('click', exportCanonSave);
$('flow-import-save').addEventListener('click', () => $('flow-import-file').click());
$('flow-import-file').addEventListener('change', event => selectCanonSave(event.target.files?.[0]));
$('flow-import-confirm-cancel').addEventListener('click', closeImportDialog);
$('flow-import-confirm-accept').addEventListener('click', commitCanonImport);
function openFlowchart() {
  recordFlow(engine?.state, true);
  for (const snapshot of Object.values(storyState.getState().snapshots)) recordFlow(snapshot, true);
  skip = false;
  flowchart.open(currentChapter);
  syncSpeechPause();
}
function chapterUI() {
  const ru = preferences.language === "russian";
  const texts = ru ? {
    "chapters-button": "Главы",
    "chapter-picker-title": "Выбери главу",
    "chapter-picker-close": "К меню",
    "chapter0-kicker": "По оригинальной игре",
    "chapter0-title": "Глава 0",
    "chapter0-description": "Первая встреча Гидеона и Пасифики, охота на монстра и загадочный синий свет.",
    "chapter0-languages": "Русский",
    "chapter0-start": "Начать главу 0",
    "chapter0-continue": "Продолжить",
    "chapter1-kicker": "Авторское продолжение",
    "chapter1-title": "Следы в лесу",
    "chapter1-description": "Первое расследование: пропавшие животные, странные следы и Дневник, который знает не всё.",
    "chapter1-languages": "Русский",
    "chapter1-start": "Начать главу 1",
    "chapter1-continue": "Продолжить",
    "prior-monster-label": "Вчерашняя охота",
    "ending-menu": "К выбору глав",
    "ending-replay": "Пройти заново",
    "ending-credits": "Авторы",
    "credits-next": "Начать главу 1"
  } : {
    "chapters-button": "Chapters",
    "chapter-picker-title": "Choose a chapter",
    "chapter-picker-close": "Back to menu",
    "chapter0-kicker": "From the original game",
    "chapter0-title": "Chapter 0",
    "chapter0-description": "Gideon meets Pacifica, a monster hunt goes wrong, and a mysterious blue light escapes.",
    "chapter0-languages": "Seven original languages",
    "chapter0-start": "Start chapter 0",
    "chapter0-continue": "Continue",
    "chapter1-kicker": "An original continuation",
    "chapter1-title": "Tracks in the Forest",
    "chapter1-description": "A first investigation: missing animals, strange tracks, and a journal that does not know everything.",
    "chapter1-languages": "English · Русский",
    "chapter1-start": "Start chapter 1",
    "chapter1-continue": "Continue",
    "prior-monster-label": "Yesterday's hunt",
    "ending-menu": "Choose a chapter",
    "ending-replay": "Play again",
    "ending-credits": "Credits",
    "credits-next": "Start chapter 1"
  };
  for (const [id, text] of Object.entries(texts)) $(id).textContent = text;
  $("speech-label").textContent = ru ? "Озвучивать диалоги" : "Spoken dialogue";
  const speechMode = chapterAudio.speechMode({ language: preferences.language, chapter: currentChapter, script: CHAPTERS[currentChapter].start });
  $("speech-note").textContent = speechMode === "pending" ? ru ? `Глава ${currentChapter}: полная озвучка пока не готова. Музыка и звуки включены.` : `Chapter ${currentChapter}: full voice acting is pending. Music and effects are available.` : speechMode === "recorded" ? ru ? "Готовая озвучка · глава 0" : "Prepared voices · chapter 0" : speechMode === "system" ? ru ? "Голос браузера для этого языка" : "Browser voice for this language" : ru ? "Озвучка недоступна" : "Speech is unavailable";
  const speechUnavailable = ["unavailable", "pending"].includes(speechMode);
  $("speech-enabled").disabled = speechUnavailable;
  $("speech-enabled").checked = preferences.speech && !speechUnavailable;
  visible("legacy-chapter1-note", ["reverse-falls-chapter1-save-v1", "reverse-falls-chapter1-v2-save-v1"].some(key => !!storage.get(key)) && !hasSave(1));
  $("legacy-chapter1-note").textContent = ru ? "Глава 1 переписана. Старый сейв сохранён отдельно; новую историю начни заново." : "Chapter 1 has been rewritten. Your old save is retained separately; start the new story afresh.";
  for (const id of ["flow-menu-button", "ending-flow", "credits-flow"]) $(id).textContent = ru ? "Карта решений" : "Choices map";
  const flowButton = document.querySelector('[data-action="flowchart"]');
  flowButton.title = ru ? "Карта решений (B)" : "Choices map (B)";
  flowButton.setAttribute("aria-label", flowButton.title);
  $("selected-chapter").textContent = (currentChapter >= 1 ? ru ? `Глава ${currentChapter} · ` : `Chapter ${currentChapter} · ` : "") + chapterTitle(currentChapter, preferences.language);
  visible("chapter0-continue", hasSave(0));
  visible("chapter1-continue", hasSave(1));
  const canon = storyState.getCanon();
  const unlocked = !!canon.progress[1]?.completed;
  $('chapter2-start').disabled = !unlocked;
  visible('chapter2-continue', hasSave(2));
  $('chapter2-kicker').textContent = ru ? 'Продолжение расследования' : 'The investigation continues';
  $('chapter2-title').textContent = ru ? 'Не тот монстр' : 'The Wrong Monster';
  $('chapter2-description').textContent = ru ? 'Два разных следа и пропавшие животные. Друзьям предстоит проверить свою версию и решить, кому можно доверять.' : 'Two different trails and missing animals. The friends must test their theory and decide whom they can trust.';
  $('chapter2-languages').textContent = 'Русский';
  $('chapter2-start').textContent = ru ? 'Начать главу 2' : 'Start chapter 2';
  $('chapter2-continue').textContent = ru ? 'Продолжить' : 'Continue';
  $('chapter2-unlock-note').textContent = unlocked ? (ru ? 'Продолжение использует ваш основной путь главы 1.' : 'Continues your official chapter 1 path.') : (ru ? 'Заверши главу 1 или импортируй свой сохранённый путь через карту решений.' : 'Complete chapter 1 or import your saved path through the choices map.');
  const unlockedThree = !!canon.progress[2]?.completed;
  $('chapter3-start').disabled = !unlockedThree;
  visible('chapter3-continue', hasSave(3));
  $('chapter3-kicker').textContent = ru ? 'Венди · начало новой истории' : 'Wendy · a new investigation';
  $('chapter3-title').textContent = chapterTitle(3, preferences.language);
  $('chapter3-description').textContent = ru ? 'Сдвинутые проходы старой лесопилки и девушка, которой явно есть что скрывать.' : 'Shifting passages at the old sawmill, and a girl who clearly has something to hide.';
  $('chapter3-languages').textContent = 'Русский';
  $('chapter3-start').textContent = ru ? 'Начать главу 3' : 'Start chapter 3';
  $('chapter3-continue').textContent = ru ? 'Продолжить' : 'Continue';
  $('chapter3-unlock-note').textContent = unlockedThree ? (ru ? 'Продолжает ваш основной путь глав 0–2.' : 'Continues your official path through chapters 0–2.') : (ru ? 'Заверши последнюю сцену главы 2. Сохранённый путь можно импортировать через карту решений.' : 'Finish the final scene of chapter 2. Import your saved path through the choices map.');
  const monsterNames = ru ? ["Оборотень", "Вендиго", "Вампир"] : ["Werewolf", "Wendigo", "Vampire"];
  [...$("prior-monster").options].forEach((o, i) => o.textContent = monsterNames[i]);
}
function openChapters() {
  showMenu();
  chapterUI();
  $("prior-monster").value = storyState.getChoice('ch0.creature') || 'Werewolf';
  $("prior-monster").disabled = !!storyState.getChoice('ch0.creature');
  $("prior-monster").title = preferences.language === 'russian' ? 'Прошлый выбор меняется через «Полный режим» карты решений.' : 'Change an earlier choice using Full mode on the choices map.';
  visible("chapter-picker", true);
  $("chapter-picker-close").focus();
}
function completeChapter() {
  const snapshot = engine.snapshot();
  recordFlow(snapshot, true);
  try { syncStory(snapshot); } catch (error) { storyError(error); return; }
  refreshCampaignProjection();
  if (currentChapter >= 1) showEnding();
  else showCredits(false);
}
function showEnding() {
  if (currentChapter === 3) { showChapterThreeEnding(); return; }
  if (currentChapter === 2) { showChapterTwoEnding(); return; }
  cancelEffects();
  mode = "ending";
  auto = false;
  skip = false;
  hidden = false;
  for (const channel of ["voice", "sound", "ambience"]) stopAudio(channel);
  visible("settings", false);
  visible("history", false);
  visible("chapter-picker", false);
  const ru = preferences.language === "russian", ending = ENDINGS[engine.state.flags.ending] || ENDINGS.Bold;
  $("ending-kicker").textContent = ru ? "Глава 1 завершена" : "Chapter 1 complete";
  $("ending-title").textContent = ending.title[ru ? "russian" : "english"];
  $("ending-description").textContent = ending.description[ru ? "russian" : "english"];
  const flags = engine.state.flags, details = [];
  const describe = (key, choices) => {
    if (choices[flags[key]]) details.push(choices[flags[key]]);
  };
  describe("monster", ru ? { Werewolf: "Версия: оборотень", Vampire: "Версия: вампир", Wendigo: "Версия: вендиго" } : { Werewolf: "Working theory: werewolf", Vampire: "Working theory: vampire", Wendigo: "Working theory: wendigo" });
  describe("reason", ru ? { Deflect: "Гидеон отшутился", Curiosity: "Гидеону нужны ответы", Openness: "Гидеон доверился Пасифике" } : { Deflect: "Gideon deflected", Curiosity: "Gideon wants answers", Openness: "Gideon opened up" });
  describe("tracks", ru ? { Bold: "Следы: идти дальше", Journal: "Следы: усомниться в Дневнике", Search: "Улика: кусок ткани" } : { Bold: "Tracks: press on", Journal: "Tracks: question the journal", Search: "Clue: cloth scrap" });
  describe("descent", ru ? { Pacifica: "Спуск: Пасифика первая", Gideon: "Спуск: Гидеон первый", Careful: "Спуск: безопасный обход" } : { Pacifica: "Descent: Pacifica first", Gideon: "Descent: Gideon first", Careful: "Descent: take the detour" });
  details.push(ru ? `Доверие: +${flags.pacifica_gideon_trust || 0}` : `Trust: +${flags.pacifica_gideon_trust || 0}`);
  $("ending-facts").replaceChildren(...details.map((text) => {
    const p = document.createElement("p");
    p.textContent = text;
    return p;
  }));
  const handoff = storyState.getAlternativeSession() ? null : chapter2Handoff(campaign);
  $('ending-next-chapter').textContent = ru ? 'Начать главу 2' : 'Start chapter 2';
  visible('ending-next-chapter', !storyState.getAlternativeSession() && !!storyState.getCanon().progress[1]?.completed);
  $("ending-next").textContent = ru ? 'Глава 2 «Не тот монстр» доступна. Решения и улики основной истории перейдут в продолжение.' : 'Chapter 2: The Wrong Monster is available. Your official decisions and clues carry into the continuation.';
  render();
}
function showChapterTwoEnding() {
  cancelEffects(); mode = 'ending'; auto = false; skip = false; hidden = false;
  for (const channel of ['voice','sound','ambience']) stopAudio(channel);
  for (const id of ['settings','history','chapter-picker']) visible(id, false);
  const ru = preferences.language === 'russian', code = engine.state.flags.creature_fate;
  const ending = CHAPTER2_ENDINGS[code];
  $('ending-kicker').textContent = ru ? 'Глава 2 завершена' : 'Chapter 2 complete';
  $('ending-title').textContent = ru ? 'Не тот монстр' : 'The Wrong Monster';
  $('ending-description').textContent = ending?.description[ru ? 'russian' : 'english'] || '';
  const labels = ru ? { LargeTracks:'Крупные следы', Journal:'Сравнить с Дневником', Perimeter:'Осмотреть периметр', Distract:'Отвлечь', Block:'Перекрыть проход', Protect:'Защитить вместе' } : { LargeTracks:'Large tracks', Journal:'Compare with the journal', Perimeter:'Inspect the perimeter', Distract:'Distract', Block:'Block the passage', Protect:'Protect together' };
  const rows = [labels[engine.state.flags.trail_focus], labels[engine.state.flags.threat_plan], ending?.title[ru ? 'russian' : 'english']].filter(Boolean);
  $('ending-facts').replaceChildren(...rows.map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
  $('ending-next').textContent = ru ? 'Решения главы сохранены в вашем основном пути. Символ пока остаётся неизвестным.' : 'Your chapter decisions are saved in your official story. The symbol remains unknown.';
  if (storyState.getAlternativeSession()) $('ending-next').textContent = ru ? 'Это альтернативный путь. Основная история сохранена отдельно.' : 'This is an alternative path. Your official story remains separate.';
  $('ending-next-chapter').textContent = ru ? 'Начать главу 3' : 'Start chapter 3';
  visible('ending-next-chapter', !storyState.getAlternativeSession() && !!storyState.getCanon().progress[2]?.completed);
  render();
}
function showChapterThreeEnding() {
  cancelEffects(); mode = 'ending'; auto = false; skip = false; hidden = false;
  for (const channel of ['voice','sound','ambience']) stopAudio(channel);
  for (const id of ['settings','history','chapter-picker']) visible(id, false);
  const ru = preferences.language === 'russian', flags = engine.state.flags;
  const ending = CHAPTER3_ENDINGS[flags.exit_plan];
  $('ending-kicker').textContent = ru ? 'Глава 3 завершена' : 'Chapter 3 complete';
  $('ending-title').textContent = chapterTitle(3, preferences.language);
  $('ending-description').textContent = ending?.description[ru ? 'russian' : 'english'] || '';
  const labels = ru ? { Direct:'Прямой вопрос', Bargain:'Предложение обмена', Wait:'Наблюдение', Mark:'Метки на пути', Listen:'Движение досок', CheckPlans:'Сравнение проходов' } : { Direct:'A direct question', Bargain:'A proposed trade', Wait:'Observation', Mark:'Path markings', Listen:'Moving boards', CheckPlans:'Comparing passages' };
  const rows = [labels[flags.wendy_approach], labels[flags.test_method], ending?.title[ru ? 'russian' : 'english']].filter(Boolean);
  $('ending-facts').replaceChildren(...rows.map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
  $('ending-next').textContent = storyState.getAlternativeSession() ? (ru ? 'Это альтернативный путь. Основная история сохранена отдельно.' : 'This is an alternative path. Your official story remains separate.') : (ru ? 'Предмет остался у Венди. История продолжится в главе 4; она пока не реализована.' : 'Wendy still has the object. The story continues in chapter 4, which is not implemented yet.');
  visible('ending-next-chapter', false);
  render();
}
$("chapters-button").addEventListener("click", openChapters);
$("chapter-picker-close").addEventListener("click", () => visible("chapter-picker", false));
$("chapter0-start").addEventListener("click", () => start(0));
$("chapter1-start").addEventListener("click", () => start(1, { monster: $("prior-monster").value }));
$("chapter0-continue").addEventListener("click", () => load(0));
$("chapter1-continue").addEventListener("click", () => load(1));
$('chapter2-start').addEventListener('click', () => start(2, {}));
$('chapter2-continue').addEventListener('click', () => load(2));
$('chapter3-start').addEventListener('click', () => start(3, {}));
$('chapter3-continue').addEventListener('click', () => load(3));
$('ending-next-chapter').addEventListener('click', () => start(currentChapter + 1, { language: chapterLanguage(currentChapter + 1, preferences.language) }));
$("ending-menu").addEventListener("click", openChapters);
$("ending-replay").addEventListener("click", () => start(currentChapter, { monster: engine.state.flags.monster }));
$("ending-credits").addEventListener("click", () => showCredits(false));
$("credits-next").addEventListener("click", openChapters);
for (const id of ["flow-menu-button", "ending-flow", "credits-flow"]) $(id).addEventListener("click", openFlowchart);
(async () => {
  preferences.language = chapterLanguage(currentChapter, preferences.language);
  const storyWarnings = initializeStory();
  $('alternative-exit')?.addEventListener('click', () => exitAlternative({ openMap: true }));
  await font.load();
  uiText();
  syncPresentationPreferences();
  paintMenu();
  setupEngine();
  visible("loading", false);
  showMenu();
  if (storyWarnings.length) {
    const note = document.createElement('p');
    note.id = 'story-state-notice'; note.className = 'story-state-notice';
    note.textContent = storyWarnings.join(' ');
    note.setAttribute('role', 'status');
    $('stage').append(note);
    if (storyReady) setTimeout(() => note.remove(), 14000);
  }
  requestAnimationFrame(tick);
})().catch((error) => {
  $("loading").textContent = "Не удалось загрузить игру. Проверьте, что архив полностью распакован и все файлы доступны.";
  console.error(error);
});
