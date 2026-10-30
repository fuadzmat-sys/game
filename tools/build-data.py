"""Package original extracted data as a classic script for offline browser use."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
data={name:json.loads((root/'assets'/f'{name}.json').read_text()) for name in ['manifest','config','scripts']}
chapter_one_path=root/'assets'/'chapter1-scripts.json'
if chapter_one_path.exists():
    chapter_one=json.loads(chapter_one_path.read_text())
    if not all(key.startswith(('textes/russian/chapter_1_v3/', 'textes/english/chapter_1_v3/')) for key in chapter_one):
        raise ValueError('Only the canonical Chapter 1 v3 may be included in the browser build')
    if set(chapter_one).intersection(data['scripts']):
        raise ValueError('Chapter 1 must not overwrite original chapter 0 resources')
    data['scripts'].update(chapter_one)
chapter_art_path=root/'assets'/'chapter1-art.json'
if chapter_art_path.exists():
    data['chapter1Art']=json.loads(chapter_art_path.read_text())
chapter_two_path=root/'assets'/'chapter2-scripts.json'
if chapter_two_path.exists():
    chapter_two=json.loads(chapter_two_path.read_text())
    if not all(key.startswith(('textes/russian/chapter_2/', 'textes/english/chapter_2/')) for key in chapter_two):
        raise ValueError('Chapter 2 resources must stay in their registered namespace')
    if set(chapter_two).intersection(data['scripts']):
        raise ValueError('Chapter 2 must not overwrite earlier chapters')
    data['scripts'].update(chapter_two)
for field,filename in [('chapter2Art','chapter2-art.json'),('chapter2Audio','chapter2-audio.json')]:
    path=root/'assets'/filename
    if path.exists(): data[field]=json.loads(path.read_text())
chapter_three_path=root/'assets'/'chapter3-scripts.json'
if chapter_three_path.exists():
    chapter_three=json.loads(chapter_three_path.read_text())
    if not all(key.startswith(('textes/russian/chapter_3/', 'textes/english/chapter_3/')) for key in chapter_three):
        raise ValueError('Chapter 3 resources must stay in their registered namespace')
    if set(chapter_three).intersection(data['scripts']):
        raise ValueError('Chapter 3 must not overwrite earlier chapters')
    data['scripts'].update(chapter_three)
chapter_three_art=root/'assets'/'chapter3-art.json'
if chapter_three_art.exists(): data['chapter3Art']=json.loads(chapter_three_art.read_text())
voices_path=root/'assets'/'voices'/'manifest.json'
if voices_path.exists():
    data['voices']=json.loads(voices_path.read_text())
(root/'data.js').write_text('window.REVERSE_FALLS_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
print('Packed data.js:',(root/'data.js').stat().st_size,'bytes')
