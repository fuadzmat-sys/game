from pathlib import Path
import UnityPy,json
from UnityPy.helpers.MeshHelper import MeshHandler
from PIL import Image
import argparse
parser=argparse.ArgumentParser(description='Restore original untrimmed sprite dimensions; run once after extract-assets.py')
parser.add_argument('data_directory',type=Path)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'assets')
args=parser.parse_args();out=args.output.resolve()
e=UnityPy.load(str(args.data_directory/'data.unity3d'))
m=json.loads((out/'manifest.json').read_text())
count=0
for o in e.objects:
 if o.type.name!='Sprite':continue
 d=o.read();t=o.read_typetree();entry=m['sprites'][d.m_Name];p=out.parent/entry['path']
 if entry.get('padded'):continue
 # Sprite meshes are in local units relative to the original pivot. Recover
 # the transparent canvas removed by Unity's tight atlas packing.
 rect=t['m_Rect'];pivot=t['m_Pivot'];W=round(rect['width']);H=round(rect['height'])
 mesh=MeshHandler(d.m_RD,o.version);mesh.process();vs=mesh.m_Vertices
 if vs:
  left=round(min(v[0] for v in vs)*d.m_PixelsToUnits + pivot['x']*W)
  bottom=round(min(v[1] for v in vs)*d.m_PixelsToUnits + pivot['y']*H)
 else:
  atlas=d.m_SpriteAtlas.deref_parse_as_object() if d.m_SpriteAtlas else None
  rd=next((v for k,v in atlas.m_RenderDataMap if k==d.m_RenderDataKey),d.m_RD) if atlas else d.m_RD
  left=round(rd.textureRectOffset.x);bottom=round(rd.textureRectOffset.y)
 im=Image.open(p).convert('RGBA');canvas=Image.new('RGBA',(W,H));canvas.paste(im,(left,H-bottom-im.height))
 canvas.save(p);entry.update(width=W,height=H,padded=True);count+=1
(out/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
print('Restored original sprite canvases',count)
