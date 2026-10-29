from pathlib import Path
import UnityPy, json, re
import argparse
parser=argparse.ArgumentParser(description='Read the supplied Unity data without running its executables')
parser.add_argument('data_directory',type=Path)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'assets')
args=parser.parse_args()
root=args.data_directory.resolve();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
env=UnityPy.load(str(root/'data.unity3d'))
index={'sprites':{},'textures':{},'audio':{},'objects':{}}
for folder in ['sprites','textures','audio']:(out/folder).mkdir(exist_ok=True)
def safe(s):return re.sub(r'[^\w.-]','_',s)
for o in env.objects:
 typ=o.type.name
 if typ not in ['Texture2D','Sprite','AudioClip']:continue
 d=o.read();name=d.m_Name
 try:
  if typ=='Texture2D':
   if name.startswith(('sactx-','LDR_')) or name=='EmojiOne':continue
   p=out/'textures'/(safe(name)+'.png'); d.image.save(p)
   index['textures'][name]={'path':str(p.relative_to(out.parent)),'width':d.m_Width,'height':d.m_Height}
  elif typ=='Sprite':
   p=out/'sprites'/(safe(name)+'.png');img=d.image;img.save(p)
   t=o.read_typetree()
   index['sprites'][name]={'path':str(p.relative_to(out.parent)),'width':img.width,'height':img.height,'rect':t.get('m_Rect'),'pivot':t.get('m_Pivot'),'pixelsToUnits':t.get('m_PixelsToUnits')}
  else:
   samples=d.samples
   if not samples: print('NO AUDIO',name,flush=True);continue
   paths=[]
   for i,(n,b) in enumerate(samples.items()):
    p=out/'audio'/(safe(name)+(f'_{i}' if i else '')+Path(n).suffix)
    p.write_bytes(b);paths.append(str(p.relative_to(out.parent)))
   index['audio'][name]={'path':paths[0],'duration':d.m_Length}
 except Exception as e: print('EXPORT ERROR',typ,name,str(e)[:180],flush=True)
index_path=out/'manifest.json';index_path.write_text(json.dumps(index,ensure_ascii=False,indent=2))
print('Export complete',{k:len(v) for k,v in index.items()},flush=True)
