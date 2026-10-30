/** Built-game Chapter 3 QA using the user's unmodified portable path. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { getFlowGraph } from '../flowchart.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const suppliedBytes = fs.readFileSync(new URL('../выборы.json', import.meta.url));
const supplied = JSON.parse(suppliedBytes);
const earlierChoices = supplied.canon.choices;
const origin = process.env.REVERSE_FALLS_TEST_URL || 'http://127.0.0.1:8780';
const shots = process.env.REVERSE_FALLS_SCREENSHOT_DIR || '/workspace/scratch';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const contexts = [], reports = [];
const canonicalPicks = { 'chapter_3/first_talk': 1, 'chapter_3/waymarks': 1, 'chapter_3/crossing': 2 };
async function newPage() {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); contexts.push(context);
 await context.addInitScript(() => {
  if (!localStorage.getItem('reverse-falls-preferences')) localStorage.setItem('reverse-falls-preferences', JSON.stringify({ chapter: 3, language: 'russian', reducedMotion: true, speech: true }));
  window.__chapter3Speech = 0; window.__chapter3Audio = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__chapter3Audio.push(this.src); return play.call(this); };
  if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.__chapter3Speech++; };
 });
 const page = await context.newPage(), errors = [];
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
 await page.goto(origin); await page.waitForFunction(() => window.game && game.story.isInitialized());
 return { page, errors };
}
async function importFile(page, bytes) {
 await page.evaluate(() => game.openFlowchart());
 const chooser = page.waitForEvent('filechooser'); await page.locator('#flow-import-save').click();
 await (await chooser).setFiles({ name: 'выборы.json', mimeType: 'application/json', buffer: Buffer.from(bytes) });
 await page.waitForFunction(() => !document.querySelector('#flow-import-confirm').hidden);
 await page.locator('#flow-import-confirm-accept').click();
 await page.waitForFunction(() => document.querySelector('#flow-import-confirm').hidden);
}
async function accelerate(page) {
 await page.evaluate(() => {
  if (window.__chapter3Accelerated) return;
  window.__chapter3Accelerated = true;
  const now = window.__chapter3RealNow || performance.now.bind(performance); window.__chapter3RealNow = now; let extra = 0;
  performance.now = () => now() + (extra += 10000);
 });
}
async function drive(page, stop = {}, picks = canonicalPicks) {
 await accelerate(page);
 return page.evaluate(async ({ stop, picks }) => {
  let steps = 0, decisions = 0;
  const matches = () => {
   const s = game.engine.state;
   if (!Object.keys(stop).length) return s.phase === 'credits';
   return (!stop.script || s.script === stop.script) && (!stop.phase || s.phase === stop.phase)
    && (!stop.visible || s.chars[stop.visible]?.visible) && (!stop.item || s.item === stop.item);
  };
  while (!matches() && game.engine.state.phase !== 'credits' && steps++ < 5000) {
   const previousScript = game.engine.state.script;
   if (game.engine.state.phase === 'choice') {
    const pick = picks[game.engine.state.script];
    if (pick === undefined) throw new Error('Unexpected choice: ' + game.engine.state.script);
    game.choose(pick); decisions++;
   } else game.next();
   if (game.engine.state.script !== previousScript) await new Promise(resolve => setTimeout(resolve, 1650));
  }
  if (!matches()) throw new Error('Unreached Chapter 3 checkpoint: ' + JSON.stringify({ stop, steps, script: game.engine.state.script, phase: game.engine.state.phase }));
  return { steps, decisions, script: game.engine.state.script, phase: game.engine.state.phase };
 }, { stop, picks });
}
async function checkpoint(page, name, { actors = [], item = null } = {}) {
 await page.evaluate(() => {
  if (window.__chapter3RealNow) performance.now = window.__chapter3RealNow;
  window.__chapter3Accelerated = false; game.save(); game.load(3);
  if (game.engine.state.phase === 'dialogue') game.next();
 });
 await page.waitForTimeout(1650);
 await page.waitForFunction(() => {
  const bg = document.querySelector('#background');
  const actors = [...document.querySelectorAll('#characters .character')].filter(node => Number(node.style.opacity) > 0);
  const item = document.querySelector('#scene-item');
  return bg?.complete && bg.naturalWidth > 0 && actors.every(node => [...node.querySelectorAll('img')].filter(image => !image.hidden).every(image => image.complete && image.naturalWidth > 0))
   && (!item || item.hidden || item.complete && item.naturalWidth > 0);
 });
 const visible = await page.evaluate(() => ({
  background: document.querySelector('#background').getAttribute('src'),
  actors: [...document.querySelectorAll('#characters .character')].filter(node => Number(node.style.opacity) > 0).map(node => node.dataset.character),
  item: document.querySelector('#scene-item')?.hidden ? null : document.querySelector('#scene-item')?.getAttribute('src')
 }));
 for (const id of actors) assert.ok(visible.actors.includes(id), name + ' renders ' + id + ': ' + JSON.stringify(visible));
 if (item) assert.match(visible.item || '', item);
 await page.screenshot({ path: shots + '/chapter3-' + name + '.png' });
 return visible;
}
async function inspect(page, node) {
 await page.evaluate(() => game.openFlowchart()); await page.locator('#flow-chapter3').click(); await page.locator('#flow-full').click();
 await page.locator(`[data-node="${node}"]`).dispatchEvent('click');
}
async function downloadSave(page) {
 const downloading = page.waitForEvent('download'); await page.locator('#flow-export-save').click();
 return fs.readFileSync(await (await downloading).path(), 'utf8');
}
try {
 const { page, errors } = await newPage();
 await page.evaluate(() => game.openChapters());
 assert.equal(await page.locator('#chapter3-start').isDisabled(), true);
 const empty = await page.evaluate(() => game.story.getCanon());
 assert.equal(await page.evaluate(() => game.startChapter(3, { language: 'russian' })), false);
 assert.deepEqual(await page.evaluate(() => game.story.getCanon()), empty);
 await page.locator('#chapter-picker-close').click();
 await importFile(page, suppliedBytes);
 assert.deepEqual(await page.evaluate(() => game.story.getCanon()), supplied.canon, 'Import must preserve the unfinished symbol cursor as well as every choice/effect');
 await page.locator('#flow-close').click(); await page.evaluate(() => game.openChapters());
 assert.equal(await page.locator('#chapter3-start').isDisabled(), true);
 await page.locator('#chapter-picker-close').click();
 await page.evaluate(() => game.load(2));
 assert.equal(await page.evaluate(() => game.engine.state.script), 'chapter_2/symbol');
 assert.equal(await page.evaluate(() => game.story.getCanon().progress[2].completed), false);
 await drive(page);
 assert.equal(await page.evaluate(() => game.story.getCanon().progress[2].completed), true);
 assert.deepEqual(await page.evaluate(() => game.story.getCanon().choices), earlierChoices);
 await page.evaluate(() => game.openChapters()); assert.equal(await page.locator('#chapter3-start').isDisabled(), false);
 await page.locator('#chapter3-start').click();
 assert.equal(await page.evaluate(() => game.chapter), 3);
 const priorProgress = await page.evaluate(() => Object.fromEntries(Object.entries(game.story.getCanon().progress).filter(([id]) => id !== '3')));
 const initial = await page.evaluate(() => ({ flags: game.engine.state.flags, inventory: game.engine.state.inventory, canon: game.story.getCanon() }));
 assert.deepEqual(initial.canon.choices, earlierChoices);
 for (const [key, value] of Object.entries({ monster: 'Wendigo', reason: 'Openness', tracks: 'Bold', ending: 'Cautious', trail_focus: 'Journal', threat_plan: 'Protect', creature_fate: 'Help', pacifica_gideon_trust: 3, creature_trust: 1 })) assert.equal(initial.flags[key], value, key);
 assert.deepEqual(initial.inventory, ['journal_3']);
 reports.push('The real выборы.json imports unchanged; unfinished Chapter 2 stays locked until its actual symbol ending, then Chapter 3 starts with all eight choices, trust3 and no invented cloth clue');

 await drive(page, { script: 'chapter_3/first_talk', visible: 'wendy' });
 const intro = await checkpoint(page, 'wendy-introduction', { actors: ['pacifica', 'gideon', 'wendy'] });
 assert.match(intro.background, /lumber-yard/);
 await drive(page, { script: 'chapter_3/first_talk', phase: 'choice' });
 await page.evaluate(() => game.save()); const beforeChoice = await page.evaluate(() => game.engine.snapshot());
 await page.reload(); await page.waitForFunction(() => window.game && game.story.isInitialized()); await page.evaluate(() => game.load(3));
 assert.deepEqual(await page.evaluate(() => game.engine.snapshot()), beforeChoice);
 await accelerate(page); await page.evaluate(() => game.choose(1));
 assert.equal(await page.evaluate(() => game.story.getChoice('ch3.wendy_approach')), 'Bargain');
 await page.evaluate(() => game.save()); const afterChoice = await page.evaluate(() => game.engine.snapshot());
 await page.reload(); await page.waitForFunction(() => window.game && game.story.isInitialized()); await page.evaluate(() => game.load(3));
 assert.deepEqual(await page.evaluate(() => game.engine.snapshot()), afterChoice);
 reports.push('Wendy and both existing protagonists render in the new yard; real save/reload preserves the exact Chapter 3 cursor and presentation before and after its first decision');

 await drive(page, { script: 'chapter_3/cutting_floor' });
 const floor = await checkpoint(page, 'cutting-floor', { actors: ['pacifica', 'gideon', 'wendy'] }); assert.match(floor.background, /cutting-floor/);
 await drive(page, { script: 'chapter_3/bag', item: 'ch3_wooden_weight' });
 await checkpoint(page, 'object-reveal', { actors: ['pacifica', 'gideon', 'wendy'], item: /wooden-weight/ });
 await drive(page, { script: 'chapter_3/night_gate' });
 await checkpoint(page, 'night-gate', { actors: ['pacifica', 'gideon', 'wendy'] });
 await drive(page);
 const completed = await page.evaluate(() => ({ canon: game.story.getCanon(), summary: game.story.getCanonSummary(), snapshot: game.engine.snapshot(), valid: game.story.validate().valid, speech: window.__chapter3Speech, audio: window.__chapter3Audio }));
 assert.equal(completed.valid, true); assert.equal(completed.snapshot.phase, 'credits'); assert.equal(completed.snapshot.script, 'chapter_3/night_gate');
 assert.equal(completed.canon.progress[3].completed, true); assert.equal(await page.evaluate(() => game.mode), 'ending');
 assert.deepEqual(Object.fromEntries(Object.entries(completed.canon.choices).filter(([id]) => !id.startsWith('ch3.'))), earlierChoices);
 assert.deepEqual(Object.fromEntries(Object.entries(completed.canon.progress).filter(([id]) => id !== '3')), priorProgress);
 assert.deepEqual(Object.fromEntries(Object.entries(completed.canon.choices).filter(([id]) => id.startsWith('ch3.'))), { 'ch3.wendy_approach': 'Bargain', 'ch3.test_method': 'Listen', 'ch3.exit_plan': 'SecureBag' });
 assert.equal(completed.summary.relationships.pacifica_gideon, 3); assert.equal(completed.summary.relationships.creature_trust, 1);
 assert.equal(completed.summary.relationships.wendy_respect, 1); assert.equal(completed.canon.derived.quests.wendy_forest_object.value, 'unresolved');
 assert.equal(completed.canon.derived.flags.ch3_object_secured.value, true); assert.deepEqual(completed.snapshot.inventory, ['journal_3']);
 assert.ok(!Object.keys(completed.canon.derived.flags).some(key => /wendy.*(?:ally|friend)|(?:ally|friend).*wendy/.test(key)));
 assert.equal(completed.speech, 0); assert.ok(!completed.audio.some(path => /assets\/voices\//.test(path)));
 const visited = new Set(completed.snapshot.history.map(row => row.script));
 for (const scene of ['start', 'yard', 'first_talk', 'waymarks', 'cutting_floor', 'service_walk', 'bag', 'crossing', 'night_gate']) assert.ok(visited.has('chapter_3/' + scene), 'Actual play visits ' + scene);
 reports.push('Actual nine-scene play renders both new locations and the revealed item, answers three decisions and ends with the object quest unresolved, Wendy not an ally, earlier choices intact and no synthetic dialogue fallback');

 await inspect(page, 'exit_securebag');
 const ids = await page.locator('#flow-nodes [data-node]').evaluateAll(nodes => nodes.map(node => node.dataset.node));
 assert.equal(ids.length, 18); assert.deepEqual(ids.sort(), getFlowGraph(3).nodes.map(node => node.id).sort());
 assert.equal(await page.locator('#flow-chapter4').count(), 0);
 await page.screenshot({ path: shots + '/chapter3-map.png' });
 await page.locator('#flow-true-story').click();
 const timeline = await page.locator('#flow-nodes [data-node]').evaluateAll(nodes => nodes.map(node => node.dataset.node));
 for (const id of ['0:wendigo', '1:tracks_bold', '2:trail_journal', '2:plan_protect', '2:fate_help', '2:symbol', '3:start', '3:approach_bargain', '3:test_listen', '3:exit_securebag', '3:night_gate']) assert.ok(timeline.includes(id), id);
 for (const id of ['0:werewolf', '1:tracks_search', '3:approach_direct', '3:test_mark', '3:exit_holdgate']) assert.equal(timeline.includes(id), false, id);
 const edges = await page.locator('#flow-edges [data-edge]').evaluateAll(nodes => nodes.map(node => node.dataset.edge));
 assert.ok(edges.some(id => id.includes('2:symbol') && id.includes('3:start')));
 await page.locator('[data-node="3:night_gate"]').dispatchEvent('click');
 assert.equal(await page.locator('#flow-alternative').isVisible(), false); assert.equal(await page.locator('#flow-rewrite').isVisible(), false);
 reports.push('All18 Chapter 3 map nodes are visible; True Story connects the supplied canonical0–2 path to the selected Chapter 3 route, remains read only and exposes no Chapter 4 tab');

 const official = await page.evaluate(() => game.story.getCanon());
 await inspect(page, 'approach_direct'); await page.locator('#flow-alternative').click();
 await page.waitForFunction(() => game.alternative && document.querySelector('#flowchart').hidden);
 assert.equal(await page.evaluate(() => game.engine.state.flags.wendy_approach), 'Direct');
 await page.evaluate(() => game.save());
 await page.evaluate(() => game.openFlowchart());
 assert.deepEqual(JSON.parse(await downloadSave(page)).canon, official);
 await page.locator('#flow-close').click();
 await drive(page, {}, { ...canonicalPicks, 'chapter_3/waymarks': 0, 'chapter_3/crossing': 0 });
 assert.equal(await page.evaluate(() => game.alternative.canon.choices['ch3.exit_plan']), 'HoldGate');
 assert.deepEqual(await page.evaluate(() => game.story.getCanon()), official);
 await page.locator('#alternative-exit').click();
 assert.deepEqual(await page.evaluate(() => game.story.getCanon()), official);
 reports.push('A Chapter 3 alternative changes approach, investigation and escape, finishes and invokes Save/export without leaking temporary effects into the official path');

 await inspect(page, 'exit_holdgate'); await page.locator('#flow-rewrite').click(); await page.locator('#flow-confirm-accept').click();
 await page.waitForFunction(() => game.story.getChoice('ch3.exit_plan') === 'HoldGate');
 const rewritten = await page.evaluate(() => game.story.getCanon());
 assert.equal(rewritten.derived.relationships.pacifica_gideon.total, 4); assert.equal(rewritten.derived.relationships.creature_trust.total, 1);
 assert.equal(rewritten.derived.flags.ch3_object_secured, undefined);
 assert.equal(rewritten.derived.quests.wendy_forest_object.value, 'unresolved'); assert.deepEqual(Object.keys(rewritten.derived.inventory), ['journal_3']);
 assert.deepEqual(Object.fromEntries(Object.entries(rewritten.choices).filter(([id]) => !id.startsWith('ch3.'))), earlierChoices);
 const exported = await downloadSave(page); assert.deepEqual(JSON.parse(exported).canon, rewritten);
 const imported = await newPage(); await importFile(imported.page, exported);
 assert.deepEqual(await imported.page.evaluate(() => game.story.getCanon()), rewritten);
 await imported.page.reload(); await imported.page.waitForFunction(() => window.game && game.story.isInitialized());
 await imported.page.evaluate(() => game.load(3)); assert.equal(await imported.page.evaluate(() => game.mode), 'ending');
 assert.deepEqual(await imported.page.evaluate(() => game.story.getCanon()), rewritten); assert.equal(await imported.page.evaluate(() => game.story.validate().valid), true);
 assert.deepEqual(imported.errors, []); assert.deepEqual(errors, []);
 assert.deepEqual(fs.readFileSync(new URL('../выборы.json', import.meta.url)), suppliedBytes);
 reports.push('Confirmed Chapter 3 rewrite recomputes only sourced effects; export, actual file import and a second-context reload preserve the canonical ending while the original выборы.json remains byte-for-byte unchanged');
 console.log(JSON.stringify({ checks: reports.length, reports, errors: [] }, null, 2));
} finally { for (const context of contexts) await context.close(); await browser.close(); }
