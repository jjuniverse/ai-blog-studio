import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('complete OpenAI response yields a research audit and draft without a scope error', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const originalFetch = globalThis.fetch;
  const title = 'Useful productivity news for users';
  const article = ['# Article', '## What happened', 'Detailed information '.repeat(70),
                   '## How to use', 'Specific steps '.repeat(70), '## Notes', 'Reader guidance '.repeat(70)].join('\n');
  const sourceLinks = [
    { title: 'Announcement', url: 'https://example.org/announcement' },
    { title: 'Other coverage', url: 'https://reputable.example/news' },
  ];
  globalThis.fetch = async () => Response.json({
    status: 'completed',
    output: [
      { type: 'web_search_call', action: { sources: sourceLinks } },
      { type: 'message', content: [{
        type: 'output_text',
        text: JSON.stringify({
          mode: 'article', title, naverTitle: 'Useful AI software announcement and how to use it',
          tistoryTitle: 'AI software release: features and detailed setup', tistoryEnTitle: 'AI Software Release and Setup Guide', naver: article, tistory: article, tistoryEn: article,
          shortform: 'An informative script that has enough content to pass the short-form length requirement.',
          verificationChecklist: [], imageNotes: ['Cover','Illustration','Summary'], imageKeywords: ['Useful productivity news','software release'],
          sourceLinks,
        }),
      }] },
    ],
  });
  try {
    const env = {
      OPENAI_API_KEY: 'dummy-for-test',
      STUDIO_PASSWORD: 'a-password-long-enough',
      AUTH_LIMIT: { limit: async () => ({ success: true }) },
      GEN_LIMIT: { limit: async () => ({ success: true }) },
    };
    const req = new Request('https://todaypick-studio-api.example/generate', {
      method: 'POST',
      headers: { Origin: 'https://jjuniverse.github.io', 'Content-Type': 'application/json',
                 'X-Studio-Passphrase': env.STUDIO_PASSWORD },
      body: JSON.stringify({
        title, category: 'IT·AI', region: 'KO', status: 'needs_sources',
        sources: [{ url: 'https://news.example/story', publisher: 'Example Media', title }],
      }),
    });
    const response = await worker.fetch(req, env);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.draft.mode, 'article');
    assert.equal(result.draft.imageKeywords.length, 2);
    assert.match(result.draft.naver, /#오늘의픽/);
    assert.match(result.draft.tistory, /#오늘의픽/);
    assert.equal((result.draft.naver.match(/#오늘의픽/g)||[]).length, 1);
    assert.equal(result.draft.naverTitle, 'Useful AI software announcement and how to use it');
    assert.equal(result.draft.tistoryTitle, 'AI software release: features and detailed setup');
    assert.equal(result.draft.tistoryEnTitle, 'AI Software Release and Setup Guide');
    assert.match(result.draft.tistoryEn, /## Related Tags\n#TodaysPick/);
    assert.equal((result.draft.tistoryEn.match(/#TodaysPick/g) || []).length, 1);
    assert.equal(result.draft.researchAudit.distinctSourceDomains, 2);
    assert.equal(result.draft.researchAudit.returnedSourceCount, 2);
    assert.equal(result.draft.researchAudit.initiallyGeneratedMode, 'article');
    assert.equal(result.status, 'revision_required');
    assert.equal(result.draft.qualityAudit.blogsAreCopies, true);
    assert.ok(result.draft.qualityAudit.warnings.some(x => x.includes('동일')));

  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('short imperfect articles remain visible for revision instead of becoming empty research briefs', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const originalFetch = globalThis.fetch;
  const body = '첫 문단은 중요한 사실을 설명해.\n\n## 조사 결과\n짧지만 사용자가 검수할 수 있는 본문이야.\n\n## 구체적 수치\n더 확인해야 할 수치가 있어.\n\n## 정리\n원문과 비교가 필요해. 신청 전에 필요한 조건을 정리하고, 소득과 재산 기준은 담당 기관의 최신 안내에서 확인해.';
  const sources = [
    { title:'Media 1', url:'https://news-one.example/article' },
    { title:'Media 2', url:'https://news-two.example/article' },
  ];
  globalThis.fetch = async () => Response.json({
    status:'completed', output:[
      {type:'web_search_call',action:{sources}},
      {type:'message',content:[{type:'output_text',text:JSON.stringify({
        mode:'article',title:'보도 내용 확인',naverTitle:'보도 내용과 조사 결과',tistoryTitle:'조사 결과 분석',tistoryEnTitle:'Research Results and Evidence',
        naver:body,tistory:body,tistoryEn:'Information '.repeat(35),shortform:body.slice(0,95),
        verificationChecklist:[],imageNotes:['cover','detail','summary'],imageKeywords:['보도 내용','조사 결과'],sourceLinks:sources,
      })}]},
    ],
  });
  try {
    const env={
      OPENAI_API_KEY:'dummy-key',STUDIO_PASSWORD:'a-password-long-enough',
      AUTH_LIMIT:{limit:async()=>({success:true})},GEN_LIMIT:{limit:async()=>({success:true})},
    };
    const response=await worker.fetch(new Request('https://worker.example/generate',{
      method:'POST',headers:{Origin:'https://jjuniverse.github.io',
        'Content-Type':'application/json','X-Studio-Passphrase':env.STUDIO_PASSWORD},
      body:JSON.stringify({title:'Good research topic title',category:'IT·AI',region:'KO',
        status:'needs_sources',sources:[{title:'Good research topic title',publisher:'Example',url:'https://news.example/test'}]}),
    }),env);
    const result=await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    assert.equal(result.draft.mode,'article');
    assert.equal(result.status,'revision_required');
    // The short paid result stays intact, while factual content remains below publishability threshold.
    assert.equal(result.draft.qualityAudit.channelReadiness.naver.ready, false);
    assert.equal(result.draft.qualityAudit.channelReadiness.tistory.ready, false);
    assert.ok(result.draft.qualityAudit.channelReadiness.naver.bodyLength < 350);
    assert.ok(result.draft.naver.startsWith(body));
    assert.ok(result.draft.tistory.startsWith(body));
    assert.match(result.draft.naver, /## 관련 태그\n#오늘의픽/);
    assert.match(result.draft.tistory, /## 관련 태그\n#오늘의픽/);
    assert.equal((result.draft.naver.match(/#오늘의픽/g) || []).length, 1);
    assert.ok((result.draft.naver.split('## 관련 태그')[1].match(/#[^\\s#]+/g) || []).length <= 10);
    assert.ok(result.draft.qualityAudit.warnings.some(x=>x.includes('1200자')));
    assert.equal(result.draft.qualityAudit.channelReadiness.naver.minimum,1200);
    assert.equal(result.draft.qualityAudit.channelReadiness.tistory.minimum,1500);
    assert.equal(result.draft.qualityAudit.channelReadiness.tistoryEn.minimum,800);
    assert.ok(result.draft.shortform.length>0);
    assert.ok(result.draft.qualityAudit.warnings.some(x=>x.includes('보완 필요')));
  } finally {
    globalThis.fetch=originalFetch;
  }
});

async function generatePensionDraft({ body, tistory = body, english = '', shortform = 'A short draft for review', requestedSources, retrievedSources, mode = 'article' }) {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const original = globalThis.fetch;
  const title = '기초연금 온라인 신청, 한층 더 간편하게 퀴즈 이벤트 실시';
  let requestCount = 0;
  globalThis.fetch = async (_url, options) => {
    requestCount++;
    const payload = JSON.parse(options.body);
    assert.match(payload.instructions, /responsible agency/);
    assert.match(payload.instructions, /quiz or giveaway belongs in its own final section/);
    return Response.json({
      status: 'completed',
      output: [
        { type:'web_search_call', action:{sources:retrievedSources} },
        { type:'message', content:[{ type:'output_text', text:JSON.stringify({
          mode, title, naverTitle:'기초연금 온라인 신청 방법', tistoryTitle:'부모님 기초연금 신청 자격과 서류',
          tistoryEnTitle:'How to apply for the basic pension in Korea', naver:body, tistory, tistoryEn:english,
          shortform, verificationChecklist:['공식 안내에서 신청 자격과 도움 받을 곳을 확인하세요.'],
          imageNotes:['cover','detail','summary'], imageKeywords:['기초연금','복지로'], sourceLinks:requestedSources,
        }) }] },
      ],
    });
  };
  const env = { OPENAI_API_KEY:'dummy', STUDIO_PASSWORD:'a-password-long-enough',
    AUTH_LIMIT:{limit:async()=>({success:true})}, GEN_LIMIT:{limit:async()=>({success:true})} };
  try {
    const response = await worker.fetch(new Request('https://worker.example/generate', {
      method:'POST', headers:{Origin:'https://jjuniverse.github.io', 'Content-Type':'application/json', 'X-Studio-Passphrase':env.STUDIO_PASSWORD},
      body:JSON.stringify({title, status:'needs_sources', region:'KO', category:'시니어·복지', sources:[{title,publisher:'example',url:'https://news.example/pension'}]}),
    }), env);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(requestCount, 1, 'do not make an extra paid request');
    return result;
  } finally {
    globalThis.fetch = original;
  }
}

const official = { title:'기초연금 신청 안내', url:'https://benefits.example.go.kr/view?id=42' };
const other = { title:'별개 서비스', url:'https://benefits.example.go.kr/view?id=73' };
const reviewBody = [
  '배우자가 함께 있지 않아도 휴대폰으로 금융정보 제공에 동의할 수 있습니다.',
  '## 추가 서류는 언제 내나요?',
  '임대차계약서를 아직 준비하지 못했다면 온라인으로 신청서를 먼저 내고 나중에 필요한 증빙을 제출하세요.',
  '## 방문 신청은 어디에서 하나요?',
  '온라인 신청이 어렵다면 국민연금공단 지사 또는 가까운 행정복지센터에서 신청할 수 있습니다.',
  '## 관련 태그', '#오늘의픽 #복지로 #기초연금신청방법 #한층 #신청 #온라인',
].join('\n\n');

test('a one-paragraph welfare headline with tags and many search hits becomes a research brief', async () => {
  const body = '국민연금공단은 복지로 이용 절차를 개선하여 대한노인회와 온라인 간편 신청 퀴즈 이벤트를 실시합니다.\n\n## 관련 태그\n#기초연금 #신청 #한층 #간편하게 #퀴즈 #온라인 #복지로';
  const result = await generatePensionDraft({body, requestedSources:[official], retrievedSources:[official, other]});
  assert.equal(result.status, 'research_required');
  assert.equal(result.draft.mode, 'research_brief');
  for(const channel of ['naver','tistory','tistoryEn','shortform']) assert.equal(result.draft[channel], '');
  assert.ok(result.draft.researchAudit.reasons.some(reason=>reason.includes('한두 문장')));
  assert.match(result.draft.reviewBodies.naver, /국민연금공단/);
});

test('an editable welfare draft keeps topical tags and curated official sources only', async () => {
  const result = await generatePensionDraft({body:reviewBody,
    requestedSources:[official,{...official,url:official.url+'&utm_source=news'}], retrievedSources:[official, other]});
  assert.equal(result.status, 'revision_required');
  assert.equal(result.draft.mode, 'article');
  assert.deepEqual(result.draft.sourceLinks, [official]);
  assert.match(result.draft.naver, /#오늘의픽 #복지로 #기초연금신청방법$/);
  assert.doesNotMatch(result.draft.naver, /#한층|#신청\b|#온라인/);
});

test('different query IDs are not evidence for the same article', async () => {
  const result = await generatePensionDraft({body:reviewBody, requestedSources:[official], retrievedSources:[other]});
  assert.equal(result.status, 'research_required');
  assert.equal(result.draft.naver, '');
  assert.deepEqual(result.draft.sourceLinks, [other]); // investigation only
  assert.ok(result.draft.researchAudit.reasons.some(reason=>reason.includes('실제 검색 출처')));
});

test('three structurally complete and separately written articles can still pass to human review', async () => {
  // Long distinct paragraphs are synthetic; this checks shape, not factual accuracy.
  const makeArticle = (summary, paragraph, prefix = '') => [
    prefix + paragraph.repeat(18),
    '## ' + summary, ...[1,2,3].map(n => '- ' + paragraph.repeat(18) + n),
    '## Documents', paragraph.repeat(18) + ' documents.',
    '## Process', paragraph.repeat(18) + ' process.',
    '## Next steps', paragraph.repeat(18) + ' next steps.',
  ].join('\n');
  const body = makeArticle('3줄 요약', '기초연금은 정해진 신청 기간과 제출 방법을 담당 공공기관의 공식 안내에서 확인합니다. ');
  const tistory = makeArticle('3줄 요약', '배우자 동의와 추가 서류 제출은 상황에 맞게 필요한 절차를 확인하고 진행합니다. ');
  const english = makeArticle('Three Key Takeaways', 'Always consult the responsible public agency for the latest instructions and current application details before proceeding. ');
  const shortform = '부모님 연금 신청을 준비하고 있나요? 먼저 접수 방법을 확인하세요. 화면에는 공식 서비스 이름을 표시하고, 방문이 필요하면 주민센터 문의 방법을 소개하세요. 마지막으로 필요한 서류를 미리 확인해 보세요.';
  const result = await generatePensionDraft({body, tistory, english, shortform, requestedSources:[official], retrievedSources:[official, other]});
  assert.equal(result.status, 'review_required', JSON.stringify(result.draft.qualityAudit));
  assert.ok(Object.values(result.draft.qualityAudit.channelReadiness).every(audit=>audit.ready));
  assert.deepEqual(result.draft.sourceLinks, [official]);
});

const structuredResponseFixture = {
  mode: 'article', title: '기초연금 온라인 신청 개선',
  naverTitle: '기초연금 신청 방법', tistoryTitle: '기초연금 신청 서류와 기준',
  tistoryEnTitle: 'Apply for the Korean basic pension', naver: reviewBody,
  tistory: reviewBody, tistoryEn: '', shortform: '검수용 대본입니다.',
  imageNotes: ['cover','detail','summary'], imageKeywords: ['기초연금'],
  verificationChecklist: [], sourceLinks: [official],
};
const outputText = text => ({type:'output_text',text});
const assistantMessage = (content, more={}) => ({type:'message',role:'assistant',content,...more});

async function generateFromResponsesShape(output, extra={}) {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const original = globalThis.fetch;
  let calls=0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({status:'completed', ...extra, output:[
      {type:'web_search_call', status:'completed', action:{sources:[official]}},
      ...output,
    ]});
  };
  const env = { OPENAI_API_KEY:'dummy', STUDIO_PASSWORD:'a-password-long-enough',
    AUTH_LIMIT:{limit:async()=>({success:true})}, GEN_LIMIT:{limit:async()=>({success:true})} };
  try {
    const response = await worker.fetch(new Request('https://worker.example/generate',{
      method:'POST', headers:{Origin:'https://jjuniverse.github.io', 'X-Studio-Passphrase':env.STUDIO_PASSWORD},
      body:JSON.stringify({title:structuredResponseFixture.title, region:'KO', status:'needs_sources',
        sources:[{title:structuredResponseFixture.title,publisher:'Example',url:official.url}]}),
    }),env);
    assert.equal(calls,1);
    return {http:response.status, body:await response.json()};
  } finally {
    globalThis.fetch=original;
  }
}

test('a valid final editorial message is not concatenated with earlier preamble or a text block', async () => {
  const json=JSON.stringify(structuredResponseFixture);
  const result=await generateFromResponsesShape([
    assistantMessage([outputText('I will look up the official source.')]),
    assistantMessage([outputText('Almost ready.')],{phase:'commentary'}),
    assistantMessage([outputText('Draft:'),outputText(json)],{phase:'final_answer'}),
  ]);
  assert.equal(result.http,200);
  assert.equal(result.body.draft.mode,'article');
  assert.match(result.body.draft.naver,/행정복지센터/);
});

test('one fenced JSON message and a JSON object split within one message both work', async () => {
  const json=JSON.stringify(structuredResponseFixture);
  const fence=String.fromCharCode(96).repeat(3);
  const fenced=await generateFromResponsesShape([assistantMessage([outputText('Here is the result:\n'+fence+'json\n'+json+'\n'+fence)])]);
  assert.equal(fenced.body.draft.mode,'article');
  const split=await generateFromResponsesShape([assistantMessage([outputText(json.slice(0,400)),outputText(json.slice(400))])]);
  assert.equal(split.body.draft.mode,'article');
});

test('a truncated response preserves only complete top-level draft bodies for review', async () => {
  const intact='공식 안내에 따르면 "배우자 동의"는 모바일로 할 수 있습니다.\n다음 단계는 공식 안내를 확인하세요.';
  const prefix=JSON.stringify({mode:'article',title:structuredResponseFixture.title,nested:{naver:'wrong'},naver:intact}).slice(0,-1);
  for(const extra of [{},{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}]){
    const result=await generateFromResponsesShape([assistantMessage([outputText(prefix+', "tistory":"중간에 끊긴 원고')])],extra);
    assert.equal(result.http,200);
    assert.equal(result.body.status,'research_required');
    assert.equal(result.body.draft.naver,'');
    assert.deepEqual(result.body.draft.reviewBodies,{naver:intact});
  }
});

test('unfinished first article stays an error and a refusal is not parsed as a draft', async () => {
  const partial=await generateFromResponsesShape([assistantMessage([outputText('{"mode":"article","naver":"unfinished')])],
    {status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});
  assert.equal(partial.body.code,'AI_OUTPUT_LIMIT');
  const refused=await generateFromResponsesShape([
    assistantMessage([outputText(JSON.stringify(structuredResponseFixture))]),
    assistantMessage([{type:'refusal',refusal:'No result'}],{phase:'final_answer'}),
  ]);
  assert.equal(refused.body.code,'AI_REFUSAL');
});
