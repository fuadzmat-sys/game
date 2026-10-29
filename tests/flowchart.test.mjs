import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { StoryEngine } from '../engine.js';
import { FLOW_KEY, getFlowGraph, readFlowProgress, observeFlow, flowView } from '../flowchart.js';

const original = JSON.parse(fs.readFileSync(new URL('../assets/scripts.json', import.meta.url)));
const continuation = JSON.parse(fs.readFileSync(new URL('../assets/chapter1-scripts.json', import.meta.url)));
const scripts = { ...original, ...continuation };
const blank = () => readFlowProgress(null);
const until = (engine, phase) => {
  let attempts = 0;
  while (engine.state.phase !== phase && ++attempts < 4000) engine.advance();
  assert.equal(engine.state.phase, phase);
};
const finish = (engine, choices) => {
  let attempts = 0, selected = 0;
  while (engine.state.phase !== 'credits' && ++attempts < 4000) {
    if (engine.state.phase === 'choice') engine.choose(choices[selected++]);
    else engine.advance();
  }
  assert.equal(engine.state.phase, 'credits');
  assert.equal(selected, 4);
};

test('both maps are bounded, bilingual, connected graphs with valid unique IDs', () => {
  for (const chapter of [0, 1]) {
    const graph = getFlowGraph(chapter), ids = new Set(graph.nodes.map(node => node.id));
    assert.equal(graph.chapter, chapter);
    assert.equal(ids.size, graph.nodes.length);
    assert.equal(new Set(graph.edges.map(edge => edge.id)).size, graph.edges.length);
    for (const node of graph.nodes) {
      assert.ok(node.x >= 0 && node.y >= 0 && node.x + node.width <= graph.width && node.y + node.height <= graph.height);
      for (const language of ['russian', 'english']) assert.ok(node.label[language] && node.detail[language]);
      assert.ok(['start', 'choice', 'event', 'ending'].includes(node.kind));
    }
    for (const edge of graph.edges) assert.ok(ids.has(edge.from) && ids.has(edge.to));
    const reached = new Set([graph.nodes[0].id]);
    for (let i = 0; i < graph.nodes.length; i++) for (const edge of graph.edges) if (reached.has(edge.from)) reached.add(edge.to);
    assert.equal(reached.size, ids.size);
  }
});

test('progress normalizes untrusted data and stores only connected known discoveries', () => {
  assert.ok(FLOW_KEY.includes('flowchart'));
  const malicious = { version: 3, chapters: { 1: { nodes: ['start', 'start', 'cafe', 'future', null], edges: ['start>cafe', 'blue_glow>will', 'bogus'] } } };
  const restored = readFlowProgress(JSON.stringify(malicious));
  assert.deepEqual(restored.chapters[1], { nodes: ['cafe', 'start'], edges: ['start>cafe'] });
  assert.deepEqual(readFlowProgress('{no'), blank());
  assert.deepEqual(readFlowProgress({ version: 4, chapters: malicious.chapters }), blank());
  assert.deepEqual(readFlowProgress(null), blank());
});

test('all implemented scenes are visible; future flags alone do not discover scenes', () => {
  const engine = new StoryEngine({ scripts, language: 'russian' });
  engine.start('chapter_1_v3/start', { flags: { Monster: 'Vampire', Ending: 'Observation', extra_clue_01: true } });
  const view = flowView(1, blank(), engine.snapshot());
  assert.equal(view.currentNodeId, 'start');
  assert.deepEqual(view.nodes.filter(node => node.discovered).map(node => node.id), ['start']);
  assert.equal(view.completed, false);
  assert.equal(view.nodes.find(node => node.id === 'will').visible, true);
  assert.ok(view.nodes.every(node => node.visible));
  assert.equal(view.discoveredCount, 1);
});

test('played investigation branches cumulatively discover all 37 nodes and 50 edges', () => {
  let progress = blank();
  for (const language of ['russian', 'english']) for (const monster of ['Werewolf', 'Wendigo', 'Vampire']) for (const choice of [0, 1, 2]) {
    const engine = new StoryEngine({ scripts, language });
    engine.start('chapter_1_v3/start', { flags: { monster } });
    finish(engine, [choice, choice, choice, choice]);
    const before = JSON.stringify(progress), snapshot = engine.snapshot();
    const view = flowView(1, progress, snapshot);
    assert.equal(view.completed, true);
    assert.equal(view.currentNodeId, 'will');
    assert.equal(view.nodes.filter(node => node.current).length, 1);
    assert.equal(view.nodes.filter(node => node.inPath && node.kind === 'ending').length, 1);
    assert.equal(view.nodes.filter(node => node.inPath && node.kind === 'choice').length, 4);
    assert.equal(view.nodes.filter(node => node.inPath).length, 23);
    assert.equal(view.edges.filter(edge => edge.inPath).length, 22);
    progress = observeFlow(progress, snapshot);
    assert.equal(JSON.stringify(readFlowProgress(JSON.parse(before))), before, 'Observing must not mutate progress');
    assert.equal(JSON.stringify(snapshot), JSON.stringify(engine.snapshot()), 'Discovery must not mutate a save');
  }
  const graph = getFlowGraph(1), view = flowView(1, progress, null);
  assert.equal(graph.nodes.length, 37); assert.equal(graph.edges.length, 50);
  assert.equal(view.discoveredCount, graph.nodes.length); assert.equal(view.percent, 100);
  assert.equal(progress.chapters[1].edges.length, graph.edges.length);
  assert.ok(view.nodes.every(node => node.discovered && !node.inPath && !node.current));
  assert.ok(view.edges.every(edge => edge.discovered && !edge.inPath));
  assert.deepEqual(readFlowProgress(JSON.stringify(progress)), progress);
});

