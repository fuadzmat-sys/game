/** Actual built-game integration QA for Chapter 2. Run a local server first. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { getFlowGraph } from '../flowchart.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const supplied = read('tests/fixtures/chapter1-canon.json');
const origin = process.env.REVERSE_FALLS_TEST_URL || 'http://127.0.0.1:8780';
const shots = process.env.REVERSE_FALLS_SCREENSHOT_DIR || '/workspace/scratch';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const contexts = [], reports = [], audioPlayed = [];
async function rememberAudio(page) { audioPlayed.push(...await page.evaluate(() => window.__chapter2Audio)); }
async function newPage() {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); contexts.push(context);
 await context.addInitScript(() => {
  if (!localStorage.getItem('reverse-falls-preferences')) localStorage.setItem('reverse-falls-preferences', JSON.stringify({ chapter: 2, language: 'russian', reducedMotion: true }));
  window.__chapter2Audio = []; window.__chapter2Speech = 0;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__chapter2Audio.push(this.src); return play.call(this); };
  if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.__chapter2Speech++; };
 });
 const page = await context.newPage(), errors = [];
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
 await page.goto(origin); await page.waitForFunction(() => window.game && game.story.isInitialized());
 return { page, errors };
}
async function accelerate(page) {
 await page.evaluate(() => {
  if (window.__chapter2Accelerated) return;
  window.__chapter2Accelerated = true;
  const now = window.__chapter2RealNow || performance.now.bind(performance); window.__chapter2RealNow = now; let extra = 0;
  performance.now = () => now() + (extra += 10000);
 });
}
async function drive(page, stop = {}, picks = { 'chapter_2/two_tracks': 1, 'chapter_2/real_threat': 2, 'chapter_2/creature_question': 0 }) {
 await accelerate(page);
 return page.evaluate(async ({ stop, picks }) => {
  let steps = 0;
  const matches = () => {
   const state = game.engine.state;
   if (!Object.keys(stop).length) return state.phase === 'credits';
   return (!stop.script || state.script === stop.script) && (!stop.phase || state.phase === stop.phase)
    && (!stop.visible || state.chars[stop.visible]?.visible)
    && (!stop.expression || state.chars[stop.expression[0]]?.expression === stop.expression[1])
    && (!stop.item || state.item === stop.item) && (!stop.background || state.bg === stop.background)
    && (!stop.noActors || Object.values(state.chars).every(char => !char.visible));
  };
  while (!matches() && game.engine.state.phase !== 'credits' && steps++ < 4000) {
   const previousScript = game.engine.state.script;
   if (game.engine.state.phase === 'choice') {
    const pick = picks[game.engine.state.script];
    if (pick === undefined) throw new Error('Unexpected choice ' + game.engine.state.script);
    game.choose(pick);
   } else game.next();
   // Preserve the real ordering of scene-entry dissolves and queued character events.
   // The accelerated dialogue clock must not carry an old scene's delayed hide into a new reveal.
   if (game.engine.state.script !== previousScript) await new Promise(resolve => setTimeout(resolve, 1650));
  }
  if (!matches()) throw new Error('Chapter 2 did not reach requested checkpoint: ' + JSON.stringify({ stop, steps, script: game.engine.state.script, phase: game.engine.state.phase }));
  return { script: game.engine.state.script, phase: game.engine.state.phase, line: game.engine.state.line, flags: game.engine.state.flags, inventory: game.engine.state.inventory };
 }, { stop, picks });
}
async function importFile(page, text) {
 await page.evaluate(() => game.openFlowchart());
 const chooser = page.waitForEvent('filechooser');
 await page.locator('#flow-import-save').click();
 await (await chooser).setFiles({ name: 'reverse_falls_canon_save.json', mimeType: 'application/json', buffer: Buffer.from(text) });
 await page.waitForFunction(() => !document.querySelector('#flow-import-confirm').hidden);
 await page.locator('#flow-import-confirm-accept').click();
 await page.waitForFunction(() => document.querySelector('#flow-import-confirm').hidden);
}
async function checkpoint(page, name, { actors = [] } = {}) {
 // Restore the exact real snapshot with the normal clock for readable visual QA.
 // The accelerated traversal clock deliberately skips typewriter delays, so it must not
 // leave RAF timestamps incomparable to dialogue readyAt when taking screenshots.
 await page.evaluate(() => {
  if (window.__chapter2RealNow) performance.now = window.__chapter2RealNow;
  window.__chapter2Accelerated = false; game.save(); game.load(2);
  if (game.engine.state.phase === 'dialogue') game.next();
 });
 await page.waitForTimeout(1650);
 await page.waitForFunction(() => {
  const bg = document.querySelector('#background');
  const active = [...document.querySelectorAll('#characters .character')].filter(node => Number(node.style.opacity) > 0);
  return bg?.complete && bg.naturalWidth > 0 && active.every(node => [...node.querySelectorAll('img')].filter(image => !image.hidden).every(image => image.complete && image.naturalWidth > 0));
 });
 const imageState = await page.evaluate(() => ({
  background: document.querySelector('#background').getAttribute('src'),
  actors: [...document.querySelectorAll('#characters .character')].filter(node => Number(node.style.opacity) > 0).map(node => ({ id: node.dataset.character, sources: [...node.querySelectorAll('img')].filter(image => !image.hidden).map(image => image.getAttribute('src')) }))
 }));
 for (const id of actors) assert.ok(imageState.actors.some(actor => actor.id === id), name + ' renders ' + id + ': ' + JSON.stringify(imageState));
 await page.screenshot({ path: shots + '/chapter2-' + name + '.png' });
 return imageState;
}
async function inspect(page, node) {
 await page.evaluate(() => game.openFlowchart()); await page.locator('#flow-chapter2').click(); await page.locator('#flow-full').click();
 await page.locator(`[data-node="${node}"]`).dispatchEvent('click');
}
try {
 const fresh = await newPage(), { page, errors } = fresh;
 await page.evaluate(() => game.openChapters());
 assert.equal(await page.locator('#chapter2-start').isDisabled(), true);
 const empty = await page.evaluate(() => game.story.getCanon());
 assert.equal(await page.evaluate(() => game.startChapter(2, { language: 'russian' })), false);
 assert.deepEqual(await page.evaluate(() => game.story.getCanon()), empty);
 reports.push('Fresh Chapter 2 is gated by actual Chapter 1 completion and cannot invent a prior canon');
 await page.locator('#chapter-picker-close').click();
 await importFile(page, supplied);
 assert.equal(await page.evaluate(() => game.story.getChoice('ch0.creature')), 'Wendigo');
 assert.equal(await page.evaluate(() => game.mode), 'ending');
 assert.equal(await page.locator('#ending-next-chapter').isVisible(), true);
 await page.locator('#flow-close').click();
 await page.locator('#ending-next-chapter').click();
 assert.equal(await page.evaluate(() => game.chapter), 2);
 const earlier = await page.evaluate(() => ({ choices: game.story.getCanon().choices, progress: { 0: game.story.getCanon().progress[0], 1: game.story.getCanon().progress[1] } }));
 const initial = await page.evaluate(() => ({ flags: game.engine.state.flags, inventory: game.engine.state.inventory }));
 assert.equal(initial.flags.monster, 'Wendigo'); assert.equal(initial.flags.reason, 'Openness'); assert.equal(initial.flags.tracks, 'Journal'); assert.equal(initial.flags.ending, 'Cautious');
 assert.equal(initial.flags.pacifica_gideon_trust, 2); assert.equal(initial.flags.journal_doubt, 1); assert.deepEqual(initial.inventory, ['journal_3']);
 await checkpoint(page, 'cafe', { actors: ['gideon', 'pacifica'] });
 reports.push('Actual import and Chapter 1 ending button enter Chapter 2 with the supplied real choices, trust, doubt and existing journal');
 await drive(page, { script: 'chapter_2/two_tracks', phase: 'choice' });
 await page.evaluate(() => game.save());
 const beforeChoice = await page.evaluate(() => game.engine.snapshot());
 await rememberAudio(page); await page.reload(); await page.waitForFunction(() => window.game && game.story.isInitialized()); await page.evaluate(() => game.load(2));
 assert.deepEqual(await page.evaluate(() => game.engine.snapshot()), beforeChoice);
 await accelerate(page); await page.evaluate(() => game.choose(1));
 assert.equal(await page.evaluate(() => game.story.getChoice('ch2.trail_focus')), 'Journal');
 await page.evaluate(() => game.save()); const afterChoice = await page.evaluate(() => game.engine.snapshot());
 await rememberAudio(page); await page.reload(); await page.waitForFunction(() => window.game && game.story.isInitialized()); await page.evaluate(() => game.load(2));
 assert.deepEqual(await page.evaluate(() => game.engine.snapshot()), afterChoice);
 reports.push('Real browser Save and reload preserve the exact cursor, presentation and choice both before and after the first Chapter 2 decision');
 await drive(page, { script: 'chapter_2/watch_hut' }); const hut = await checkpoint(page, 'hut'); assert.match(hut.background, /watch-hut-interior/);
 await drive(page, { script: 'chapter_2/rock_hollow', visible: 'creature' }); const hollow = await checkpoint(page, 'hollow', { actors: ['creature'] }); assert.match(hollow.background, /rock-hollow/);
 await drive(page, { script: 'chapter_2/hidden_shelter' }); const shelter = await checkpoint(page, 'shelter', { actors: ['creature', 'dog'] }); assert.match(shelter.background, /hidden-shelter/);
 await drive(page, { script: 'chapter_2/real_picture', background: 'ch2_drainage_entrance' }); const entrance = await checkpoint(page, 'drainage-entrance'); assert.match(entrance.background, /drainage-entrance/);
 await drive(page, { script: 'chapter_2/real_threat', expression: ['predator', 'eyes'] }); const eyes = await checkpoint(page, 'predator-eyes', { actors: ['predator'] }); assert.ok(eyes.actors.find(actor => actor.id === 'predator').sources.every(path => /predator-eyes/.test(path)), 'First predator reveal shows only its dedicated eyes cutout');
 await drive(page, { script: 'chapter_2/real_threat', expression: ['predator', 'crouched'] }); const tunnel = await checkpoint(page, 'tunnel', { actors: ['predator'] }); assert.match(tunnel.background, /drainage-tunnel/);
 await drive(page, { script: 'chapter_2/water_climax' });
 await page.evaluate(() => game.save()); const climax = await page.evaluate(() => game.engine.snapshot());
 await rememberAudio(page); await page.reload(); await page.waitForFunction(() => window.game && game.story.isInitialized()); await page.evaluate(() => game.load(2));
 assert.deepEqual(await page.evaluate(() => game.engine.snapshot()), climax);
 await checkpoint(page, 'climax', { actors: ['predator'] });
 reports.push('All new backgrounds and Creature/Predator sprites load in the built game; the water-climax save restores correctly');
 await drive(page, { script: 'chapter_2/symbol', item: 'symbol_ch2_unknown_provisional', noActors: true });
 await checkpoint(page, 'symbol');
 assert.equal(await page.locator('#scene-item').getAttribute('data-item'), 'symbol_ch2_unknown_provisional');
 assert.equal(await page.locator('#story-blue-glow').count(), 0);
 await drive(page);
 assert.equal(await page.evaluate(() => game.mode), 'ending'); assert.equal(await page.locator('#ending-next-chapter').isVisible(), true);
 assert.match(await page.locator('#ending-next-chapter').textContent(), /3/);
 const completed = await page.evaluate(() => ({ canon: game.story.getCanon(), summary: game.story.getCanonSummary(), snapshot: game.engine.snapshot(), valid: game.story.validate().valid, speech: window.__chapter2Speech }));
 assert.equal(completed.valid, true); assert.equal(completed.canon.progress[2].completed, true);
 assert.equal(completed.canon.choices['ch2.trail_focus'], 'Journal'); assert.equal(completed.canon.choices['ch2.threat_plan'], 'Protect'); assert.equal(completed.canon.choices['ch2.creature_fate'], 'Help');
 assert.equal(completed.summary.relationships.pacifica_gideon, 3); assert.equal(completed.summary.relationships.creature_trust, 1);
 assert.equal(completed.snapshot.flags.journal_doubt, 1); assert.deepEqual(completed.snapshot.inventory, ['journal_3']);
 assert.equal(completed.speech, 0);
 await rememberAudio(page);
 for (const name of ['ch2_mimic_buster', 'ch2_mimic_pacifica', 'ch2_mimic_pacifica_here', 'ch2_mimic_gideon']) assert.ok(audioPlayed.some(path => path.includes('/' + name + '.mp3')), 'Actual authored SFX plays ' + name);
 assert.deepEqual(Object.fromEntries(Object.entries(completed.canon.choices).filter(([id]) => !id.startsWith('ch2.'))), earlier.choices);
 assert.deepEqual({0: completed.canon.progress[0], 1: completed.canon.progress[1]}, earlier.progress);
 const visited = new Set(completed.snapshot.history.map(row => row.script));
 for (const scene of ['start','two_tracks','watch_hut','rock_hollow','hidden_shelter','real_picture','real_threat','creature_question','symbol']) assert.ok(visited.has('chapter_2/' + scene), 'Actual play includes ' + scene);
 reports.push('Actual RU play reaches all nine scenes, exactly three choices and the symbol ending; only sourced Chapter 2 effects change, without browser TTS');
 await inspect(page, 'plan_protect');
 const graphIds = await page.locator('#flow-nodes [data-node]').evaluateAll(nodes => nodes.map(node => node.dataset.node));
 assert.deepEqual(graphIds.sort(), getFlowGraph(2).nodes.map(node => node.id).sort());
 assert.equal(await page.locator('#flow-chapter3').count(), 1);
 assert.equal(await page.locator('#flow-chapter4').count(), 0);
 await page.screenshot({ path: shots + '/chapter2-map.png' });
 await page.locator('#flow-true-story').click();
 const timeline = await page.locator('#flow-nodes [data-node]').evaluateAll(nodes => nodes.map(node => node.dataset.node));
 for (const id of ['0:wendigo','1:will','2:start','2:trail_journal','2:plan_protect','2:fate_help','2:symbol']) assert.ok(timeline.includes(id), id);
 assert.equal(timeline.includes('2:plan_block'), false);
 const edges = await page.locator('#flow-edges [data-edge]').evaluateAll(nodes => nodes.map(node => node.dataset.edge));
 assert.ok(edges.some(id => id.includes('1:will') && id.includes('2:start')));
 await page.locator('[data-node="2:symbol"]').dispatchEvent('click');
 assert.equal(await page.locator('#flow-alternative').isVisible(), false); assert.equal(await page.locator('#flow-rewrite').isVisible(), false);
 reports.push('Chapter 2 full map exposes all 19 nodes; True Story connects chapters 0–2, shows the real path and remains read only');
 const official = await page.evaluate(() => game.story.getCanon());
 await inspect(page, 'plan_block'); await page.locator('#flow-alternative').click();
 await page.waitForFunction(() => game.alternative && document.querySelector('#flowchart').hidden);
 assert.equal(await page.evaluate(() => game.engine.state.flags.threat_plan), 'Block');
 await page.evaluate(() => game.save()); assert.deepEqual(await page.evaluate(() => game.story.getCanon()), official);
 await drive(page, {}, { 'chapter_2/creature_question': 1 });
 assert.equal(await page.evaluate(() => game.alternative.canon.choices['ch2.creature_fate']), 'Expel');
 assert.deepEqual(await page.evaluate(() => game.story.getCanon()), official);
 await page.locator('#alternative-exit').click();
 assert.deepEqual(await page.evaluate(() => game.story.getCanon()), official);
 reports.push('A real Chapter 2 alternative can change plan and ending, finish and save without leaking into the official history');
 await inspect(page, 'plan_block'); await page.locator('#flow-rewrite').click(); await page.locator('#flow-confirm-accept').click();
 await page.waitForFunction(() => game.story.getChoice('ch2.threat_plan') === 'Block');
 assert.equal(await page.evaluate(() => game.story.getRelationship('pacifica_gideon')), 2);
 assert.equal(await page.evaluate(() => game.story.getRelationship('creature_trust')), 1);
 assert.equal(await page.evaluate(() => game.story.characterKnows('gideon', 'ch2_predator_reacts_to_motion')), true);
 const rewritten = await page.evaluate(() => game.story.getCanon());
 const downloading = page.waitForEvent('download'); await page.locator('#flow-export-save').click(); const download = await downloading;
 const exported = fs.readFileSync(await download.path(), 'utf8'); assert.deepEqual(JSON.parse(exported).canon, rewritten);
 const imported = await newPage(); await importFile(imported.page, exported);
 assert.deepEqual(await imported.page.evaluate(() => game.story.getCanon()), rewritten);
 await imported.page.reload(); await imported.page.waitForFunction(() => window.game && game.story.isInitialized());
 assert.deepEqual(await imported.page.evaluate(() => game.story.getCanon()), rewritten); assert.deepEqual(imported.errors, []);
 reports.push('Confirmed Chapter 2 rewrite recomputes trust and knowledge; the exported official canon imports and reloads unchanged in another browser context');
 await rememberAudio(page); await page.reload(); await page.waitForFunction(() => window.game && game.story.isInitialized()); await page.evaluate(() => game.load(2));
 assert.equal(await page.evaluate(() => game.mode), 'ending'); assert.equal(await page.evaluate(() => game.story.validate().valid), true);
 assert.deepEqual(errors, []);
 const english = await newPage(); await importFile(english.page, supplied); await english.page.locator('#flow-close').click();
 await english.page.evaluate(() => game.startChapter(2, { language: 'english' })); await drive(english.page);
 assert.equal(await english.page.evaluate(() => game.engine.state.language), 'russian');
 assert.equal(await english.page.evaluate(() => game.engine.state.phase), 'credits');
 assert.equal(await english.page.evaluate(() => window.__chapter2Audio.some(path => /ch2_mimic_.*\.mp3/.test(path))), true);
 assert.equal(await english.page.evaluate(() => window.__chapter2Speech), 0); assert.deepEqual(english.errors, []);
 reports.push('An old English language preference starts Russian playback, including Russian lure recordings, without browser TTS');
 console.log(JSON.stringify({ checks: reports.length, reports, errors: [] }, null, 2));
} finally { for (const context of contexts) await context.close(); await browser.close(); }
