"""Compile complete bilingual Chapter 2 into the existing story interpreter format.

Narrative sources are authored JSON paragraphs; no C0/C1 text is modified.
Choices, scene entrances and sparse staging stay declarative in this compiler.
"""
from __future__ import annotations
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NS='chapter_2/'
ORDER=['start','two_tracks','trail_largetracks','trail_journal','trail_perimeter','watch_hut','rock_hollow','hidden_shelter','real_picture','real_threat','plan_distract','plan_block','plan_protect','water_climax','creature_question','fate_help','fate_expel','fate_neutralize','symbol']
NEXT={'start':'two_tracks',**{f'trail_{x}':'watch_hut' for x in ['largetracks','journal','perimeter']},'watch_hut':'rock_hollow','rock_hollow':'hidden_shelter','hidden_shelter':'real_picture','real_picture':'real_threat',**{f'plan_{x}':'water_climax' for x in ['distract','block','protect']},'water_climax':'creature_question',**{f'fate_{x}':'symbol' for x in ['help','expel','neutralize']}}
CHOICES={
 'two_tracks': [('Крупные следы','Follow the larger tracks','trail_largetracks'),('Сравнить с Дневником','Compare with the journal','trail_journal'),('Осмотреть периметр','Inspect the perimeter','trail_perimeter')],
 'real_threat':[('Отвлечь Хищника','Distract the predator','plan_distract'),('Перекрыть проход решёткой','Block the passage','plan_block'),('Держаться вместе и защитить собаку','Stay together and protect the dog','plan_protect')],
 'creature_question':[('Помочь и сохранить его тайну','Help and keep its secret','fate_help'),('Потребовать уйти из округи','Require it to leave the area','fate_expel'),('Установить строгие границы','Set strict boundaries','fate_neutralize')]
}
SELECTORS={**{f'trail_{slug}':('trail_focus',value)for slug,value in [('largetracks','LargeTracks'),('journal','Journal'),('perimeter','Perimeter')]},**{f'plan_{slug}':('threat_plan',value)for slug,value in [('distract','Distract'),('block','Block'),('protect','Protect')]},**{f'fate_{slug}':('creature_fate',value)for slug,value in [('help','Help'),('expel','Expel'),('neutralize','Neutralize')]}}
PAIR=['char showi Gideon left scale 1','char showi Pacifica right flip left scale 1','expression Gideon idle transition 0','expression Pacifica smile transition 0']
TENSE_PAIR=PAIR[:-1]+['expression Pacifica fighting transition 0']
COMMON=['item hide','effect clear','fx clear','camera preset normal duration .8']
STAGING={
 'start':['scene chapter_2','char hidei Gideon Pacifica Will Mabel Dipper Creature Predator Dog SmallDog Cat','BG change ch1_diner time 1','music conversation_1 fade .8','ambience stop','fx cafe_warm','sfx bell','item give journal_3']+PAIR,
 'two_tracks':COMMON+['BG change ch1_road time 1.2','music forest_day_1 crossfade fade 1','ambience forest_day','fx forest_wind']+PAIR,
 'watch_hut':COMMON+['BG change ch2_watch_hut_interior time 1.2','music curious crossfade fade 1','ambience forest_tension','fx dust','sfx ch2_wood_creak']+PAIR,
 'rock_hollow':COMMON+['BG change ch2_rock_hollow time 1.2','music stop fade .8','ambience forest_tension','char hidei Creature Predator Dog']+PAIR,
 'hidden_shelter':COMMON+['BG change ch2_hidden_shelter time 1.2','music curious fade .8','ambience forest_day','char hidei Predator']+PAIR+['char showi Creature center scale 1','expression Creature calmer transition .3','char showi Dog leftsecond scale .75'],
 'real_picture':COMMON+['BG change ch1_deep_forest time 1.3','music curious crossfade fade .8','ambience forest_day','char hidei Creature Dog SmallDog Cat Predator']+PAIR,
 'real_threat':COMMON+['BG change ch2_drainage_tunnel time 1.4','music curious fade 1','ambience ch2_tunnel','fx dark_vignette','char hidei Creature Dog SmallDog Cat Predator']+TENSE_PAIR,
 'water_climax':['item hide','music curious crossfade fade .6','ambience ch2_tunnel','fx dark_vignette']+TENSE_PAIR+['char showi Predator center scale .9','expression Predator aggressive transition .25'],
 'creature_question':COMMON+['BG change ch2_hidden_shelter time 1.5','music forest_day_1 crossfade fade 1','ambience road_night','char hidei Predator','char showi Creature center scale 1','expression Creature listening transition .3']+PAIR,
 'fate_help':['expression Creature calmer transition .3'],
 'fate_expel':['expression Creature defensive transition .3'],
 'fate_neutralize':['expression Creature distrustful transition .3'],
 'symbol':COMMON+['BG change ch1_road time 1.5','music forest_day_1 crossfade fade 1','ambience road_night','char hidei Creature Predator Dog SmallDog Cat']+PAIR,
}
CUES={
 'cup':['sfx ch2_cup'], 'bell':['sfx bell'], 'small_tracks':['camera zoom 1.035 duration .8'], 'door_creak':['sfx ch2_wood_creak'], 'animals_reveal':['char showi Dog leftsecond scale .75'],
 'will_mention':['camera zoom 1.035 duration 1','music conversation_1 volume .3 fade .5'],
 'twig':['music stop fade .8','sfx branch_crack','wait .6'],
 'silhouette':['char showi Creature rightsecond scale .92','expression Creature silhouette transition 0','wait .4','char hidei Creature'],
 'creature_reveal':['char showi Creature center scale 1','expression Creature neutral transition .4','camera zoom 1.04 duration .8'],
 'mimic_buster':['music stop fade 1','sfx ch2_mimic_buster'],
 'stream':['ambience ch2_stream','BG change ch1_tracks time 1'],
 'drainage_entrance':['BG change ch2_drainage_entrance time 1.2','ambience ch2_stream','camera zoom 1.04 duration .9'],
 'mimic_pacifica':['music stop fade .8','sfx ch2_mimic_pacifica'],
 'mimic_gideon':['sfx ch2_mimic_gideon'],
 'predator_eyes':['char showi Predator center moveaddi 320 scale .9','expression Predator eyes transition .2','music stop fade .6'],
 'predator_reveal':['char showi Predator center scale .9','expression Predator crouched transition .35','camera zoom 1.04 duration 1'],
 'metal':['sfx ch2_metal_grate'], 'dog_whine':['sfx dog_whine'],
 'valve':['sfx ch2_valve'],
 'rushing_water':['sfx ch2_water_rush','camera shake small duration .25'],
 'predator_retreat':['expression Predator recoiling transition .2','char hide Predator from outleft duration .6','music stop fade 1'],
 'symbol_reveal':['music stop fade 1.4','item show symbol_ch2_unknown_provisional','camera zoom 1.045 duration 1.6'],
}
EMOTIONS={
 'Pacifica':{'neutral':'idle','confident':'smile_aggressive','annoyed':'annoyed','amused':'laugh','suspicious':'curious','concentrated':'curious','focused':'curious','surprised':'surprised','worried':'upset','afraid':'scared','embarrassed':'embarrassed','serious':'fighting','reflective':'upset','small_smile':'smile'},
 'Gideon':{'neutral':'idle','deadpan':'idle','amused':'smile','annoyed':'annoyed','skeptical':'idle','focused':'idle','concerned':'upset','afraid':'scared','surprised':'surprised','serious':'idle','stressed':'annoyed_obvious'},
}
def command(text):return f'[{text}]'
def load():
 resources={}
 for filename in ['chapter2-content-part1.json','chapter2-content-part2.json']:
  data=json.loads((ROOT/'tools'/filename).read_text(encoding='utf-8'))
  for key,value in data['resources'].items():
   if key in resources:raise ValueError(f'Duplicate Chapter2 resource: {key}')
   resources[key]=value
 if set(resources)!=set(ORDER):raise ValueError(f'Chapter2 resources mismatch: {set(resources)^set(ORDER)}')
 return resources

