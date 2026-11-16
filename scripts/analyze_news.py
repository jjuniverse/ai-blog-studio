#!/usr/bin/env python3
"""Conservative headline clusters and editorial heuristics. NOT fact verification or revenue prediction."""
import hashlib,json,re
from datetime import datetime,timezone
from pathlib import Path
STOP={'the','and','from','with','about','for','this','that','what','when','how','after','into','new','latest','news','says','official','report','reports','of','on','at','to','in','a','an','is','are','as','by','ai','kpop','관련','발표','공개','소식','오늘','최신','공식','단독'}
RISK=('rumor','rumour','alleged','unconfirmed','dating','scandal','lawsuit','accused','suspected','열애설','의혹','루머','논란','폭로','혐의','사망','자살')
COMMERCIAL=('tool','software','app','pricing','subscription','plan','comparison','alternative','workflow','automation','productivity','도구','요금','가격','비교','자동화','활용법','추천')
VISUAL=('tutorial','how to','demo','guide','feature','기능','방법','사용법','가이드','공개','컴백','teaser','comeback')
def terms(text):
 words=re.findall(r'[a-z0-9]+|[가-힣]{2,}',text.rsplit(' - ',1)[0].lower().replace('k-pop','kpop'))
 return {w for w in words if w not in STOP and len(w)>1}
def similar(a,b):
 if a['category']!=b['category'] or a['region']!=b['region']: return False
 aa,bb=terms(a['title']),terms(b['title'])
 return bool(aa and bb and len(aa&bb)>=3 and len(aa&bb)/len(aa|bb)>=.72)
def scoring(group):
 title=group[0]['title'].lower();category=group[0]['category']
 count=len({x.get('publisher') for x in group if x.get('publisher')})
 risk=any(x in title for x in RISK)
 revenue=min(75,(58 if 'AI' in category or 'IT' in category else 22)+(12 if any(x in title for x in COMMERCIAL) else 0))
 visual=min(80,45+(20 if any(x in title for x in VISUAL) else 0))
 coverage=min(75,35+10*min(4,count))
 return {'editorialPriority':round(revenue*.45+visual*.3+coverage*.25),'commercialFitHeuristic':revenue,'shortformFitHeuristic':visual,'coverageHeuristic':coverage,'independentPublisherCount':count,'riskFlag':risk,'measuredTraffic':None,'estimatedRevenue':None,'evidenceLevel':'headlines_only'}
def main():
 data=json.loads(Path('public/data/news.json').read_text(encoding='utf-8'))
 rows=[x for x in data.get('items',[]) if x.get('title') and x.get('url','').startswith('https://')]
 groups=[]
 for row in rows:
  for group in groups:
   if similar(row,group[0]):group.append(row);break
  else:groups.append([row])
 result=[]
 for group in groups:
  a=group[0]; title=a['title'].rsplit(' - ',1)[0]
  key=f"{a['region']}|{a['category']}|{' '.join(sorted(terms(title)))}"
  result.append({'id':hashlib.sha256(key.encode()).hexdigest()[:14],'title':title,'category':a['category'],'region':a['region'],
   'headlines':[{'title':x['title'],'publisher':x.get('publisher',''),'url':x['url'],'publishedAt':x.get('publishedAt')} for x in group],
   'scores':scoring(group),'status':'research_required'})
 result.sort(key=lambda x:(x['scores']['riskFlag'],-x['scores']['editorialPriority'],-len(x['headlines'])))
 output=Path('public/data/candidates.json');output.parent.mkdir(parents=True,exist_ok=True)
 output.write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'disclaimer':'Headline-only clusters and heuristic editorial priorities; not facts or measured revenue. Human verification required.','candidates':result},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f'{len(rows)} headlines -> {len(result)} conservative clusters')
if __name__=='__main__':main()
