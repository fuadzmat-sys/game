"""Compile Chapter 3 source paragraphs into the existing bilingual VN interpreter."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1];NS='chapter_3/'
ORDER=['start','yard','first_talk','approach_direct','approach_bargain','approach_wait','waymarks','test_mark','test_listen','test_checkplans','cutting_floor','service_walk','bag','crossing','exit_holdgate','exit_guide','exit_securebag','night_gate']
NEXT={'start':'yard','yard':'first_talk',**{f'approach_{v}':'waymarks' for v in ['direct','bargain','wait']},**{f'test_{v}':'cutting_floor' for v in ['mark','listen','checkplans']},'cutting_floor':'service_walk','service_walk':'bag','bag':'crossing',**{f'exit_{v}':'night_gate' for v in ['holdgate','guide','securebag']}}
CHOICES={
 'first_talk':[('Спросить прямо','Ask directly','approach_direct'),('Предложить обмен','Offer a trade','approach_bargain'),('Не торопить и наблюдать','Wait and observe','approach_wait')],
 'waymarks':[('Отметить настоящий путь','Mark the actual path','test_mark'),('Послушать движение досок','Listen to the moving boards','test_listen'),('Сверить расположение проходов','Check the layout of the passages','test_checkplans')],
 'crossing':[('Вместе удержать ворота','Hold the gate together','exit_holdgate'),('Провести всех через настил','Guide everyone across','exit_guide'),('Закрепить сумку Венди','Secure Wendy’s bag','exit_securebag')]
}
SELECTORS={**{f'approach_{a}':('wendy_approach',b) for a,b in [('direct','Direct'),('bargain','Bargain'),('wait','Wait')]},**{f'test_{a}':('test_method',b) for a,b in [('mark','Mark'),('listen','Listen'),('checkplans','CheckPlans')]},**{f'exit_{a}':('exit_plan',b) for a,b in [('holdgate','HoldGate'),('guide','Guide'),('securebag','SecureBag')]}}
PAIR=['char showi Gideon left scale 1','char showi Pacifica right flip left scale 1','expression Gideon idle transition 0','expression Pacifica smile transition 0']
TRIO=['char showi Gideon left scale 1','char showi Pacifica center flip left scale 1','char showi Wendy right flip left scale 1']
RESET=['item hide','effect clear','fx clear','camera preset normal duration .8']
STAGING={
 'start':['scene chapter_3','char hidei Creature Predator Dog SmallDog Cat Will Mabel Dipper Wendy','BG change ch1_diner time 1','music conversation_1 fade .8','ambience stop','fx cafe_warm']+PAIR,
 'yard':RESET+['BG change ch3_lumber_yard time 1.2','music forest_day_1 crossfade fade 1','ambience forest_day','fx forest_wind']+PAIR,
 'first_talk':RESET+['BG change ch3_lumber_yard time 1','music conversation_1 crossfade fade .8','ambience forest_day','char show Wendy right from outright duration .55','char move Pacifica center duration .5','expression Wendy idle transition .2'],
 'waymarks':RESET+['BG change ch3_lumber_yard time 1','music curious crossfade fade 1','ambience forest_day']+TRIO,
 'cutting_floor':RESET+['BG change ch3_cutting_floor time 1.2','music curious crossfade fade .8','ambience forest_tension','fx dust']+TRIO,
 'service_walk':RESET+['BG change ch3_lumber_yard time 1.2','music stop fade .9','ambience forest_tension','fx forest_wind']+TRIO,
 'bag':RESET+['BG change ch3_lumber_yard time 1','music curious fade .8','ambience forest_tension']+TRIO,
 'crossing':RESET+['BG change ch3_cutting_floor time 1.2','music curious crossfade fade 1','ambience forest_tension','fx dark_vignette']+TRIO,
 'night_gate':RESET+['BG change ch3_lumber_yard time 1.6','music stop fade 1.2','ambience road_night','fx dark_vignette']+TRIO
}
CUES={
 'wood_knock':['sfx ch2_wood_creak'], 'timber_slide':['sfx ch2_wood_creak','wait .3'],
 'approach':['ambience forest_tension','sfx forest_wind'], 'forest_reveal':['BG change ch1_deep_forest time 1.5','fx mirror_distortion','camera zoom 1.035 duration 1.3'],
 'bell':['sfx bell'], 'wood_shift':['sfx ch2_wood_creak','wait .35'], 'wood_creak':['sfx ch2_wood_creak'],
 'gate_slam':['sfx ch2_metal_grate','anim Pacifica recoil','anim Gideon step_back','wait .3'],
 'bag_glimpse':['camera zoom 1.035 duration 1'], 'object_reveal':['item show ch3_wooden_weight','camera zoom 1.04 duration 1.1','wait .4'],
 'object_hide':['item hide'], 'real_warning':['expression Gideon scared transition .15','anim Gideon step_forward','music stop fade .6'],
 'escape':['anim Pacifica step_back','anim Wendy step_back'], 'floor_shift':['sfx ch2_wood_creak','camera shake small duration .2'],
 'wind':['sfx forest_wind'], 'branch_crack':['sfx branch_crack'], 'awkward_pause':['wait .45'],
 'wendy_laugh':['expression Wendy idle transition .2','anim Wendy lean_forward','wait .25'],
 'pacifica_laugh':['expression Pacifica laugh transition .2','anim Pacifica lean_forward'],
 'pacifica_flinch':['expression Pacifica scared transition .15','anim Pacifica recoil'],
 'gideon_warning':['expression Gideon scared transition .15','anim Gideon step_forward'],
 'silence':['music stop fade .8','wait .5'], 'bag_tug':['sfx ch2_wood_creak','anim Wendy recoil'],
 'cliffhanger':['music stop fade 1','fx mirror_distortion','sfx ch2_wood_creak','wait .7']
}
EMOTIONS={
 'Pacifica':{'neutral':'idle','confident':'smile_aggressive','annoyed':'annoyed','amused':'laugh','suspicious':'curious','focused':'curious','concentrated':'curious','surprised':'surprised','worried':'upset','afraid':'scared','embarrassed':'embarrassed','serious':'fighting','relieved':'smile','small_smile':'smile','reflective':'upset'},
 'Gideon':{'neutral':'idle','deadpan':'idle','amused':'smile','annoyed':'annoyed','skeptical':'idle','focused':'idle','concerned':'upset','afraid':'scared','surprised':'surprised','serious':'idle','stressed':'annoyed_obvious','embarrassed':'embarrassed'},
 'Wendy':{'neutral':'idle','lazy':'idle','smug':'idle','amused':'idle','laugh':'idle','annoyed':'annoyed','dismissive':'annoyed','suspicious':'annoyed','surprised':'upset','impressed':'idle','defensive':'annoyed','serious':'upset','afraid':'upset','embarrassed':'embarrassed'}
}
def cmd(s):return '['+s+']'
def build():
 resources={}
 for filename in ['chapter3-content-part1.json','chapter3-content-part2.json']:
  data=json.loads((ROOT/'tools'/filename).read_text())
  for k,v in data['resources'].items():
   if k in resources:raise ValueError('Duplicate source '+k)
   resources[k]=v
 if set(resources)!=set(ORDER):raise ValueError('Resources mismatch '+str(set(resources)^set(ORDER)))
 scripts={};counts={};slots=[];unknown=set()
 for language,key in [('russian','ru'),('english','en')]:
  for name in ORDER:
   parts=[cmd(x) for x in STAGING.get(name,[])]
   if name in SELECTORS:
    flag,value=SELECTORS[name];parts.insert(0,cmd('Choice '+flag+' '+value))
   emotions={}
   for row in resources[name]['rows']:
    speaker=row['speaker'];text=row.get(key,'').strip()
    if speaker not in ['Narrator','Pacifica','Gideon','Wendy']:raise ValueError('Unexpected cast '+speaker)
    if not text or any(c in text for c in ['[',']','\n']):raise ValueError('Invalid paragraph '+name)
    commands=[]
    for cue in ([row['cue']] if isinstance(row.get('cue'),str) else row.get('cue',[])):
     if cue not in CUES:unknown.add(cue)
     else:commands.extend(CUES[cue])
    emotion=row.get('emotion')
    if emotion and speaker in EMOTIONS:
     mapped=EMOTIONS[speaker].get(emotion,emotion)
     if mapped!=emotions.get(speaker):commands.append('expression '+speaker+' '+mapped+' transition .2');emotions[speaker]=mapped
    when=row.get('when')
    if when:
     flag,value=when['flag'],when['equals']
     if not re.fullmatch('[a-z][a-z0-9_]*',flag) or not re.fullmatch('[A-Za-z0-9_]+',str(value)):raise ValueError('Invalid condition')
     parts.append(cmd(f'when {flag} {value}')+''.join(cmd(x) for x in commands)+cmd(speaker)+text)
    else:parts.extend(cmd(x) for x in commands);parts.extend([cmd(speaker),text])
   if name in CHOICES:
    parts.extend([cmd('item hide'),cmd('Choice importance important')])
    for i,(ru,en,target) in enumerate(CHOICES[name],1):parts.extend([cmd(f'Button text {i} {ru if key=="ru" else en}'),cmd(f'Button order {i} next {NS}{target}')])
    parts.append(cmd('stop'))
   elif name=='night_gate':parts.extend(cmd(x) for x in ['item hide','music stop fade 1.2','camera zoom 1.045 duration 1.6','wait 1','stop','scene credits'])
   else:parts.append(cmd('next '+NS+NEXT[name]))
   resource=f'textes/{language}/{NS}{name}';scripts[resource]='\n\n'.join(parts)+'\n'
   speaker='Narrator'
   for line,source in enumerate(x for x in scripts[resource].splitlines() if x):
    tags=re.findall(r'\[([^\]]+)\]',source)
    for tag in tags:
     if tag in EMOTIONS or tag=='Narrator':speaker=tag
    text=re.sub(r'\[[^\]]*\]','',source).strip()
    if text:
     slot={'key':f'{language}|{NS}{name}|{line}|{speaker.lower()}','script':NS+name,'language':language,'sourceLine':line,'speaker':speaker,'text':text,'status':'pending'}
     guard=next((x.split()[1:] for x in tags if x.startswith('when ')),None)
     if guard:slot['when']={'flag':guard[0],'equals':' '.join(guard[1:])}
     slots.append(slot)
   counter=counts.setdefault(language,{'paragraphs':0,'words':0})
   counter['paragraphs']+=len(resources[name]['rows']);counter['words']+=sum(len(re.findall(r"[\w]+(?:[’-][\w]+)*",r[key])) for r in resources[name]['rows'])
 if unknown:raise ValueError('Unmapped authored cues: '+', '.join(sorted(unknown)))
 (ROOT/'assets/chapter3-scripts.json').write_text(json.dumps(scripts,ensure_ascii=False,indent=2)+'\n')
 (ROOT/'assets/chapter3-voice-plan.json').write_text(json.dumps({'version':1,'namespace':NS,'status':'pending-reviewed-voice-acting','allowSystemSpeech':False,'lines':slots},ensure_ascii=False,indent=2)+'\n')
 report={'resources':len(scripts),'scenes':9,'choices':3,'counts':counts,'plotArc':'Wendy/object unresolved; continues in Chapter 4','chapter2Symbol':'unknown and unrelated to this chapter mystery'}
 (ROOT/'assets/chapter3-build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
 return scripts
if __name__=='__main__':build()
