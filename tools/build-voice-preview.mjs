// Package actual, unreviewed voice probes as a portable offline listening page.
// Usage: node tools/build-voice-preview.mjs --input preview-index.json --output voice-previews
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const CAST = {
  Gideon: { name: 'Гидеон', age: 12, stem: 'gideon', direction: 'Спокойный, наблюдательный мальчик. Сухой сарказм и сдержанные эмоции.' },
  Pacifica: { name: 'Пасифика', age: 14, stem: 'pacifica', direction: 'Смелая и энергичная девочка-подросток. Живая, уверенная речь.' }
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty text`);
  return value;
}

function audioFile(value, extension, inputDirectory) {
  const source = nonempty(value, `${extension} file`);
  if (source.includes('\0') || source.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(source) || source.split('/').includes('..')) throw new Error(`Unsafe audio path: ${source}`);
  const real = fs.realpathSync(path.resolve(inputDirectory, source));
  const relative = path.relative(inputDirectory, real);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error(`Audio must be inside the input directory: ${source}`);
  if (!fs.statSync(real).isFile() || path.extname(real).toLowerCase() !== `.${extension}`) throw new Error(`Expected an existing .${extension} file: ${source}`);
  const handle = fs.openSync(real, 'r'), header = Buffer.alloc(12);
  let length;
  try { length = fs.readSync(handle, header, 0, 12, 0); } finally { fs.closeSync(handle); }
  const valid = extension === 'wav'
    ? length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE'
    : length >= 3 && (header.toString('ascii', 0, 3) === 'ID3' || header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
  if (!valid) throw new Error(`File does not have an ${extension.toUpperCase()} header: ${source}`);
  return real;
}

function parseVoice(row, inputDirectory) {
  if (!object(row) || !Object.hasOwn(CAST, row.speaker)) throw new Error('Only Gideon and Pacifica are supported in this preview');
  const actor = CAST[row.speaker];
  if (row.age !== undefined && row.age !== actor.age) throw new Error(`Incorrect canon age for ${row.speaker}`);
  if (!Array.isArray(row.samples) || !row.samples.length) throw new Error(`${row.speaker} has no transcript samples`);
  const samples = row.samples.map((sample, index) => {
    const data = typeof sample === 'string' ? { text: sample } : sample;
    if (!object(data)) throw new Error(`Invalid transcript sample ${index + 1}`);
    const text = nonempty(data.text, 'Sample transcript');
    return { text, ...(typeof data.direction === 'string' ? { direction: data.direction } : {}) };
  });
  const anchorText = nonempty(row.anchorText, `${row.speaker} anchorText`);
  if (![samples.map(sample => sample.text).join(' '), samples.map(sample => sample.text).join('\n')].includes(anchorText)) throw new Error(`${row.speaker} anchorText does not match its sample transcripts`);
  const sources = { mp3: audioFile(row.mp3 ?? row.mp3Path, 'mp3', inputDirectory) };
  if (row.wav !== undefined && row.wav !== null || row.wavPath !== undefined) sources.wav = audioFile(row.wav ?? row.wavPath, 'wav', inputDirectory);
  const duration = row.duration === undefined ? null : Number(row.duration);
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) throw new Error(`Invalid duration for ${row.speaker}`);
  return {
    sources,
    data: {
      speaker: row.speaker, name: actor.name, age: actor.age,
      status: 'unreviewed_preview', approved: false,
      description: typeof row.description === 'string' ? row.description : '',
      anchorText, samples, mp3: `${actor.stem}.mp3`,
      ...(sources.wav ? { wav: `${actor.stem}.wav` } : {}),
      ...(duration !== null ? { duration } : {})
    }
  };
}

function card(voice) {
  const actor = CAST[voice.speaker];
  const duration = voice.duration ? `${new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(voice.duration)} с` : '';
  return `<article class="voice-card" aria-labelledby="${actor.stem}-title">
      <div class="card-top"><p class="eyebrow">Самостоятельный голос</p><span class="age">${actor.age} лет</span></div>
      <h2 id="${actor.stem}-title">${actor.name}</h2>
      <p class="direction">${actor.direction}</p>
      <audio controls preload="none" aria-label="Прослушать пробу: ${actor.name}"><source src="${voice.mp3}" type="audio/mpeg">Твой браузер не поддерживает аудиоплеер. Скачай MP3 ниже.</audio>
      <div class="downloads"><a href="${voice.mp3}" download>Скачать MP3</a>${voice.wav ? `<a href="${voice.wav}" download>Скачать WAV</a>` : ''}${duration ? `<span>${duration}</span>` : ''}</div>
      <h3>Текст пробы</h3>
      <ol class="transcripts">${voice.samples.map(sample => `<li>${escape(sample.text)}</li>`).join('')}</ol>
    </article>`;
}

function renderPreviewPage(voices) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Reverse Falls — пробы голосов</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#091321;color:#e7eff6}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 80% 0,#173b50a0,transparent 60%)}main{max-width:1120px;margin:auto;padding:52px 24px 36px}.eyebrow{margin:0;color:#8bc6da;font-size:.78rem;font-weight:650;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(2rem,5vw,3.25rem);font-weight:550;line-height:1.12;margin:16px 0 18px}header>p:not(.eyebrow){max-width:800px;color:#b7cad8;line-height:1.65;margin:12px 0}.status{display:inline-block;background:#29453e;color:#d4eddc;padding:8px 12px;border-radius:6px;font-size:.88rem}.voices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:32px}.voice-card{padding:26px;background:#102333d9;border:1px solid #355568;border-radius:15px;min-width:0}.card-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.age{color:#c2dae7;font-size:.9rem;white-space:nowrap}h2{font-size:1.9rem;font-weight:550;margin:15px 0 10px}.direction{color:#b4c9d6;line-height:1.55;min-height:3.1em;margin:0 0 20px}audio{display:block;width:100%;margin-top:16px}.downloads{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:13px 0 28px;font-size:.85rem}.downloads span{margin-left:auto;color:#a3bac8}a{color:#b4e5f6;text-underline-offset:4px}a:hover{color:white}a:focus-visible{outline:3px solid #cdf5ff;outline-offset:5px}h3{font-size:.83rem;text-transform:uppercase;letter-spacing:.08em;color:#87b8cd;margin:0 0 16px}.transcripts{margin:0;padding-left:1.4em;color:#dfebf1;line-height:1.7}.transcripts li{padding-left:5px;margin-bottom:14px;white-space:pre-wrap}.transcripts li::marker{color:#77a9be}footer{margin-top:28px;font-size:.87rem;color:#9bb2c1;line-height:1.6}@media(max-width:760px){main{padding:32px 16px}.voices{grid-template-columns:1fr}.voice-card{padding:22px}.direction{min-height:0}}
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">Reverse Falls · Глава 1</p>
      <h1>Пробы голосов</h1>
      <span class="status">Экспериментальные пробы · ещё не финальная озвучка</span>
      <p>Два самостоятельных голоса для Гидеона и Пасифики. Они созданы по описанию персонажей, без использования голосовых записей актёров оригинала.</p>
      <p>В каждой записи подряд звучат три фрагмента главы. Послушай естественность речи, возраст и интонации; пока эти пробы не включены в игру.</p>
    </header>
    <section class="voices" aria-label="Пробы персонажей">
      ${voices.map(card).join('\n      ')}
    </section>
    <footer>Страница и записи работают из одной распакованной папки. Интернет и установка голосов для прослушивания не нужны. Записи запускаются только кнопкой плеера.</footer>
  </main>
  <script>
    const players = Array.from(document.querySelectorAll('audio'));
    for (const player of players) player.addEventListener('play', () => {
      for (const other of players) if (other !== player) other.pause();
    });
  </script>
</body>
</html>
`;
}

