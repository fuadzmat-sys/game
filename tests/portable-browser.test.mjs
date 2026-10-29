/** End-to-end portable canon, map visibility and read-only timeline checks.
 * Run the built game on REVERSE_FALLS_TEST_URL (default port 8780) first.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createStoryEnvelope, STORY_KEY } from '../story-state.js';
import { STORY_REGISTRY, replayCanonicalSnapshot, progressFromSnapshot } from '../story-bridge.js';
import { getFlowGraph } from '../flowchart.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const resources = {
  scripts: { ...read('assets/scripts.json'), ...read('assets/chapter1-scripts.json') },
  characters: { ...read('assets/config.json').characters, ...read('assets/chapter1-art.json').characters },
  language: 'russian'
};
const choices = { 'ch0.creature': 'Vampire', 'ch1.gideon_reason': 'Openness', 'ch1.tracks': 'Journal', 'ch1.slope': 'Pacifica', 'ch1.ending': 'Observation' };
function full(chapter) {
  const canon = createStoryEnvelope({ choices, currentChapter: chapter, progress: { [chapter]: {
    sceneId: chapter === 0 ? 'chapter_0/part_3_mothman/mothman_3' : 'chapter_1_v3/will',
    phase: 'credits', completed: true, line: 0,
    visited: chapter === 0 ? ['hardware_store', 'telepathy_tent', 'arcade', 'forest'] : []
  } } }, STORY_REGISTRY).canon;
  return replayCanonicalSnapshot(chapter, canon, null, resources);
}
const zero = full(0), one = full(1);
const fixture = createStoryEnvelope({ choices, currentChapter: 1,
  progress: { 0: progressFromSnapshot(zero), 1: progressFromSnapshot(one) },
  snapshots: { 0: zero, 1: one }, discovery: {} }, STORY_REGISTRY);
const origin = process.env.REVERSE_FALLS_TEST_URL || 'http://127.0.0.1:8780';
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const contexts = [], reports = [];
async function newPage(seed = null) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  contexts.push(context);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.addInitScript(({ seed, key }) => {
    if (sessionStorage.getItem('portable-test-seeded')) return;
    sessionStorage.setItem('portable-test-seeded', '1');
    localStorage.setItem('reverse-falls-preferences', JSON.stringify({ chapter: 1, language: 'russian', reducedMotion: true }));
    if (seed) localStorage.setItem(key, JSON.stringify(seed));
  }, { seed, key: STORY_KEY });
  await page.goto(origin);
  await page.waitForFunction(() => window.game && game.story.isInitialized());
  return { page, errors };
}
async function inspect(page, chapter, node) {
  await page.evaluate(() => game.openFlowchart());
  await page.locator('#flow-chapter' + chapter).click();
  await page.locator('#flow-full').click();
  await page.locator(`[data-node="${node}"]`).dispatchEvent('click');
}
async function timeline(page, creature) {
  await page.locator('#flow-true-story').click();
  const ids = await page.locator('#flow-nodes [data-node]').evaluateAll(nodes => nodes.map(node => node.dataset.node));
  assert.ok(ids.includes(`0:${creature.toLowerCase()}`));
  for (const other of ['Vampire', 'Werewolf', 'Wendigo'].filter(value => value !== creature)) {
    assert.equal(ids.includes(`0:${other.toLowerCase()}`), false);
  }
  assert.ok(ids.includes('1:start'), 'timeline continues into chapter one');
  assert.ok(ids.includes('1:will'), 'completed chapter one reaches its canonical exit');
  const transitions = await page.locator('#flow-edges [data-edge]').evaluateAll(edges => edges.map(edge => edge.dataset.edge));
  assert.ok(transitions.some(id => id.startsWith('0:') && id.includes('>1:')), 'chapter paths are connected');
  for (const id of ids) {
    await page.locator(`[data-node="${id}"]`).dispatchEvent('click');
    assert.equal(await page.locator('#flow-alternative').isVisible(), false);
    assert.equal(await page.locator('#flow-rewrite').isVisible(), false);
  }
  const statuses = await page.locator('#flow-nodes [data-node]').evaluateAll(nodes => nodes.map(node => node.dataset.status));
  assert.ok(statuses.every(status => status === 'path' || status === 'current'));
  return ids;
}
async function chooseFile(page, body, name = 'reverse_falls_canon_save.json') {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#flow-import-save').click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(body) });
}
try {
  const fresh = await newPage();
  await fresh.page.evaluate(() => game.openFlowchart());
  assert.equal(await fresh.page.locator('#flow-reveal').count(), 0);
  const canonBeforeViewing = await fresh.page.evaluate(() => game.story.getCanon());
  const discoveryBeforeViewing = await fresh.page.evaluate(() => game.story.getState().discovery);
  for (const chapter of [0, 1]) {
    await fresh.page.locator('#flow-chapter' + chapter).click();
    await fresh.page.locator('#flow-full').click();
    const actual = await fresh.page.locator('#flow-nodes [data-node]').evaluateAll(nodes => nodes.map(node => node.dataset.node));
    assert.deepEqual(actual.sort(), getFlowGraph(chapter).nodes.map(node => node.id).sort());
    assert.equal(await fresh.page.locator('#flow-nodes').textContent().then(text => text.includes('???')), false);
  }
  assert.deepEqual(await fresh.page.evaluate(() => game.story.getCanon()), canonBeforeViewing);
  assert.deepEqual(await fresh.page.evaluate(() => game.story.getState().discovery), discoveryBeforeViewing);
  assert.deepEqual(fresh.errors, []);
  reports.push('Fresh full maps expose every existing chapter-zero/one node without spoiler toggle or discovery mutations');
  await fresh.page.close();

  // A fully visible option may be selected before its decision was played.
  const freshZero = await newPage();
  await freshZero.page.evaluate(() => game.startChapter(0, { language: 'russian' }));
  assert.equal(await freshZero.page.evaluate(() => game.story.getChoice('ch0.creature')), null);
  await inspect(freshZero.page, 0, 'werewolf');
  await freshZero.page.locator('#flow-rewrite').click();
  await freshZero.page.locator('#flow-confirm-accept').click();
  await freshZero.page.waitForFunction(() => game.story.getChoice('ch0.creature') === 'Werewolf');
  assert.equal(await freshZero.page.evaluate(() => game.story.validate().valid), true);
  await freshZero.page.locator('#flow-current').click();
  assert.equal(await freshZero.page.locator('[data-node="werewolf"]').count(), 1);
  assert.equal(await freshZero.page.locator('[data-node="vampire"]').count(), 0);
  await freshZero.page.locator('#flow-true-story').click();
  assert.equal(await freshZero.page.locator('[data-node="0:werewolf"]').count(), 1);
  assert.equal(await freshZero.page.locator('[data-node="0:vampire"]').count(), 0);
  assert.equal(await freshZero.page.evaluate(() => game.story.exportSave().canon.choices['ch0.creature']), 'Werewolf');
  assert.deepEqual(freshZero.errors, []);
  reports.push('Fresh chapter-zero rewrite establishes an unplayed creature option in My Path, True Story and export');
  await freshZero.page.close();

  const freshOne = await newPage();
  await freshOne.page.evaluate(() => game.startChapter(1, { language: 'russian', monster: 'Werewolf' }));
  assert.equal(await freshOne.page.evaluate(() => game.story.getChoice('ch1.tracks')), null);
  await inspect(freshOne.page, 1, 'tracks_search');
  await freshOne.page.locator('#flow-rewrite').click();
  assert.ok((await freshOne.page.locator('#flow-confirm-text').textContent()).length > 0);
  await freshOne.page.locator('#flow-confirm-accept').click();
  await freshOne.page.waitForFunction(() => game.story.getChoice('ch1.tracks') === 'Search');
  const freshPrefix = await freshOne.page.evaluate(() => ({
    canon: game.story.getCanon(), exported: game.story.exportSave().canon,
    valid: game.story.validate().valid, snapshots: game.story.getState().snapshots
  }));
  assert.equal(freshPrefix.valid, true);
  assert.deepEqual(freshPrefix.canon.choices, {
    'ch0.creature': 'Werewolf', 'ch1.gideon_reason': 'Deflect', 'ch1.tracks': 'Search'
  });
  assert.deepEqual(freshPrefix.exported, freshPrefix.canon);
  assert.equal(freshPrefix.snapshots[1].script, 'chapter_1_v3/tracks_search');
  await freshOne.page.locator('#flow-current').click();
  assert.equal(await freshOne.page.locator('[data-node="tracks_search"]').count(), 1);
  assert.equal(await freshOne.page.locator('[data-node="tracks_journal"]').count(), 0);
  await freshOne.page.locator('#flow-true-story').click();
  assert.equal(await freshOne.page.locator('[data-node="1:tracks_search"]').count(), 1);
  assert.equal(await freshOne.page.locator('[data-node="1:reason_deflect"]').count(), 1);
  assert.equal(await freshOne.page.locator('[data-node="1:tracks_journal"]').count(), 0);
  assert.deepEqual(freshOne.errors, []);
  reports.push('Fresh chapter-one rewrite creates a coherent default prefix, valid resume cursor, canonical maps and export');
  await freshOne.page.close();

  const { page, errors } = await newPage(fixture);
  const original = await page.evaluate(() => game.story.getCanon());
  await inspect(page, 0, 'werewolf');
  assert.equal(await page.locator('#flow-alternative').isVisible(), true);
  await page.locator('#flow-alternative').click();
  await page.waitForFunction(() => game.alternative && document.querySelector('#flowchart').hidden);
  assert.equal(await page.evaluate(() => game.engine.state.flags.monster), 'Werewolf');
  await page.evaluate(() => game.story.updateAlternative({
    choices: { 'ch0.creature': 'Werewolf', 'ch1.gideon_reason': 'Deflect', 'ch1.tracks': 'Search' },
    currentChapter: 1, progress: {}, snapshots: {}
  }));
  assert.equal(await page.evaluate(() => game.story.hasItem('cloth_scrap', { alternative: true })), true);
  assert.equal(await page.evaluate(() => game.story.getRelationship('pacifica_gideon', { alternative: true })), 0);
  assert.deepEqual(await page.evaluate(() => game.story.exportSave().canon), original);
  await page.evaluate(() => game.save());
  assert.deepEqual(await page.evaluate(() => game.story.getCanon()), original);
  await page.locator('#alternative-exit').click();
  assert.deepEqual(await page.evaluate(() => game.story.getCanon()), original);
  await page.evaluate(() => game.openFlowchart());
  await timeline(page, 'Vampire');
  reports.push('Unvisited alternative launches; temporary flag/item/relationship effects and Save cannot leak into export or True Story');

  await inspect(page, 0, 'wendigo');
  await page.locator('#flow-rewrite').click();
  await page.locator('#flow-confirm-accept').click();
  await page.waitForFunction(() => game.story.getChoice('ch0.creature') === 'Wendigo');
  assert.equal(await page.evaluate(() => game.story.exportSave().canon.choices['ch0.creature']), 'Wendigo');
  await timeline(page, 'Wendigo');
  const expected = await page.evaluate(() => game.story.getCanon());
  reports.push('Transactional rewrite immediately updates export and the connected read-only canonical timeline');

  const downloading = page.waitForEvent('download');
  await page.locator('#flow-export-save').click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), 'reverse_falls_canon_save.json');
  const portableText = fs.readFileSync(await download.path(), 'utf8');
  const portable = JSON.parse(portableText);
  assert.equal(portable.format, 'reverse-falls-canon-save');
  assert.equal(portable.saveFormatVersion, 1);
  assert.deepEqual(portable.canon, expected);
  assert.equal('discovery' in portable, false);
  reports.push('Real browser download contains the versioned official canon JSON');

  await inspect(page, 0, 'vampire');
  await page.locator('#flow-rewrite').click();
  await page.locator('#flow-confirm-accept').click();
  await page.waitForFunction(() => game.story.getChoice('ch0.creature') === 'Vampire');
  const beforeImport = await page.evaluate(() => game.story.getCanon());
  await chooseFile(page, portableText);
  await page.waitForFunction(() => !document.querySelector('#flow-import-confirm').hidden);
  assert.deepEqual(await page.evaluate(() => game.story.getCanon()), beforeImport);
  await page.locator('#flow-import-confirm-cancel').click();
  assert.deepEqual(await page.evaluate(() => game.story.getCanon()), beforeImport);
  reports.push('File chooser validates before confirmation; cancelling leaves the current story intact');

  await chooseFile(page, portableText);
  await page.waitForFunction(() => !document.querySelector('#flow-import-confirm').hidden);
  await page.locator('#flow-import-confirm-accept').click();
  await page.waitForFunction(() => game.story.getChoice('ch0.creature') === 'Wendigo');
  assert.deepEqual(await page.evaluate(() => game.story.getCanon()), expected);
  await page.locator('#flow-chapter0').click();
  await page.locator('#flow-current').click();
  assert.equal(await page.locator('[data-node="wendigo"]').count(), 1);
  assert.equal(await page.locator('[data-node="vampire"]').count(), 0);
  await timeline(page, 'Wendigo');
  await page.reload();
  await page.waitForFunction(() => window.game && game.story.isInitialized());
  assert.deepEqual(await page.evaluate(() => game.story.getCanon()), expected);
  await page.evaluate(() => game.openFlowchart());
  await timeline(page, 'Wendigo');
  reports.push('Confirmed import updates My Path and True Story and survives a real browser reload');

  for (const text of ['{bad-json', JSON.stringify({ ...portable, format: 'unsupported' }),
    JSON.stringify({ ...portable, canon: { ...portable.canon, choices: { 'unknown.choice': 'bad' } } }),
    JSON.stringify({ ...portable, schemaVersion: 999 })]) {
    const before = await page.evaluate(() => game.story.getCanon());
    await chooseFile(page, text);
    await page.waitForFunction(() => document.querySelector('#flow-import-error').textContent.length > 0);
    assert.equal(await page.locator('#flow-import-confirm').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => game.story.getCanon()), before);
  }
  reports.push('Broken JSON, unknown IDs, invalid schema and unsupported format show errors without altering canon');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: reports.length, reports, errors: [] }, null, 2));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
