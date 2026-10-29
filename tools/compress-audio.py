#!/usr/bin/env python3
"""Replace exported WAVs with FLAC only after comparing every decoded PCM sample.

Run from any directory: python3 tools/compress-audio.py [--workers 4]
Requires ffmpeg and ffprobe. Original uploaded game files are not touched.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'assets' / 'manifest.json'


def command(*args: str) -> str:
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    return result.stdout.strip()


def audio_properties(path: Path) -> tuple[str, int]:
    data = json.loads(command('ffprobe', '-v', 'error', '-select_streams', 'a:0',
                              '-show_entries', 'stream=sample_rate,channels',
                              '-of', 'json', str(path)))['streams'][0]
    return data['sample_rate'], data['channels']


def pcm_hash(path: Path) -> str:
    # 32-bit signed little endian preserves all samples in the exported 16-bit WAVs.
    # A codec that cannot preserve an input sample will fail this comparison.
    return command('ffmpeg', '-v', 'error', '-nostdin', '-threads', '1', '-i', str(path),
                   '-map', '0:a:0', '-c:a', 'pcm_s32le', '-threads', '1',
                   '-f', 'hash', '-hash', 'sha256', '-')


def convert(relative: str) -> dict:
    source = (ROOT / relative).resolve()
    audio_dir = (ROOT / 'assets' / 'audio').resolve()
    if source.parent != audio_dir or source.suffix.lower() != '.wav':
        raise ValueError(f'Expected an exported WAV inside assets/audio: {relative}')
    destination = source.with_suffix('.flac')
    result = {'source': relative, 'destination': destination.relative_to(ROOT).as_posix(),
              'before_bytes': source.stat().st_size, 'pcm_encoding': 'signed-32-bit-little-endian'}
    fd, temporary_name = tempfile.mkstemp(prefix=source.stem + '-', suffix='.flac', dir=audio_dir)
    import os
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-threads', '1',
                        '-i', str(source), '-map', '0:a:0', '-map_metadata', '-1',
                        '-c:a', 'flac', '-compression_level', '8', '-threads', '1',
                        str(temporary)], check=True, capture_output=True, text=True)
        if audio_properties(source) != audio_properties(temporary):
            raise ValueError('Sample rate or channel count changed')
        before_hash, after_hash = pcm_hash(source), pcm_hash(temporary)
        if before_hash != after_hash:
            raise ValueError('Decoded PCM samples differ')
        result.update(pcm_sha256=before_hash.split('=', 1)[1],
                      after_bytes=temporary.stat().st_size, verified=True)
        if result['after_bytes'] >= result['before_bytes']:
            result.update(keep_wav=True, reason='FLAC is not smaller')
            return result
        if destination.exists():
            # Do not overwrite any existing destination without checking its audio.
            if audio_properties(destination) != audio_properties(source) or pcm_hash(destination) != before_hash:
                raise ValueError('Existing FLAC destination contains different audio')
            result['after_bytes'] = destination.stat().st_size
        else:
            temporary.replace(destination)
        return result
    except (subprocess.SubprocessError, OSError, ValueError) as error:
        result.update(verified=False, keep_wav=True, reason=str(error))
        return result
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.workers <= 4:
        parser.error('--workers must be between 1 and 4')
    for program in ('ffmpeg', 'ffprobe'):
        if not shutil.which(program):
            parser.error(f'{program} is required')
    initial = json.loads(MANIFEST.read_text(encoding='utf-8'))
    sources = sorted({row['path'] for row in initial['audio'].values()
                      if Path(row['path']).suffix.lower() == '.wav'})
    if not sources:
        print('No WAV entries remain in the manifest; nothing to convert.')
        return
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(convert, path): path for path in sources}
        for future in as_completed(futures):
            results.append(future.result())
            if len(results) % 50 == 0 or len(results) == len(sources):
                print(f'Checked {len(results)}/{len(sources)} clips', flush=True)
    replacements = {r['source']: r['destination'] for r in results
                    if r.get('verified') and not r.get('keep_wav')}
    # Re-read immediately before updating; other asset sections must be preserved.
    latest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for row in latest['audio'].values():
        if row['path'] in replacements:
            row['path'] = replacements[row['path']]
    pending = MANIFEST.with_name('manifest.audio-update.json')
    pending.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    pending.replace(MANIFEST)
    retained = {row['path'] for row in latest['audio'].values()}
    for old in replacements:
        if old not in retained:
            (ROOT / old).unlink()
    report_path = ROOT / 'tools' / 'audio-conversion-report.json'
    if report_path.exists():
        previous = json.loads(report_path.read_text(encoding='utf-8'))
        merged = {row['source']: row for row in previous.get('clips', [])}
        merged.update({row['source']: row for row in results})
        results = list(merged.values())
    results.sort(key=lambda r: r['source'])
    all_replacements = {row['source'] for row in results if row.get('verified') and not row.get('keep_wav')}
    before = sum(r['before_bytes'] for r in results)
    after = sum(r.get('after_bytes', r['before_bytes'])
                if r['source'] in all_replacements else r['before_bytes'] for r in results)
    report = {'checked': len(results), 'converted': len(all_replacements),
              'retained_wav': len(results) - len(all_replacements),
              'before_bytes': before, 'after_bytes': after, 'clips': results}
    (ROOT / 'tools' / 'audio-conversion-report.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'clips'}, indent=2))
    for row in results:
        if row.get('keep_wav'):
            print('Retained WAV:', row['source'], row.get('reason', 'FLAC is not smaller'))


if __name__ == '__main__':
    main()
