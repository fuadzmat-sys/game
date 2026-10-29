import fs from 'node:fs';
import { StoryEngine } from '../engine.js';
import { cleanSpeech, voiceLineKey } from '../chapter-audio.js';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
export function collectVoiceLines() {
  // This legacy renderer is scoped to the preserved Chapter 0. Chapter 1 needs
  // acted, reviewed recordings; the existing Piper profiles must not fill it.
  const scripts = read('assets/scripts.json');
  const characters = read('assets/config.json').characters;
  const lines = new Map();
  const collect = engine => {
    for (const row of engine.state.history) {
      const text = cleanSpeech(row.text);
      if (!text) continue;
      const key = voiceLineKey(text, row.speaker, engine.language);
      lines.set(key, { key, chapter: 0, text, speaker: row.speaker, language: engine.language });
    }
  };
  const until = (engine, phase) => {
    for (let n = 0; n < 5000; n++) {
      if (engine.state.phase === phase) return;
      engine.advance();
    }
    throw new Error(`Voice collection did not reach ${phase}: ${engine.state.script}`);
  };
  for (const language of ['russian', 'english']) for (const [index, monster] of ['Werewolf', 'Wendigo', 'Vampire'].entries()) {
    const engine = new StoryEngine({ scripts, characters, language });
    engine.start(); until(engine, 'choice'); engine.choose(index); until(engine, 'map');
    for (const location of ['Arcade', 'Hardware_Store', 'Telepathy_Tent']) {
      engine.visit(location, { script: `chapter_0/part_2_freetime/${location.toLowerCase()}/first` });
      until(engine, 'map');
    }
    engine.visit('Forest', { script: 'chapter_0/part_3_mothman/mothman_1', final: true });
    until(engine, 'credits'); collect(engine);
  }
  return [...lines.values()];
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node tools/collect-voice-lines.mjs output.json');
  const lines = collectVoiceLines();
  fs.writeFileSync(output, JSON.stringify(lines, null, 2) + '\n');
  console.log(`Collected ${lines.length} unique Chapter 0 lines in Russian and English`);
}