test('rewinding highlights only the loaded history while retaining later discoveries', () => {
  const engine = new StoryEngine({ scripts });
  engine.start('chapter_1_v3/start', { flags: { monster: 'Wendigo' } });
  until(engine, 'choice');
  const investigationSave = engine.snapshot();
  finish(engine, [2, 2, 2, 2]);
  const progress = observeFlow(blank(), engine.snapshot());
  const reloaded = new StoryEngine({ scripts }); reloaded.restore(investigationSave);
  const view = flowView(1, progress, reloaded.snapshot());
  assert.equal(view.currentNodeId, 'reason');
  for (const id of ['reason_openness', 'tracks_search', 'ending_observation', 'will']) {
    assert.equal(view.nodes.find(node => node.id === id).discovered, true);
    assert.equal(view.nodes.find(node => node.id === id).inPath, false);
  }
  assert.equal(view.completed, false);
  assert.ok(!view.edges.find(edge => edge.id === 'reason>reason_openness').inPath);
});

test('old chapter-zero saves reconstruct town loops in any visitation order', () => {
  let cumulative = blank();
  for (const [choice, locations] of [
    [0, ['Arcade', 'Hardware_Store', 'Telepathy_Tent']],
    [1, ['Hardware_Store', 'Telepathy_Tent', 'Arcade']],
    [2, ['Telepathy_Tent', 'Arcade', 'Hardware_Store']]
  ]) {
    const engine = new StoryEngine({ scripts: original }); engine.start(); until(engine, 'choice'); engine.choose(choice); until(engine, 'map');
    let view = flowView(0, blank(), engine.snapshot());
    assert.equal(view.currentNodeId, 'town');
    assert.equal(view.nodes.find(node => node.id === 'town').discovered, true);
    assert.equal(view.nodes.find(node => node.id === 'forest').discovered, false);
    for (const location of locations) {
      const folder = { Arcade: 'arcade', Hardware_Store: 'hardware_store', Telepathy_Tent: 'telepathy_tent' }[location];
      engine.visit(location, { script: `chapter_0/part_2_freetime/${folder}/first` }); until(engine, 'map');
      view = flowView(0, blank(), engine.snapshot());
      assert.equal(view.currentNodeId, 'town');
    }
    engine.visit('Forest', { script: 'chapter_0/part_3_mothman/mothman_1', final: true }); until(engine, 'credits');
    view = flowView(0, blank(), engine.snapshot());
    assert.equal(view.completed, true);
    assert.equal(view.nodes.filter(node => node.inPath).length, 10);
    assert.ok(['arcade', 'hardware', 'tent'].every(id => view.edges.some(edge => edge.id === `${id}>town` && edge.inPath)));
    cumulative = observeFlow(cumulative, engine.snapshot());
  }
  const graph = getFlowGraph(0), view = flowView(0, cumulative, null);
  assert.equal(view.percent, 100);
  assert.equal(cumulative.chapters[0].edges.length, graph.edges.length);
});

test('foreign, broken, defensive or future-only snapshots do not discover other chapter routes', () => {
  assert.deepEqual(observeFlow(blank(), null), blank());
  assert.deepEqual(observeFlow(blank(), { version: 1, script: 'chapter_1/not_a_resource', line: 0, history: [] }), blank());
  const engine = new StoryEngine({ scripts });
  for (const script of ['chapter_1/epilogue_anchor', 'chapter_1_v2/start', 'chapter_1_v2/ending_ask']) {
    const legacy = { version: 1, script, line: 0, history: [] };
    assert.deepEqual(observeFlow(blank(), legacy), blank());
  }
  engine.start('chapter_0/part_2_freetime/arcade/first');
  const view = flowView(0, blank(), engine.snapshot());
  assert.deepEqual(view.nodes.filter(node => node.discovered).map(node => node.id), ['arcade']);
  assert.equal(flowView(1, blank(), engine.snapshot()).discoveredCount, 0);
});


test('both old map versions preserve chapter-zero discoveries and discard replaced chapter-one graphs', () => {
 for (const version of [1, 2]) {
  const legacy = { version, chapters: {
    0: { nodes: ['intro', 'werewolf'], edges: ['intro>werewolf'] },
    1: { nodes: ['breakfast', 'morning', 'decision'], edges: ['morning>decision'] }
  } };
  const progress = readFlowProgress(legacy);
  assert.equal(progress.version, 3);
  assert.deepEqual(progress.chapters[0], legacy.chapters[0]);
  assert.deepEqual(progress.chapters[1], { nodes: [], edges: [] });
  assert.deepEqual(readFlowProgress(JSON.stringify(progress)), progress);
 }
});