export function buildVoicePreview({ input, output }) {
  const inputPath = fs.realpathSync(path.resolve(nonempty(input, '--input')));
  const inputDirectory = path.dirname(inputPath), outputDirectory = path.resolve(nonempty(output, '--output'));
  if (outputDirectory === inputDirectory) throw new Error('Use a separate output directory to preserve the original render report');
  const index = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!object(index) || !Array.isArray(index.voices) || index.voices.length !== 2) throw new Error('The index must contain two rendered voice probes');
  const voices = index.voices.map(row => parseVoice(row, inputDirectory));
  if (new Set(voices.map(voice => voice.data.speaker)).size !== 2) throw new Error('The preview needs one Gideon and one Pacifica probe');
  voices.sort((a, b) => Object.keys(CAST).indexOf(a.data.speaker) - Object.keys(CAST).indexOf(b.data.speaker));
  // Validate every source before writing any page or player into the package.
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const voice of voices) for (const [format, source] of Object.entries(voice.sources)) {
    const destination = path.join(outputDirectory, voice.data[format]);
    const temporary = path.join(outputDirectory, `.${randomUUID()}.tmp`);
    try { fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL); fs.renameSync(temporary, destination); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  const metadata = { version: 1, status: 'unreviewed_voice_probes', approved: false, integratedIntoGame: false, voices: voices.map(voice => voice.data) };
  fs.writeFileSync(path.join(outputDirectory, 'preview-index.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), renderPreviewPage(metadata.voices));
  return { directory: outputDirectory, page: path.join(outputDirectory, 'index.html'), voices: metadata.voices.length, audioFiles: voices.reduce((total, voice) => total + Object.keys(voice.sources).length, 0) };
}

function main(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!['--input', '--output'].includes(flag) || !value || value.startsWith('--')) throw new Error('Usage: node tools/build-voice-preview.mjs --input preview-index.json --output voice-previews');
    options[flag.slice(2)] = value;
  }
  return buildVoicePreview(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)))); }
  catch (error) { console.error(`Voice preview build failed: ${error.message}`); process.exitCode = 2; }
}
