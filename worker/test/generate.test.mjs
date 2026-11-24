import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function evidenceFixture(sources, facts) {
  const samples = [
    ["change","온라인으로 신청하면 배우자 동의를 모바일로 받을 수 있습니다."],
    ["steps","공식 서비스에서 복지 급여 신청 메뉴를 선택한 뒤 기초연금을 찾습니다."],
    ["documents","준비되지 않은 추가 증빙은 신청서를 낸 다음 별도로 제출할 수 있습니다."],
    ["support","직접 방문이 필요하면 가까운 행정복지센터나 국민연금공단에 문의하세요."],
  ];
  return Response.json({status:'completed',output:[
    {type:'web_search_call',status:'completed',action:{sources}},
    {type:'message',content:[{type:'output_text',text:JSON.stringify({
      facts:facts ?? samples.map(([section,statement],i)=>({section,statement,sourceUrl:sources[i % sources.length].url})),
      openQuestions:['최종 공지의 적용 범위를 확인해 주세요.'],
    })}]},
  ]});
}
const isResearch = options => JSON.parse(options.body).text.format.name === 'editorial_evidence';

test('complete OpenAI response yields a research audit and draft without a scope error', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const originalFetch = globalThis.fetch;
  const title = 'Useful productivity news for users';
  const article = ['# Article', '## What happened', 'Detailed information '.repeat(70),
                   '## How to use', 'Specific steps '.repeat(70), '## Notes', 'Reader guidance '.repeat(70)].join('\n');
  const articleKo = article.replaceAll('Detailed information ', '새 기능의 구체적인 사용 단계를 정리해요. ').replaceAll('Specific steps ', '실행 전 필요한 설정을 확인해요. ').replaceAll('Reader guidance ', '공식 안내에서 지원 여부를 확인해요. ');
  const sourceLinks = [
    { title: 'Announcement', url: 'https://example.org/announcement' },
    { title: 'Other coverage', url: 'https://reputable.example/news' },
  ];
  globalThis.fetch = async (_url, options) => isResearch(options) ? evidenceFixture(sourceLinks) : Response.json({
    status: 'completed',
    output: [
      { type: 'web_search_call', action: { sources: sourceLinks } },
      { type: 'message', content: [{
        type: 'output_text',
        text: JSON.stringify({
          mode: 'article', title, naverTitle: 'AI 소프트웨어 업데이트와 사용 방법',
          tistoryTitle: 'AI 소프트웨어 최신 기능과 설정 단계', tistoryEnTitle: 'AI Software Release and Setup Guide', naver: articleKo, tistory: articleKo, tistoryEn: article,
          shortform: '새로운 기능을 어떻게 쓸 수 있을까요? 먼저 공식 안내에서 지원 여부를 확인합니다. 화면에 설정 방법을 순서대로 보여주고 마지막에 유의할 점을 안내합니다.',
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
        title, category: 'IT·AI', region: 'KO', status: 'needs_sources', channel: 'naver',
        sources: [{ url: 'https://news.example/story', publisher: 'Example Media', title }],
      }),
    });
    const response = await worker.fetch(req, env);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.draft.mode, 'article');
    assert.equal(result.draft.imageKeywords.length, 2);
    assert.match(result.draft.naver, /#오늘의픽/);
    assert.equal(result.draft.tistory, '');
    assert.equal((result.draft.naver.match(/#오늘의픽/g)||[]).length, 1);
    assert.equal(result.draft.naverTitle, 'AI 소프트웨어 업데이트와 사용 방법');
    assert.equal(result.draft.tistoryTitle, undefined);
    assert.equal(result.draft.tistoryEn, '');
    assert.equal(result.draft.shortform, '');
    assert.equal(result.draft.generationChannel, 'naver');
    assert.equal(result.draft.researchAudit.distinctSourceDomains, 2);
    assert.equal(result.draft.researchAudit.returnedSourceCount, 2);
    assert.equal(result.draft.researchAudit.initiallyGeneratedMode, 'article');
    assert.equal(result.status, 'revision_required');
    assert.deepEqual(Object.keys(result.draft.qualityAudit.channelReadiness), ['naver']);

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
  globalThis.fetch = async (_url, options) => isResearch(options) ? evidenceFixture(sources) : Response.json({
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
        status:'needs_sources',channel:'naver',sources:[{title:'Good research topic title',publisher:'Example',url:'https://news.example/test'}]}),
    }),env);
    const result=await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    assert.equal(result.draft.mode,'article');
    assert.equal(result.status,'revision_required');
    // The short paid result stays intact, while factual content remains below publishability threshold.
    assert.equal(result.draft.qualityAudit.channelReadiness.naver.ready, false);
    assert.equal(result.draft.qualityAudit.channelReadiness.tistory, undefined);
    assert.ok(result.draft.qualityAudit.channelReadiness.naver.bodyLength < 350);
    assert.ok(result.draft.naver.startsWith(body));
    assert.equal(result.draft.tistory, '');
    assert.match(result.draft.naver, /## 관련 태그\n#오늘의픽/);
    assert.equal((result.draft.naver.match(/#오늘의픽/g) || []).length, 1);
    assert.ok((result.draft.naver.split('## 관련 태그')[1].match(/#[^\\s#]+/g) || []).length <= 10);
    assert.ok(result.draft.qualityAudit.warnings.some(x=>x.includes('1200자')));
    assert.equal(result.draft.qualityAudit.channelReadiness.naver.minimum,1200);
    assert.equal(result.draft.shortform, '');
    assert.ok(result.draft.qualityAudit.warnings.some(x=>x.includes('보완 필요')));
  } finally {
    globalThis.fetch=originalFetch;
  }
});

async function generatePensionDraft({ body, tistory = body, english = '', shortform = 'A short draft for review', requestedSources, retrievedSources, mode = 'article', channel = 'naver' }) {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const original = globalThis.fetch;
  const title = '기초연금 온라인 신청, 한층 더 간편하게 퀴즈 이벤트 실시';
  let requestCount = 0;
  globalThis.fetch = async (_url, options) => {
    requestCount++;
    const payload = JSON.parse(options.body);
    assert.match(payload.instructions, /responsible authority/);
    if (isResearch(options)) {
      assert.deepEqual(payload.tools,[{type:'web_search',search_context_size:'medium'}]);
      assert.equal(payload.max_tool_calls,3);
      return evidenceFixture(retrievedSources);
    }
    assert.match(payload.instructions, /quiz\/giveaway information at the end/);
    assert.equal(payload.tools,undefined);
    assert.ok(JSON.parse(payload.input).evidenceFacts.length >= 3);
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
      body:JSON.stringify({title, channel, status:'needs_sources', region:'KO', category:'시니어·복지', sources:[{title,publisher:'example',url:'https://news.example/pension'}]}),
    }), env);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(requestCount, 2, 'research and writing only, no retry');
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

test('each structurally complete single-channel article can pass to human review', async () => {
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
  for (const channel of ['naver','tistory','tistoryEn']) {
    const result = await generatePensionDraft({channel, body, tistory, english, shortform, requestedSources:[official], retrievedSources:[official, other]});
    assert.equal(result.status, 'review_required', JSON.stringify(result.draft.qualityAudit));
    assert.equal(result.draft.generationChannel, channel);
    assert.deepEqual(Object.keys(result.draft.qualityAudit.channelReadiness), [channel]);
    assert.ok(result.draft.qualityAudit.channelReadiness[channel].ready);
    assert.deepEqual(result.draft.sourceLinks, [official]);
    for (const other of ['naver','tistory','tistoryEn','shortform'].filter(key => key !== channel)) {
      assert.equal(result.draft[other], '');
      assert.equal(result.draft[other + 'Title'], undefined);
    }
    assert.match(result.draft[channel], channel === 'tistoryEn' ? /## Related Tags\n#TodaysPick/ : /## 관련 태그\n#오늘의픽/);
  }
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

async function generateFromResponsesShape(output, extra={}, opts={}) {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const original = globalThis.fetch;
  let calls=0;
  const requests = [];
  globalThis.fetch = async (_url,options) => {
    calls++;
    requests.push(JSON.parse(options.body));
    if (isResearch(options)) return evidenceFixture([official, other], opts.researchFacts ??
      [
        {section:'change',statement:'배우자가 본인 휴대전화에서 금융정보 제출에 동의할 수 있습니다.',sourceUrl:official.url},
        {section:'documents',statement:'필요한 추가 증빙은 먼저 신청서를 낸 후 제출할 수 있습니다.',sourceUrl:official.url},
        {section:'steps',statement:'복지로에 로그인한 뒤 노년 항목에서 해당 서비스를 선택하세요.',sourceUrl:official.url},
      ]);
    if (opts.writerError) return new Response('',{status:opts.writerError});
    return Response.json({status:'completed', ...extra, output});
  };
  const env = { OPENAI_API_KEY:'dummy', STUDIO_PASSWORD:'a-password-long-enough',
    AUTH_LIMIT:{limit:async()=>({success:true})}, GEN_LIMIT:{limit:async()=>({success:true})} };
  try {
    const response = await worker.fetch(new Request('https://worker.example/generate-channel',{
      method:'POST', headers:{Origin:'https://jjuniverse.github.io', 'X-Studio-Passphrase':env.STUDIO_PASSWORD},
      body:JSON.stringify({title:structuredResponseFixture.title, channel:'naver', ...opts.input, region:'KO', status:'needs_sources',
        sources:[{title:structuredResponseFixture.title,publisher:'Example',url:official.url}]}),
    }),env);
    assert.equal(calls,opts.expectedCalls ?? 2);
    return {http:response.status, body:await response.json(), requests};
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
  assert.match(partial.body.draft.researchAudit.reasons[0],/끝까지 작성하지 못했어/);
  assert.ok(partial.body.draft.evidenceFacts.length>=3);
  const refused=await generateFromResponsesShape([
    assistantMessage([outputText(JSON.stringify(structuredResponseFixture))]),
    assistantMessage([{type:'refusal',refusal:'No result'}],{phase:'final_answer'}),
  ]);
  assert.match(refused.body.draft.researchAudit.reasons[0],/본문을 작성하지 않았어/);
});

test('hexadecimal noise shown in the Studio screenshot is not displayed as a draft or checklist', async () => {
  const broken='2026 eb c7 e4 e4 e4 e4 e4 e4 e4 e4 e4 e4\n\n## 관련 태그\n#오늘의픽';
  const response=structuredResponseFixture;
  const out={...response, title:broken, naver:broken,tistory:broken,shortform:broken, tistoryEn:broken,
    verificationChecklist:[broken,'복지로 공식 안내에서 신청일을 확인하세요.']};
  const result=await generateFromResponsesShape([assistantMessage([outputText(JSON.stringify(out))])]);
  assert.equal(result.http,200);
  assert.equal(result.body.status,'research_required');
  assert.equal(result.body.draft.naver,'');
  assert.equal(result.body.draft.reviewBodies?.naver, undefined);
  assert.ok(result.body.draft.verificationChecklist.some(note=>note.includes('읽을 수 없는')));
  assert.doesNotMatch(JSON.stringify(result.body.draft), /c7 e4/);
});

test('an unwanted channel is ignored without hiding the selected article or technical references', async () => {
  const out={...structuredResponseFixture, tistory:'c7 e4 e4 e4 e4 e4 e4 e4 e4 e4',
    naver:reviewBody.replace('배우자가','복지로 앱의 EB C7 안내처럼, 배우자가')};
  const result=await generateFromResponsesShape([assistantMessage([outputText(JSON.stringify(out))])]);
  assert.equal(result.body.status,'revision_required');
  assert.equal(result.body.draft.tistory,'');
  assert.match(result.body.draft.naver,/EB C7/);
  assert.deepEqual(result.body.draft.sourceLinks,[official]);
});

test('writer receives only vetted evidence, never the original HTML or independent search tools', async () => {
  const result=await generateFromResponsesShape([assistantMessage([outputText(JSON.stringify(structuredResponseFixture))])]);
  assert.equal(result.body.draft.mode,'article');
  const [research,writer]=result.requests;
  assert.equal(research.max_tool_calls,3);
  assert.ok(research.max_output_tokens+writer.max_output_tokens <= 6500);
  assert.equal(writer.tools,undefined);
  const data=JSON.parse(writer.input);
  assert.ok(data.evidenceFacts.some(fact=>fact.section==='documents' && fact.sourceUrl===official.url));
  assert.equal(data.sources,undefined);
  assert.equal(data.verifiedNotes,undefined);
  assert.ok(result.body.draft.evidenceFacts.every(fact=>fact.sourceUrl===official.url));
});

test('unseen sources, duplicated statements and event-only facts do not trigger a paid writer', async () => {
  const event={section:'event',statement:'참여 기간은 공지에서 별도로 안내한 기간을 기준으로 합니다.',sourceUrl:official.url};
  const result=await generateFromResponsesShape([],{},{
    researchFacts:[event,{...event,section:'steps'}, {section:'eligibility',
      statement:'대상 기준은 공공기관 공식 홈페이지 안내에서 확인하세요.',sourceUrl:'https://unseen.example/file'}],
    expectedCalls:1,
  });
  assert.equal(result.body.status,'research_required');
  assert.equal(result.body.draft.evidenceFacts.length,1);
  assert.equal(result.body.draft.evidenceFacts[0].section,'event');
  assert.equal(result.body.draft.naver,'');
  assert.match(result.body.draft.researchAudit.reasons[0],/작성 요청은 보내지 않았어/);
});

test('writer outage keeps the already gathered facts and does not run a third call', async () => {
  const result=await generateFromResponsesShape([],{}, {writerError:502});
  assert.equal(result.http,200);
  assert.equal(result.body.draft.mode,'research_brief');
  assert.deepEqual(result.body.draft.sourceLinks,[official]);
  assert.equal(result.body.draft.evidenceFacts.length,3);
  assert.equal(result.body.draft.naver,'');
});

test('the writer schema permits exactly the selected article title and body', async () => {
  for (const channel of ['naver', 'tistory', 'tistoryEn']) {
    const expected = ['mode', channel, channel + 'Title', 'verificationChecklist', 'imageNotes', 'imageKeywords', 'sourceLinks'].sort();
    const result = await generateFromResponsesShape(
      [assistantMessage([outputText(JSON.stringify({...structuredResponseFixture, tistoryEn:'An English body reserved for review.'}))])],
      {}, { input: { channel } },
    );
    const writer = result.requests[1];
    assert.equal(result.body.draft.generationChannel, channel);
    assert.deepEqual(Object.keys(writer.text.format.schema.properties).sort(), expected);
    assert.deepEqual([...writer.text.format.schema.required].sort(), expected);
    assert.match(writer.instructions, /Write exactly one Today Pick article/);
    for (const other of ['naver','tistory','tistoryEn','shortform'].filter(key => key !== channel)) {
      assert.equal(result.body.draft[other], '');
      assert.equal(result.body.draft.reviewBodies?.[other], undefined);
    }
  }
});

test('missing, multiple, and unsupported channels never trigger a paid API request', async () => {
  for (const channel of [undefined, ['naver','tistory'], 'shortform', 'constructor']) {
    const result = await generateFromResponsesShape([], {}, { input: {channel}, expectedCalls:0 });
    assert.equal(result.http, 400);
    assert.equal(result.body.code, 'GEN_CHANNEL_REQUIRED');
  }
});
