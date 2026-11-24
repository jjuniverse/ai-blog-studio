import test from 'node:test';
import assert from 'node:assert/strict';
import { articleReadiness, normalizeEnglishArticleTags, normalizeArticleTags } from '../app/lib/postPackage.ts';

test('short English article is blocked by the editorial floor', () => {
  const short = 'MSI laptop has 32GB RAM and a discount.\n\n## Related Tags\n#MSI #New #Low #Price';
  const result = articleReadiness(short, 'tistoryEn');
  assert.equal(result.publishBlocked, true);
  assert.equal(result.minimum, 800);
  assert.equal(result.units, '단어');
});

test('each channel has its own minimum and word or character units', () => {
  assert.equal(articleReadiness('Brief', 'naver').minimum, 1200);
  assert.equal(articleReadiness('Brief', 'tistory').minimum, 1500);
  assert.equal(articleReadiness('Brief', 'tistoryEn').minimum, 800);
});

test('English tags remove generic sale words and keep the product subject', () => {
  const article = 'A detailed draft.\n\n## Related Tags\n#New #Low #Price #MSI #Amazon';
  const result = normalizeEnglishArticleTags(article, 'MSI 32GB RAM Laptop at New Low Price');
  const tags = result.split('## Related Tags\n')[1].split(/\s+/);
  assert.ok(tags.includes('#MSI'));
  assert.equal(tags[0], '#TodaysPick');
  assert.ok(!tags.includes('#New'));
  assert.ok(!tags.includes('#Low'));
  assert.ok(!tags.includes('#Price'));
  assert.ok(tags.length <= 10);
});

test('Korean tags keep brand and category without generic filler', () => {
  const article = '본문 내용\n\n## 관련 태그\n#뉴스 #정보 #기초연금';
  const result = normalizeArticleTags(article, '기초연금 신청 방법과 수급 대상', '시니어·복지');
  assert.ok(result.includes('#기초연금'));
  assert.ok(result.includes('#오늘의픽'));
  assert.ok(!result.includes('#뉴스'));
});

test('Korean preview preserves meaningful tags without copying individual words from the headline', () => {
  const text = normalizeArticleTags('본문 내용\n\n## 관련 태그\n#한층 #간편하게 #복지로 #기초연금온라인신청 #오늘의픽 #온라인 #신청', '기초연금 온라인 신청, 한층 더 간편하게');
  assert.equal(text.split('## 관련 태그\n')[1], '#오늘의픽 #복지로 #기초연금온라인신청');
});

test('reference lists and repeated lines do not raise body length', () => {
  const line = '기초연금 신청 절차와 신청 대상은 복지로 안내에서 확인할 수 있습니다.';
  const text = [line, ...Array(100).fill(line), '## 참고자료', ...Array(50).fill('https://www.bokjiro.go.kr/very-long-article-url')].join('\n');
  assert.equal(articleReadiness(text).bodyLength, line.length);
  assert.equal(articleReadiness(text).publishBlocked, true);
});

test('display starts in a populated tab when Naver is blank', async () => {
  const { firstWrittenChannel } = await import('../app/lib/draftDisplay.ts');
  assert.equal(firstWrittenChannel({ naver: '  ', tistory: 'Korean draft', tistoryEn: 'English draft' }), 'tistory');
  assert.equal(firstWrittenChannel({ naver: '', shortform: 'Script' }), 'shortform');
  assert.equal(firstWrittenChannel({ tistory: ' \n' }), undefined);
});

test('saved non-empty text wins without an empty cached editor hiding a generated body', async () => {
  const { resolveDraftBody } = await import('../app/lib/draftDisplay.ts');
  assert.equal(resolveDraftBody('naver', { naver: '' }, { naver: 'Generated body' }), 'Generated body');
  assert.equal(resolveDraftBody('naver', { naver: 'My edit' }, { naver: 'Generated body' }), 'My edit');
  assert.equal(resolveDraftBody('tistoryEn', { naver: 'My edit' }, {}), '');
});
