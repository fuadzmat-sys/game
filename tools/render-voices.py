"""Rebuild preserved Chapter 0 legacy neural files; never Chapter 1 final voices.

Requires sherpa-onnx==1.12.30, soundfile and FFmpeg with rubberband.
Run collect-voice-lines.mjs first. Model folders live outside the delivered game.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time

MODELS = {
    'ru_male_light': 'vits-piper-ru_RU-denis-medium',
    'ru_male_warm': 'vits-piper-ru_RU-dmitri-medium',
    'ru_female': 'vits-piper-ru_RU-irina-medium',
    'en_male_medium': 'vits-piper-en_US-ryan-medium',
    'en_female': 'vits-piper-en_US-amy-medium',
}
# Pitch and formant are independent ratios, avoiding the sped-up chipmunk effect.
CAST = {
    'gideon': ('light', 1.28, 1.09, 1.03),
    'dipper': ('warm', 1.00, 1.00, 1.00),
    'pacifica': ('female', 1.14, 1.05, 1.04),
    'mabel': ('female', 1.07, 1.02, .98),
    'wendy': ('female', .96, .99, 1.02),
    'soos': ('warm', .96, .99, .95),
    'robbie': ('light', 1.07, 1.02, 1.00),
    'bud': ('warm', .92, .98, .97),
    'preston': ('light', .98, 1.00, .99),
    'priscilla': ('female', 1.00, 1.00, .99),
    'candy': ('female', 1.19, 1.07, 1.07),
    'grenda': ('female', .91, .98, 1.00),
    'nicole': ('female', 1.01, 1.00, 1.04),
    'will': ('light', 1.23, 1.06, 1.00),
    'mothman': ('warm', .94, .99, .97),
    'darwin': ('light', 1.32, 1.10, 1.03),
    'gumball': ('light', 1.26, 1.08, 1.06),
    'toby': ('light', .99, 1.00, 1.01),
    'scot': ('light', 1.09, 1.03, 1.00),
    'blubs': ('warm', .91, .98, .97),
    'mallardarty': ('warm', .95, 1.00, .98),
    'ducktective': ('light', 1.04, 1.00, 1.00),
    'constable': ('warm', 1.00, 1.00, 1.00),
    'arcade_owner': ('warm', .97, 1.00, 1.01),
    'cashier': ('light', 1.01, 1.00, 1.00),
    'customer_1': ('warm', .99, 1.00, .99),
    'customer_2': ('female', 1.03, 1.00, 1.01),
    'crowd': ('light', 1.00, 1.00, 1.03),
    'narrator': ('light', 1.00, 1.00, 1.00),
}

def profile(line):
    speaker = line['speaker'].strip().lower() or 'narrator'
    role, pitch, formant, speed = CAST.get(speaker, CAST['narrator'])
    model = ('ru_female' if role == 'female' else 'ru_male_' + role) if line['language'] == 'russian' else ('en_female' if role == 'female' else 'en_male_medium')
    return {'model': model, 'pitch': pitch, 'formant': formant, 'speed': speed, 'speaker': speaker}

def render_group(model_key, lines, model_root, project_root):
    import sherpa_onnx
    import soundfile as sf
    import numpy as np
    folder = Path(model_root) / MODELS[model_key]
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(next(folder.glob('*.onnx'))), tokens=str(folder / 'tokens.txt'),
                data_dir=str(folder / 'espeak-ng-data'), noise_scale=.6, noise_scale_w=.7),
            num_threads=1, provider='cpu', debug=False), max_num_sentences=1)
    if not config.validate(): raise RuntimeError(f'Invalid model {folder}')
    tts = sherpa_onnx.OfflineTts(config)
    entries = {}
    start = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='reverse-falls-voice-') as temporary:
        raw = Path(temporary) / 'line.wav'
        for index, line in enumerate(lines):
            p = profile(line)
            digest = hashlib.sha256((line['key'] + json.dumps(p, sort_keys=True) + '|neural-v1').encode()).hexdigest()[:20]
            relative = f"assets/voices/{line['language']}/{p['speaker']}/{digest}.mp3"
            output = Path(project_root) / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            valid = False
            if output.exists():
                try:
                    existing = json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_entries','format=duration','-of','json',str(output)]))
                    valid = float(existing['format']['duration']) > 0
                except (subprocess.CalledProcessError, KeyError, ValueError):
                    valid = False
            if not valid:
                spoken = line['text'].replace('№', 'номер ')
                silent = not any(char.isalnum() for char in spoken)
                if not silent:
                    audio = tts.generate(spoken, sid=0, speed=p['speed'])
                    if audio.sample_rate <= 0 or len(audio.samples) == 0: raise RuntimeError(f'No audio: {line["key"]}')
                    sr = audio.sample_rate
                    samples = audio.samples
                else:
                    sr = 22050
                    samples = np.zeros(round(sr * .4), dtype=np.float32)
                sf.write(raw, samples, sr, subtype='PCM_16')
                filters = []
                if p['formant'] != 1:
                    filters += [f"asetrate={round(sr*p['formant'])}", f'aresample={sr}', f"atempo={1/p['formant']:.7f}"]
                shift = p['pitch'] / p['formant']
                if abs(shift-1) > .001:
                    filters += [f'rubberband=pitch={shift:.7f}:formant=preserved:pitchq=quality']
                filters += ['highpass=f=55', 'loudnorm=I=-19:TP=-2:LRA=9', f'aresample={sr}']
                # Loudness normalization has undefined gain for an intentional
                # silent ellipsis. Encode these short pauses without processing.
                if silent:
                    filters = ['anull']
                temporary_output = output.with_suffix('.tmp.mp3')
                subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(raw),'-af',','.join(filters),'-codec:a','libmp3lame','-b:a','64k',str(temporary_output)], check=True)
                temporary_output.replace(output)
            info = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(output)]))
            duration = float(info['format']['duration'])
            entries[line['key']] = {'path': relative, 'text': line['text'], 'speaker': line['speaker'], 'duration': round(duration, 3)}
            if index % 25 == 0 or index+1 == len(lines):
                print(f'{model_key}: {index+1}/{len(lines)} ({time.monotonic()-start:.0f}s)', flush=True)
    return entries

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lines', required=True)
    parser.add_argument('--models', required=True)
    parser.add_argument('--languages', nargs='+', default=['russian','english'])
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    lines = [line for line in json.loads(Path(args.lines).read_text()) if line['language'] in args.languages]
    # An acted-voice plan is a different input type and must never be silently
    # turned into old synthetic profiles for the rewritten chapter.
    if any(line.get('chapter', 0) != 0 or 'chapter_1' in line.get('script', '') for line in lines):
        raise ValueError('The legacy renderer supports Chapter 0 only. Chapter 1 awaits reviewed acted recordings.')
    groups = {}
    for line in lines: groups.setdefault(profile(line)['model'], []).append(line)
    manifest = {'version': 1, 'scope': 'chapter_0', 'languages': args.languages, 'engine': 'Piper VITS / sherpa-onnx 1.12.30', 'profiles': {}, 'lines': {}}
    for line in lines: manifest['profiles'].setdefault(line['language'], {})[line['speaker'].strip().lower() or 'narrator'] = profile(line)
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        jobs = [pool.submit(render_group, model, grouped, args.models, root) for model, grouped in groups.items()]
        for job in concurrent.futures.as_completed(jobs): manifest['lines'].update(job.result())
    manifest['lines'] = dict(sorted(manifest['lines'].items()))
    path = root / 'assets/voices/manifest.json'
    path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',',':')) + '\n')
    print(f'Wrote {len(manifest["lines"])} recordings to {path}', flush=True)

if __name__ == '__main__': main()
