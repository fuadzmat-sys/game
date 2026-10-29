// Prepare casting and per-line recording slots, without synthesizing any audio.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseLine } from '../engine.js';
import { cleanSpeech } from '../chapter-audio.js';

const root = new URL('../', import.meta.url);
export const CAST_DIRECTION = {
  Gideon: { age: 12, direction: 'Natural boy voice, calm, observant and dryly sarcastic; emotionally restrained without flat cadence. Never squeaky or a caricature of a frightened child.' },
  Pacifica: { age: 14, direction: 'Natural teenage girl, brave, energetic and expressive. Act irritation, sarcasm, laughter, doubt and softer trust without romantic framing toward Gideon.' },
  Mabel: { age: 15, direction: 'Natural teenage girl, bright, charismatic and playful; sometimes unsettling beneath the cheerful delivery. Not present in this chapter.' },
  Dipper: { age: 15, direction: 'Natural teenage boy, controlled, intelligent and analytical; less theatrical than Mabel. Not present in this chapter.' },
  Wendy: { age: 18, direction: 'Young adult woman, relaxed, lazy and sarcastic, slightly rough but clearly young. Not present in this chapter.' },
  Waitress: { age: 'adult', direction: 'Believable adult waitress, matter-of-fact conversational delivery.' },
  Woman_1: { age: 'adult', direction: 'Adult local woman discussing missing pets; concerned, not melodramatic.' },
  Woman_2: { age: 'adult', direction: 'Adult local woman, distinct from Woman_1; skeptical and conversational.' },
  Woman: { age: 'adult', direction: 'Adult local woman answering Pacifica; natural concern about the missing animals.' },
  Man: { age: 'older adult', direction: 'Older resident remembering sounds from his yard. Grounded adult voice, no comic caricature.' },
  Will: { age: 'unspecified', direction: 'Only a quiet, whispered “Любопытно.” / “Curious.” as a mysterious observer. Do not reveal identity or intentions through added lines.' },
  Narrator: { age: 'adult', direction: 'Optional narration: responsive pacing with real pauses for suspense, humor and quiet moments; do not read staging labels as dialogue.' }
};

export function collectChapterOneVoiceSlots(scripts) {
  const slots = [];
  for (const [resource, source] of Object.entries(scripts)) {
    if (!/^textes\/(russian|english)\/chapter_1_v3\//.test(resource)) continue;
    const language = resource.split('/')[1];
    let speaker = 'Narrator';
    const emotions = new Map();
    const lines = String(source).split(/\r\n|\r|\n/).filter(line => line.length);
    for (const [index, line] of lines.entries()) {
      const parsed = parseLine(line);
      for (const segment of parsed.segments) {
        if (segment.type !== 'command') continue;
        const [command, name, emotion] = segment.args;
        const known = Object.keys(CAST_DIRECTION).find(key => key.toLowerCase() === command.toLowerCase());
        if (known) speaker = known;
        if (command.toLowerCase() === 'emotion' && name) emotions.set(name.toLowerCase(), emotion);
      }
      const text = cleanSpeech(parsed.text);
      if (!text) continue;
      const id = createHash('sha256').update(`${resource}\n${index + 1}\n${speaker}\n${text}`).digest('hex').slice(0, 24);
      slots.push({ id, chapter: 1, script: resource.split('/').slice(2).join('/'), language,
        sourceLine: index + 1, speaker, text, expression: emotions.get(speaker.toLowerCase()) || 'neutral',
        direction: speaker === 'Will' ? 'Whisper quietly; no extra line or explanatory monologue.' : CAST_DIRECTION[speaker]?.direction,
        status: 'awaiting_acted_recording', approved: false, path: null });
    }
  }
  return slots;
}

export function buildChapterOneVoicePlan(scripts) {
  return {
    version: 1, chapter: 'chapter_1_v3', title: 'Следы в лесу / Tracks in the Forest',
    status: 'awaiting_acted_recordings', playback: 'silent_until_reviewed',
    allowSystemSpeech: false, allowLegacyChapterOneClips: false, allowChapterZeroClipReuse: false,
    requirements: ['No actor or celebrity cloning without permission.',
      'Review acting per line: emotion, sarcasm, genuine laughter, fear and whispered delivery.',
      'Avoid robotic cadence, identical pacing and awkward pauses inside sentences.',
      'Recordings must match the new script and the current canon ages.',
      'Music and environmental SFX are independent of dialogue voice availability.'],
    cast: CAST_DIRECTION, slots: collectChapterOneVoiceSlots(scripts)
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const scripts = JSON.parse(fs.readFileSync(new URL('assets/chapter1-scripts.json', root), 'utf8'));
  const plan = buildChapterOneVoicePlan(scripts);
  if (!plan.slots.length) throw new Error('New Chapter 1 is not available; refusing to create an empty recording plan.');
  const output = new URL('assets/chapter1-voice-plan.json', root);
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n');
  console.log(`Prepared ${plan.slots.length} pending acted-voice slots; no audio was synthesized.`);
}
