import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
const env = {
  OPENAI_API_KEY:'mock-key',
  STUDIO_PASSWORD:'a-password-long-enough',
  AUTH_LIMIT:{limit:async()=>({success:true})},
  GEN_LIMIT:{limit:async()=>({success:true})},
};
const request = (path, body) => new Request('https://todaypick-studio.example'+path, {
  method:'POST',
  headers:{Origin:'https://jjuniverse.github.io','Content-Type':'application/json',
    'X-Studio-Passphrase':env.STUDIO_PASSWORD},
  body:JSON.stringify(body),
});

test('verification flags unsupported citations instead of asserting them as verified', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    status:'completed', output:[
      {type:'web_search_call', action:{sources:[{url:'https://official.example/a',title:'Primary'}]}},
      {type:'message',content:[{type:'output_text',text:JSON.stringify({
        overall:'review',checkedAtContext:'2026-11-18',claims:[
          {claim:'Claim A',status:'supported',explanation:'Claim needs the original document',
            evidenceUrls:['https://invalid.example/fake'],sourceOrganization:'Organization',
            measurementPeriod:'2026',measurementBasis:'nationwide'},
          {claim:'Claim B',status:'supported',explanation:'Source is discoverable',
            evidenceUrls:['https://official.example/a'],supportingPassage:'Reference passage directly discussing claim B.',sourceOrganization:'Organization',
            measurementPeriod:'2026',measurementBasis:'index'},
        ],
        freshnessNotes:['Review newest schedule'],
        correctionSuggestions:['Replace invalid number'],
      })}]},
    ],
  });
  try{
    const resp=await worker.fetch(request('/verify',{title:'A specific headline',article:'test facts '.repeat(20),sources:[]}),env);
    const result=await resp.json();
    assert.equal(resp.status,200,JSON.stringify(result));
    assert.equal(result.result.status,'human_review_required');
    assert.equal(result.result.claims[0].status,'uncertain');
    assert.equal(result.result.claims[0].evidence.length,0);
    assert.equal(result.result.claims[1].status,'supported');
    assert.equal(result.result.claims[1].evidence.length,1);
  }finally{globalThis.fetch=originalFetch;}
});

test('licensed image search filters unknown and noncommercial licenses and exposes source info', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname,'api.openverse.org');
    assert.equal(parsed.searchParams.get('license'),'cc0,by');
    return Response.json({results:[
      {id:'a',title:'Historic street',creator:'Someone',license:'cc0',license_version:'1.0',
        license_url:'https://creativecommons.org/publicdomain/zero/1.0/',
        foreign_landing_url:'https://photos.example/original',
        url:'https://photos.example/full.jpg',thumbnail:'https://photos.example/small.jpg',mature:false},
      {id:'b',title:'Restricted',license:'by-nc',license_url:'https://creativecommons.org/licenses/by-nc/4.0/',
        foreign_landing_url:'https://photos.example/restricted',url:'https://photos.example/b.jpg',thumbnail:'https://photos.example/bsmall.jpg',mature:false},
    ]});
  };
  try{
    const response=await worker.fetch(request('/images',{query:'historic Seoul street'}),env);
    const json=await response.json();
    assert.equal(response.status,200,JSON.stringify(json));
    assert.equal(json.images.length,1);
    assert.equal(json.images[0].license,'CC0');
    assert.equal(json.images[0].sourceUrl,'https://photos.example/original');
  }finally{globalThis.fetch=originalFetch;}
});

test('benefit verification requires a passage and the exact searched notice, never a same-path older notice', async () => {
  const original = globalThis.fetch;
  const notice='https://official.example/notice?id=2026';
  const makeClaim=(claim,evidenceUrls,supportingPassage)=>({
    claim,status:'supported',evidenceUrls,supportingPassage,explanation:'지원 조건을 확인했어요.',
    sourceOrganization:'담당 기관',measurementPeriod:'',measurementBasis:'',
  });
  globalThis.fetch=async (_url, options)=>{
    const payload=JSON.parse(options.body);
    assert.match(payload.instructions,/documents by applicant\/channel/);
    assert.match(payload.instructions,/registered merchant scope/);
    assert.equal(JSON.parse(payload.input).category,'시니어·복지');
    return Response.json({status:'completed',output:[
      {type:'web_search_call',status:'completed',action:{type:'open_page',url:notice}},
      {type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'Checking.'}]},
      {type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:JSON.stringify({
        overall:'review',freshnessNotes:[],correctionSuggestions:[],claims:[
          makeClaim('같은 주소지만 이전 연도 공고',[notice.replace('2026','2025')],'공식 문서 안에 있는 충분히 긴 문장입니다.'),
          makeClaim('출처에 연결되지만 근거 구절 없음',[notice],''),
          makeClaim('올해 공식 신청 경로',[notice],'주민센터 방문 또는 누리집에서 신청할 수 있습니다.'),
        ],
      })}]},
    ]});
  };
  try{
    const response=await worker.fetch(request('/verify',{title:'복지 가이드',category:'시니어·복지',article:'신청 대상과 서류, 가맹점을 확인해 주세요. '.repeat(5)}),env);
    const outcome=await response.json();
    assert.equal(response.status,200,JSON.stringify(outcome));
    assert.deepEqual(outcome.result.claims.map(c=>c.status),['uncertain','uncertain','supported']);
    assert.equal(outcome.result.claims[2].supportingPassage,'주민센터 방문 또는 누리집에서 신청할 수 있습니다.');
  }finally{globalThis.fetch=original;}
});
