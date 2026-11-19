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
          tistoryTitle: 'AI software release: features and detailed setup', naver: article, tistory: article,
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
  const body = '첫 문단은 중요한 사실을 설명해.\n\n## 조사 결과\n짧지만 사용자가 검수할 수 있는 본문이야.\n\n## 구체적 수치\n더 확인해야 할 수치가 있어.\n\n## 정리\n원문과 비교가 필요해.';
  const sources = [
    { title:'Media 1', url:'https://news-one.example/article' },
    { title:'Media 2', url:'https://news-two.example/article' },
  ];
  globalThis.fetch = async () => Response.json({
    status:'completed', output:[
      {type:'web_search_call',action:{sources}},
      {type:'message',content:[{type:'output_text',text:JSON.stringify({
        mode:'article',title:'보도 내용 확인',naverTitle:'보도 내용과 조사 결과',tistoryTitle:'조사 결과 분석',
        naver:body,tistory:body,shortform:body.slice(0,95),
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
    assert.ok(result.draft.naver.startsWith(body));
    assert.ok(result.draft.tistory.startsWith(body));
    assert.match(result.draft.naver, /## 관련 태그\n#오늘의픽/);
    assert.match(result.draft.tistory, /## 관련 태그\n#오늘의픽/);
    assert.equal((result.draft.naver.match(/#오늘의픽/g) || []).length, 1);
    assert.ok((result.draft.naver.split('## 관련 태그')[1].match(/#[^\s#]+/g) || []).length >= 8);
    assert.ok(result.draft.shortform.length>0);
    assert.ok(result.draft.qualityAudit.warnings.some(x=>x.includes('요약·구체적 근거·소제목')));
  } finally {
    globalThis.fetch=originalFetch;
  }
});
