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
          mode: 'article', title, naver: article, tistory: article,
          shortform: 'An informative script that has enough content to pass the short-form length requirement.',
          verificationChecklist: [], imageNotes: ['Cover','Illustration','Summary'],
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
