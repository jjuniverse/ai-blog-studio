// Pure editorial helpers shared by preview, copy/export and image package.
export type ImageKind = 'cover' | 'summary' | 'detail';
export const IMAGE_FILENAMES: Record<ImageKind, string> = {
  cover: '01-대표-썸네일.png',
  summary: '02-3줄요약.png',
  detail: '03-핵심정보.png',
};

const TAG_STOPWORDS = new Set([
  '오늘', '오늘의', '오늘의픽', '뉴스', '정보', '관련', '기사', '발표', '공개',
  '소식', '정리', '대해', '대한', '시작', '이번', '이후', '지난', '내년',
  '그리고', '이어', '까지', '만에', '개최', '단독', '예정', '기록', '통해',
  '아시아', '개월',
]);
function cleanTag(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 24);
}
export function normalizeArticleTags(article: string, title: string, category = ''): string {
  const raw = article.trim();
  if (!raw) return raw;
  const heading = /(?:^|\n)#{1,3}\s*관련\s*태그\s*\n/i.exec(raw);
  const body = heading ? raw.slice(0, heading.index).trimEnd() : raw;
  const existing = heading ? raw.slice(heading.index + heading[0].length) : '';
  const tags: string[] = [];
  const add = (word: string) => {
    const value = cleanTag(word);
    if (value.length < 2 || TAG_STOPWORDS.has(value) || /^\d+$/.test(value)) return;
    const tag = '#' + value;
    if (!tags.some(x => x.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  };
  for (const tag of existing.match(/#[^\s#]+/g) || []) add(tag.slice(1));
  for (const match of (title + ' ' + body.slice(0, 900)).matchAll(/['"‘“]([^'"’”]{2,30})['"’”]/g)) add(match[1]);
  const words = (title + ' ' + (body.match(/^#{1,3}\s+[^\n]+/gm) || []).join(' ')).match(/[\p{L}\p{N}.]{2,}/gu) || [];
  const useful = words.map(x => x.replace(/(?:까지|으로|에서|부터|만에|이어|개최)$/u, ''))
    .filter(x => x.length >= 2 && !TAG_STOPWORDS.has(x) && !/^\d+(?:년|개월|일|월)?$/.test(x));
  const subject = useful.find(x => /^[가-힣]{2,6}$/.test(x)) || useful[0] || '';
  if (subject) add(subject);
  for (const suffix of ['컴백', '콘서트', '아시아투어', '정규4집', '투어', '앨범', '시청률', '화제성', '예매', '공연', '출연자']) {
    if (tags.length >= 9) break;
    if (subject && (title + body).includes(suffix === '정규4집' ? '정규 4집' : suffix) && !subject.includes(suffix)) add(subject + suffix);
  }
  for (const word of useful) add(word);
  const articleWords = body.match(/[\p{L}\p{N}.]{2,}/gu) || [];
  for (const word of articleWords) {
    if (tags.length >= 8) break;
    if (/[A-Z]/.test(word) || word.length >= 3) add(word);
  }
  for (const fallback of ['오늘의이슈', '핵심정리', category]) {
    if (tags.length >= 8) break;
    add(fallback);
  }
  return body + '\n\n## 관련 태그\n' + ['#오늘의픽', ...tags].slice(0, 12).join(' ');
}
export function normalizeEnglishArticleTags(article: string, title: string): string {
  const raw = article.trim();
  if (!raw) return raw;
  const match = /(?:^|\n)#{1,3}\s*(?:Related Tags|Tags)\s*\n/i.exec(raw);
  const body = match ? raw.slice(0,match.index).trimEnd() : raw;
  const existing = match ? raw.slice(match.index + match[0].length) : '';
  const tags: string[]=[];
  const add = (token:string) => {
    const value = token.replace(/[^A-Za-z0-9]/g,'').slice(0,30);
    if (!value || /^(news|latest|update|review|information)$/i.test(value)) return;
    const tag='#'+value;
    if (!tags.some(t=>t.toLowerCase()===tag.toLowerCase())) tags.push(tag);
  };
  for (const tag of existing.match(/#[^\s#]+/g)||[]) add(tag.slice(1));
  for (const x of title.match(/[A-Za-z][A-Za-z0-9]{2,}/g)||[]) {
    if (!/^(the|and|for|with|from|that|this|their|when|what|after)$/i.test(x)) add(x);
  }
  for (const x of body.slice(0,900).match(/[A-Za-z][A-Za-z0-9]{2,}/g)||[]) {
    if (tags.length>=8) break;
    if (!/^(the|and|for|with|from|that|this|their|when|what|after|have|been|will|was|are)$/i.test(x)) add(x);
  }
  for (const x of ['Entertainment','Music','Kpop','WorldNews']) {
    if (tags.length>=8) break;
    add(x);
  }
  return body+'\n\n## Related Tags\n'+['#TodaysPick',...tags.filter(t=>t.toLowerCase()!=='#todayspick')].slice(0,12).join(' ');
}
export function paragraphLines(article: string): string[] {
  return article.split(/\n+/).map(x => x.trim()).filter(Boolean);
}
export type ImagePositions = { summary: number; detail: number };
export function imagePositions(lines: string[]): ImagePositions {
  const lastBody = Math.max(0, lines.findIndex(x => /^#{1,3}\s*(?:관련\s*태그|Related Tags)/i.test(x)) - 1);
  const limit = lastBody > 0 ? lastBody : Math.max(0, lines.length - 1);
  const summaryHeading = lines.findIndex(x => /^#{1,3}\s*(?:3줄\s*요약|Three Key Takeaways)/i.test(x));
  const summary = summaryHeading >= 0
    ? Math.min(limit, summaryHeading + 3)
    : Math.min(limit, Math.max(0, Math.floor(limit * .36)));
  const headings = lines.map((x,i)=>({x,i})).filter(x=>x.i<=limit && x.i>summaryHeading && /^#{1,3}\s/.test(x.x)
    && !/관련\s*태그|3줄\s*요약|Related Tags|Three Key Takeaways/i.test(x.x));
  const preferred = headings.find(x => /일정|예매|공연|콘서트|핵심|시청률|화제성|앨범|컴백|투어|순위|출연|Schedule|Tickets|Concert|Rankings|Release|Highlights|Timeline/i.test(x.x)) || headings[0];
  const next = preferred ? lines.findIndex((x,i)=>i>preferred.i && /^#{1,3}\s/.test(x)) : -1;
  let detail = preferred ? Math.min(limit, next > 0 ? next - 1 : preferred.i + 1)
    : Math.min(limit, Math.max(0, Math.floor(limit * .72)));
  if (detail === summary && limit > 0) detail = detail < limit ? detail + 1 : detail - 1;
  return { summary, detail };
}
export function withImageMarkers(article: string): string {
  const lines = paragraphLines(article);
  if (!lines.length) return article;
  const positions = imagePositions(lines);
  const output = ['[이미지 삽입: ' + IMAGE_FILENAMES.cover + ']'];
  lines.forEach((line, i) => {
    output.push(line);
    if (i === positions.summary) output.push('[이미지 삽입: ' + IMAGE_FILENAMES.summary + ']');
    if (i === positions.detail) output.push('[이미지 삽입: ' + IMAGE_FILENAMES.detail + ']');
  });
  return output.join('\n\n');
}
