import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BitmapText } from '../bitmap-font.js';
import { parseLine } from '../engine.js';

const { fonts: config } = JSON.parse(fs.readFileSync(new URL('../assets/config.json', import.meta.url)));
function renderer() {
  const result = new BitmapText({}, {});
  for (const [name, source] of Object.entries(config)) result.fonts.set(name, {
    name, info: source.info, glyphs: new Map(source.glyphs.map(g => [g.id, g])), kerning: new Map(), atlas: { height: 4096 }
  });
  return result;
}

test('new dialogue punctuation uses supplied glyphs without changing the original rendering option', () => {
  const font = renderer(), source = 'Тень — и тишина…';
  const old = font.layout(source, { font: 'AccentsRobotoMediumC' });
  assert.ok(old.lines.flatMap(l => l.glyphs).some(g => g.glyph.id === 63));
  const fixed = font.layout(source, { font: 'AccentsRobotoMediumC', extendedGlyphs: true });
  assert.equal(fixed.plainText, source);
  assert.equal(fixed.count, [...source].length);
  assert.ok(fixed.lines.flatMap(l => l.glyphs).every(g => g.glyph.id !== 63));
});

test('the composed numero sign keeps one reveal position and caches its atlas', () => {
  const originalDocument = globalThis.document;
  let canvases = 0;
  globalThis.document = { createElement() { canvases++; return { width: 0, height: 0, getContext: () => ({ drawImage() {}, fillRect() {} }) }; } };
  try {
    const font = renderer(), options = { font: 'AccentsRobotoMediumC', extendedGlyphs: true };
    const result = font.layout('№1 №2', options), glyphs = result.lines.flatMap(l => l.glyphs);
    assert.equal(result.plainText, '№1 №2'); assert.equal(result.count, 5);
    assert.deepEqual(glyphs.filter(g => g.char === '№').map(g => g.glyph.id), [0x2116, 0x2116]);
    assert.equal(canvases, 1);
    assert.ok(glyphs.every(g => Number.isFinite(g.advance) && g.advance > 0));
  } finally { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; }
});

test('every complete Chapter 1 paragraph fits the dialogue box and uses available glyphs', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, fillRect() {} }) }) };
  try {
    const font = renderer(), scripts = JSON.parse(fs.readFileSync(new URL('../assets/chapter1-scripts.json', import.meta.url)));
    let checked = 0;
    for (const [path, source] of Object.entries(scripts)) for (const line of source.split('\n')) {
      const text = parseLine(line).text;
      if (!text.trim()) continue;
      const russian = path.includes('/russian/');
      const layout = font.layout(text, { font: russian ? 'AccentsRobotoMediumC' : 'AgendaMediumEC', size: 124 * (russian ? .7 : 1), maxWidth: 2276, extendedGlyphs: true });
      assert.ok(layout.height <= 466, `Clipped paragraph in ${path}: ${text}`);
      for (const glyph of layout.lines.flatMap(row => row.glyphs)) assert.ok(glyph.char === '?' || glyph.glyph.id !== 63, `Missing glyph ${glyph.char} in ${path}`);
      checked++;
    }
    assert.equal(checked, 1240);
  } finally { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; }
});
