"""Russian player text; legacy resource namespaces remain for save compatibility."""
from pathlib import Path
import re,json
replacements={'Go-Kart':'карт','GO-KART':'КАРТ','Fight-Fighters':'Бойцы','Reverse Falls':'Реверс Фолз','Gravity Falls':'Гравити Фолз','BUSTER':'БАСТЕР','"pun"':'"каламбур"','(norths-west)':'(северо-запад)','(sounth-east)':'(юго-восток)','askot - платок':'аскот - платок','askot - skot':'аскот - Скот','"abuela"':'"абуэла"','"grandma"':'"бабушка"'}
replacements.update({'І сколько людей приходит?':'И сколько людей приходит?', 'Пасифіка':'Пасифика', 'По моєму':'По-моему', 'Сус, а що як це вампір напав на двох дітей сьогодні вранці?':'Зус, а если это вампир напал на двух детей сегодня утром?'})
def translate(v):
 lines=[]
 for line in v.splitlines(keepends=True):
  parts=line.split('//',1)
  seg=re.split(r'(\[[^\]]*\])',parts[0])
  for i in range(0,len(seg),2):
   for a,b in replacements.items():seg[i]=seg[i].replace(a,b)
  lines.append(''.join(seg)+('//' + parts[1] if len(parts)>1 else ''))
 return ''.join(lines)

root=Path(__file__).resolve().parents[1]
for name in ['scripts','chapter1-scripts','chapter2-scripts']:
 p=root/'assets'/f'{name}.json'
 data=json.loads(p.read_text())
 for key in data:
  if '/russian/' in key: data[key]=translate(data[key])
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
p=root/'assets/chapter1-art.json'
data=json.loads(p.read_text())
for entry in data.get('items',{}).values():
 if isinstance(entry.get('name'),dict) and 'russian' in entry['name']: entry['name']['russian']=translate(entry['name']['russian'])
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
