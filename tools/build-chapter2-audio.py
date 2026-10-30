"""Build original, deterministic environmental Foley for Chapter 2 (no speech)."""
from __future__ import annotations
import hashlib,json,math,random,struct,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/chapter2/audio'
RATE=24000

def render(name,duration,seed):
 rng=random.Random(seed); count=int(RATE*duration); samples=[]; low=0.0; smooth=0.0
 for i in range(count):
  t=i/RATE;white=rng.uniform(-1,1);low=.975*low+.025*white;smooth=.88*smooth+.12*white
  if name=='cup':
   value=sum(math.sin(2*math.pi*f*t)*math.exp(-t*d) for f,d in [(1715,8),(2570,12),(3428,17)])*.22+white*math.exp(-t*90)*.1
  elif name=='wood_creak':
   frequency=105+42*math.sin(t*2.6)+26*t
   texture=.6+.4*math.sin(2*math.pi*17*t)**2
   value=(math.sin(2*math.pi*(110*t+8*t*t+2*math.sin(t*2.6)))+.3*math.sin(2*math.pi*frequency*2.7*t))*.05*texture+smooth*.16*texture
  elif name=='stream':
   value=low*.72+smooth*.13+math.sin(t*5.2)*smooth*.045
  elif name=='tunnel_drips':
   value=low*.08
   for at,freq in [(0.27,920),(1.34,1190),(2.96,850),(4.45,1030),(5.71,1250)]:
    elapsed=t-at
    if elapsed>=0:
     value+=math.sin(2*math.pi*(freq*elapsed-310*elapsed*elapsed))*math.exp(-elapsed*18)*.18
     for delay,gain in [(.09,.24),(.19,.12),(.34,.065)]:
      e=elapsed-delay
      if e>=0:value+=gain*math.sin(2*math.pi*(freq*e-310*e*e))*math.exp(-e*18)*.18
  elif name=='metal_grate':
   value=sum(math.sin(2*math.pi*f*t)*math.exp(-t*d) for f,d in [(183,3.2),(397,4.1),(733,5.7),(1109,8.3)])*.12+smooth*.12*math.exp(-t*5)
   if t>.2:value+=smooth*.12*math.exp(-(t-.2)*2.8)
  elif name=='valve':
   pulses=sum(math.exp(-((t-at)/.065)**2) for at in [.15,.52,.95,1.4,1.85])
   value=(smooth*.21+math.sin(2*math.pi*(285*t+12*t*t))*.035)*min(1,pulses)+low*.10
  elif name=='water_rush':
   swell=min(1,t/.65)*min(1,max(0,(duration-t)/.9))
   value=(low*.85+smooth*.25+white*.025)*swell*(.78+.16*math.sin(2.4*t))
  else:raise ValueError(name)
  fade=min(1,t/.035,max(0,(duration-t)/.07))
  samples.append(value*fade)
 peak=max(abs(x) for x in samples) or 1
 scale=min(1,.55/peak)
 pcm=b''.join(struct.pack('<h',round(max(-1,min(1,x*scale))*32767)) for x in samples)
 path=OUT/(name+'.wav')
 with wave.open(str(path),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(pcm)
 return {'path':str(path.relative_to(ROOT)),'duration':duration,'sampleRate':RATE,'channels':1,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source':'Original procedural environmental Foley; no speech or actor audio'}

def main():
 OUT.mkdir(parents=True,exist_ok=True)
 definitions=[('cup',.65),('wood_creak',1.8),('stream',6.4),('tunnel_drips',6.4),('metal_grate',1.5),('valve',2.3),('water_rush',4.6)]
 rendered={name:render(name,duration,8812+i*17) for i,(name,duration) in enumerate(definitions)}
 manifest_path=ROOT/'assets/chapter2-audio.json'
 old=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
 effects={f'ch2_{key}':value for key,value in rendered.items()}
 # Preserve reviewed/generated voice cues if this deterministic SFX build is rerun.
 effects.update({key:value for key,value in old.get('effects',{}).items() if key.startswith('ch2_mimic_')})
 data={'version':1,'provenance':'Original environmental Foley and optional independently text-designed fictional voice cues. No actor recordings or voice cloning.',
  'effects':effects,'ambience':{'ch2_stream':{**rendered['stream'],'loop':True},'ch2_tunnel':{**rendered['tunnel_drips'],'loop':True}},
  'voices':old.get('voices',{'status':'pending','mode':'recorded_only','lines':{}}),
  'voiceCues':old.get('voiceCues',{
   'ch2_mimic_buster':{'status':'pending','text':'Бастер... Бастер, домой...','language':'russian'},
   'ch2_mimic_pacifica':{'status':'pending','text':'Гидеон? Гидеон, иди сюда.','language':'russian'},
   'ch2_mimic_gideon':{'status':'pending','text':'Я рядом.','language':'russian'},
   'ch2_mimic_pacifica_here':{'status':'pending','text':'Я здесь.','language':'russian'}})}
 manifest_path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 print('Built',len(rendered),'original environmental Foley clips; dialogue voices remain recorded-only.')
if __name__=='__main__':main()