def build():
 resources=load();scripts={};counts={};unknown_cues=set();voice_plan=[]
 for language,key in [('russian','ru'),('english','en')]:
  for name in ORDER:
   source=resources[name];parts=[command(x)for x in STAGING.get(name,[])]
   if name in SELECTORS:
    selector,value=SELECTORS[name];parts.insert(0,command(f'Choice {selector} {value}'))
   for row in source['rows']:
    speaker=row['speaker'];text=row.get(key,'').strip()
    if not text:raise ValueError(f'Missing {language} paragraph in {name}')
    if '[' in text or ']' in text or '\n' in text:raise ValueError(f'Literal engine command in narrative {name}')
    commands=[]
    cue=row.get('cue')
    if cue == 'mimic_pacifica' and name == 'real_threat':
     commands.append('sfx ch2_mimic_pacifica_here'); cue=None
    if cue:
     cue_list=cue if isinstance(cue,list)else[cue]
     for c in cue_list:
      if c not in CUES:unknown_cues.add(c)
      else:commands.extend(CUES[c])
    emotion=row.get('emotion')
    if emotion:
     expr=EMOTIONS.get(speaker,{}).get(emotion,emotion)
     commands.append(f'expression {speaker} {expr} transition .18')
    condition=row.get('when')
    if condition:
     flag=condition['flag'];value=condition['equals']
     if not re.fullmatch(r'[a-z][a-z0-9_]*',flag) or not re.fullmatch(r'[A-Za-z0-9_]+',str(value)):raise ValueError('Invalid paragraph condition')
     parts.append(command(f'when {flag} {value}')+''.join(command(x)for x in commands)+command(speaker)+text)
    else:
     parts.extend(command(x)for x in commands);parts.extend([command(speaker),text])
   if name in CHOICES:
    parts.extend([command('item hide'),command('Choice importance important')])
    for i,(ru,en,target)in enumerate(CHOICES[name],1):parts.extend([command(f'Button text {i} {ru if key=="ru"else en}'),command(f'Button order {i} next {NS}{target}')])
    parts.append(command('stop'))
   elif name=='symbol':
    parts.extend(command(x)for x in ['char hidei Gideon Pacifica Creature Predator Dog SmallDog Cat','music stop fade 1.5','ambience road_night','item show symbol_ch2_unknown_provisional','camera zoom 1.06 duration 1.8','wait 2','stop','scene credits'])
   else:parts.append(command(f'next {NS}{NEXT[name]}'))
   resource=f'textes/{language}/{NS}{name}';scripts[resource]='\n\n'.join(parts)+'\n'
   # The interpreter drops blank lines and records the zero-based cursor of the
   # paragraph, not its physical file line. Include guarded paragraphs too, so
   # future recordings can address every creature variant without text hashes.
   speaker='Narrator'
   for source_line,line in enumerate(x for x in scripts[resource].splitlines() if x):
    tags=re.findall(r'\[([^\]]+)\]',line)
    for tag in tags:
     if tag in {'Narrator','Pacifica','Gideon','Creature','Mimic'}:speaker=tag
    text=re.sub(r'\[[^\]]*\]','',line).strip()
    if text:
     slot={'script':NS+name,'language':language,'sourceLine':source_line,'speaker':speaker,'text':text,'status':'pending'}
     slot['key']=f'{language}|{NS}{name}|{source_line}|{speaker.lower()}'
     guard=next((tag.split()[1:] for tag in tags if tag.startswith('when ')),None)
     if guard:slot['when']={'flag':guard[0],'equals':' '.join(guard[1:])}
     voice_plan.append(slot)
   counts.setdefault(language,{'paragraphs':0,'words':0,'physicalLines':0})
   counts[language]['paragraphs']+=len(source['rows']);counts[language]['words']+=sum(len(re.findall(r"[\w]+(?:[’-][\w]+)*",row[key]))for row in source['rows']);counts[language]['physicalLines']+=len(scripts[resource].splitlines())
 if unknown_cues:print('Unmapped authored cues (text retained):',', '.join(sorted(unknown_cues)))
 (ROOT/'assets'/'chapter2-scripts.json').write_text(json.dumps(scripts,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (ROOT/'assets'/'chapter2-voice-plan.json').write_text(json.dumps({'version':2,'namespace':NS,'status':'pending-quality-voice-acting','lines':voice_plan},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 report={'resources':len(scripts),'scenes':9,'choices':3,'counts':counts,'provisional':['Intelligent Creature design','Predator design','Unknown Symbol design']}
 (ROOT/'assets'/'chapter2-build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False))
 return scripts
if __name__=='__main__':build()
