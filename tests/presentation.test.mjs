import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryEngine } from '../engine.js';
import { defaultPresentationState } from '../presentation.js';

test('presentation commands update persistent scene state and emit reusable events', () => {
  const scripts = { demo: [
    '[char showi Pacifica center]',
    '[camera preset dramatic duration 1.2]',
    '[fx dark_vignette]',
    '[ambience forest_day fade .8]',
    '[expression Pacifica suspicious transition .2]',
    '[anim Pacifica recoil duration .3]',
    '[music curious crossfade fade .7]',
    '[Choice importance important]',
    '[Narrator]',
    'Testing presentation.'
  ].join('\n') };
  const engine = new StoryEngine({ scripts });
  const result = engine.start('demo');
  assert.equal(engine.state.presentation.camera.zoom, 1.12);
  assert.equal(engine.state.presentation.camera.duration, 1.2);
  assert.equal(engine.state.presentation.backgroundEffect, 'dark_vignette');
  assert.equal(engine.state.presentation.ambience, 'forest_day');
  assert.equal(engine.state.presentation.choiceImportance, 'important');
  assert.equal(engine.state.chars.pacifica.expression, 'suspicious');
  assert.equal(engine.state.music, 'curious');
  assert.ok(result.events.some(event => event.type === 'camera'));
  assert.ok(result.events.some(event => event.type === 'background-fx'));
  assert.ok(result.events.some(event => event.type === 'ambience'));
  assert.ok(result.events.some(event => event.type === 'animation' && event.preset === 'recoil'));
  assert.ok(result.events.some(event => event.type === 'audio' && event.crossfade && event.fade === .7));
});

test('presentation state survives saves while transient animation does not need mid-frame restoration', () => {
  const scripts = { demo: '[camera focus Pacifica zoom 1.09 duration .4]\n[fx electric_blue]\n[ambience road_night]\n[char showi Pacifica]\nDone' };
  const engine = new StoryEngine({ scripts });
  engine.start('demo');
  const snapshot = engine.snapshot();
  const restored = new StoryEngine({ scripts });
  restored.restore(snapshot);
  assert.deepEqual(restored.state.presentation, snapshot.presentation);
  assert.equal(restored.state.presentation.camera.focus, 'pacifica');
  assert.equal(restored.state.presentation.backgroundEffect, 'electric_blue');
  assert.equal(restored.state.presentation.ambience, 'road_night');
});

test('legacy saves without presentation data receive safe defaults', () => {
  const scripts = { demo: '[Narrator]\nLegacy save.' };
  const engine = new StoryEngine({ scripts });
  engine.start('demo');
  const legacy = engine.snapshot();
  delete legacy.presentation;
  const restored = new StoryEngine({ scripts });
  restored.restore(legacy);
  assert.deepEqual(restored.state.presentation, defaultPresentationState());
});

test('unknown presentation preset IDs are ignored instead of corrupting scene state', () => {
  const scripts = { demo: '[camera preset impossible]\n[fx impossible]\n[anim Pacifica impossible]\nDone' };
  const engine = new StoryEngine({ scripts });
  const result = engine.start('demo');
  assert.deepEqual(engine.state.presentation, defaultPresentationState());
  assert.equal(result.events.some(event => ['camera', 'background-fx', 'animation'].includes(event.type)), false);
});
