#!/usr/bin/env python3
"""Generate explicitly unverified editorial drafts using OpenAI, only when secret is configured.
Public GitHub Pages: ALL output in public/data is publicly visible. Do not submit private info.
"""
import json,os,urllib.request
from datetime import datetime,timezone
from pathlib import Path
API_KEY=os.getenv('OPENAI_API_KEY')
ROOT=Path('public/data')
if not API_KEY:
 print('OPENAI_API_KEY not configured; skip optional AI draft generation')
 raise SystemExit(0)
records=json.loads((ROOT/'candidates.json').read_text(encoding='utf-8'))['candidates']
chosen=[x for x in records if not x['scores']['riskFlag'] and len(x['headlines'])>=2][:3]
if not chosen:
 print('No multi-source low-risk candidates. No drafts generated.')
 raise SystemExit(0)
out=[]
for item in chosen:
 sources=[{'title':x['title'],'url':x['url'],'publisher':x['publisher']} for x in item['headlines'][:5]]
 rules=(
  'You are an editorial planning assistant. You have ONLY headline metadata, not article text. '
  'Never invent or assert factual developments, dates, quotes, statistics, product capabilities, relationships, or announcements. '
  'Do not summarize unseen articles. Every claimed fact must instead be a clearly marked [VERIFY] placeholder. '
  'Output a useful Korean-language publication PREP outline for Naver and Tistory and a 40-second video storyboard in '
  'the region language, with specific verification questions and source URLs. '
  'All outputs MUST be marked NOT READY FOR PUBLICATION. Do not reproduce source article text. '
  'Return valid JSON object with keys naver, tistory, shortform, verificationChecklist, title; '
  'naver/tistory/shortform as strings, verificationChecklist array of strings. '
 )
 payload={'model':os.getenv('OPENAI_MODEL','gpt-4.1-mini'),'instructions':rules,
          'input':json.dumps({'topic':item['title'],'region':item['region'],'sources':sources},ensure_ascii=False),
          'text':{'format':{'type':'json_object'}},'max_output_tokens':1700}
 request=urllib.request.Request('https://api.openai.com/v1/responses',
     data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Authorization':'Bearer '+API_KEY,'Content-Type':'application/json'},method='POST')
 try:
  with urllib.request.urlopen(request,timeout=80) as response: raw=json.load(response)
  texts=[p.get('text','') for message in raw.get('output',[]) for p in message.get('content',[]) if p.get('type')=='output_text']
  if not texts:raise ValueError('No output_text')
  draft=json.loads(''.join(texts))
  for field in ('naver','tistory','shortform'):
   if not isinstance(draft.get(field),str):raise ValueError('Missing field '+field)
  draft['id']=item['id'];draft['status']='unverified_review_required';draft['sources']=sources
  out.append(draft)
 except Exception as exc:
  print(f"Draft failed for {item['id']}: {type(exc).__name__}: {exc}")
if out:
 (ROOT/'drafts.json').write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),
 'warning':'PUBLIC review outlines, NOT publication-ready. Verify all claims and media rights.', 'drafts':out},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f'Generated {len(out)} public review outlines')
else:
 print('No drafts generated; existing drafts unchanged.')
