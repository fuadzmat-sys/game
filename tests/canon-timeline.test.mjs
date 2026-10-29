import assert from 'node:assert/strict';
import { buildCanonTimeline, CANON_TIMELINE_CHAPTERS } from '../canon-timeline.js';

const copy = value => JSON.parse(JSON.stringify(value));
const canon = {
  currentChapter: 1,
  choices: { 'ch0.creature': 'Wendigo', 'ch1.gideon_reason': 'Openness', 'ch1.tracks': 'Search', 'ch1.slope': 'Pacifica', 'ch1.ending': 'Observation' },
  progress: {
    0: { sceneId: 'chapter_0/part_3_mothman/mothman_3', completed: true, visited: ['hardware_store', 'arcade', 'telepathy_tent', 'forest'] },
    1: { sceneId: 'chapter_1_v3/will', completed: true }
  }
};
const before = JSON.stringify(canon);
const timeline = buildCanonTimeline(canon);
const ids = timeline.nodes.map(node => node.nodeId);
for (const id of ['wendigo', 'moth_heat', 'cafe_wendigo', 'reason_openness', 'tracks_search', 'descent_pacifica', 'ending_observation']) assert.ok(ids.includes(id), id);
for (const id of ['werewolf', 'vampire', 'moth_paper', 'cafe_vampire', 'reason_deflect', 'tracks_bold', 'descent_careful', 'ending_cautious']) assert.ok(!ids.includes(id), id);
assert.ok(timeline.edges.some(edge => edge.chapterTransition && edge.from === '0:finale' && edge.to === '1:start'));
assert.equal(timeline.edges.length, timeline.nodes.length - 1);
assert.ok(timeline.nodes.every(node => node.inPath && node.visible && !node.inAlternative));
assert.equal(timeline.readOnly, true);
assert.equal(JSON.stringify(canon), before);
assert.ok(ids.indexOf('hardware') < ids.indexOf('arcade'));
console.log('✓ True Story joins only official selected routes and preserves canonical town visit order');

const progressing = copy(canon);
progressing.progress[1] = { sceneId: 'chapter_1_v3/tracks', phase: 'choice' };
const partial = buildCanonTimeline(progressing).nodes;
assert.ok(partial.some(node => node.nodeId === 'tracks'));
assert.ok(!partial.some(node => ['tracks_search', 'will'].includes(node.nodeId)));
assert.equal(partial.at(-1).current, true);
console.log('✓ Canonical choices cached beyond the current cursor never reveal unplayed timeline scenes');

const official = copy(canon);
const session = { canon: copy(canon), discovery: { nodes: ['vampire', 'werewolf'] } };
session.canon.choices['ch0.creature'] = 'Vampire';
assert.deepEqual(buildCanonTimeline(official), timeline);
official.choices['ch0.creature'] = 'Vampire';
let refreshed = buildCanonTimeline(official);
assert.ok(refreshed.nodes.some(node => node.nodeId === 'vampire'));
assert.ok(!refreshed.nodes.some(node => node.nodeId === 'wendigo'));
official.choices['ch0.creature'] = 'Wendigo';
assert.deepEqual(buildCanonTimeline(official), timeline);
console.log('✓ Alternative data has no input path; canonical rewrite/import projections rebuild immediately');

const unstarted = copy(canon);
delete unstarted.progress[0];
assert.ok(buildCanonTimeline(unstarted).nodes.every(node => node.chapterId === 1));
assert.equal(buildCanonTimeline({ choices: {}, progress: {} }).nodes.length, 0);
console.log('✓ Starting a later chapter independently does not invent a played earlier chapter');

const mock = {
  chapterId: 2, available: true, entry: 'arrival', exit: 'departure',
  label: { russian: 'Тестовая глава', english: 'Mock chapter' },
  nodes: [
    { id: 'arrival', sceneId: 'mock/arrival', kind: 'start', label: 'Arrival' },
    { id: 'investigate', sceneId: 'mock/investigate', label: 'Investigate', requirements: [{ choiceId: 'mock.action', optionId: 'Investigate' }] },
    { id: 'retreat', sceneId: 'mock/retreat', label: 'Retreat', requirements: [{ choiceId: 'mock.action', optionId: 'Retreat' }] },
    { id: 'departure', sceneId: 'mock/departure', label: 'Departure', kind: 'ending' }
  ],
  edges: [ { from: 'arrival', to: 'investigate' }, { from: 'arrival', to: 'retreat' }, { from: 'investigate', to: 'departure' }, { from: 'retreat', to: 'departure' } ]
};
const future = copy(canon);
future.currentChapter = 2;
future.choices['mock.action'] = 'Investigate';
future.progress[2] = { sceneId: 'mock/departure', completed: true };
const extended = buildCanonTimeline(future, { chapters: [...CANON_TIMELINE_CHAPTERS, mock] });
assert.ok(extended.edges.some(edge => edge.from === '1:will' && edge.to === '2:arrival' && edge.chapterTransition));
assert.deepEqual(extended.nodes.filter(node => node.chapterId === 2).map(node => node.nodeId), ['arrival', 'investigate', 'departure']);
assert.equal(extended.currentNodeId, '2:departure');
assert.ok(!buildCanonTimeline(canon, { chapters: [...CANON_TIMELINE_CHAPTERS, mock] }).nodes.some(node => node.chapterId === 2));
console.log('✓ A registered mock future chapter extends the timeline without chapter-specific renderer changes');
