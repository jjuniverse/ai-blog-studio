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
const KOREAN_GENERIC = new Set(['오늘','오늘의','오늘의픽','뉴스','정보','관련','기사','발표','공개','소식','정리','이번','시작','이후','지난','예정','방법','총정리','최신']);
const ENGLISH_GENERIC = new Set(['the','with','from','this','that','news','latest','update','review','information','new','low','price','deal','equipped','packing','drops','black','friday','best','guide','how','what','when','where','more','than','about','laptop','ram','at','in','on','of','by','to','is','are','an','a','and','or','its','your']);
function seoTitleTerms(title:string, english:boolean): string[] {
  const trimmed=title.split(/[|:!?—–]/)[0].trim();
  const words=(english ? trimmed.match(/[A-Za-z][A-Za-z0-9-]*/g) : trimmed.match(/[\p{L}\p{N}-]{2,}/gu)) || [];
  return words.filter(word => english ? !ENGLISH_GENERIC.has(word.toLowerCase()) : !KOREAN_GENERIC.has(word));
}
function addSeoTag(tags:string[], candidate:string, english:boolean) {
  const cleaned=english ? candidate.replace(/[^A-Za-z0-9]/g,'').slice(0,35) : candidate.replace(/[^\p{L}\p{N}]/gu,'').slice(0,30);
  if(cleaned.length < 2 || /^\d+$/.test(cleaned))return;
  if(english && ENGLISH_GENERIC.has(cleaned.toLowerCase()))return;
  if(!english && KOREAN_GENERIC.has(cleaned))return;
  const tag='#'+cleaned;
  if(!tags.some(t=>t.toLowerCase()===tag.toLowerCase()))tags.push(tag);
}
function normalizedTags(article:string,title:string,english:boolean,category=''):string{
  const raw=article.trim();if(!raw)return raw;
  const heading=english ? /(?:^|\n)#{1,3}\s*(?:Related Tags|Tags)\s*\n/i : /(?:^|\n)#{1,3}\s*관련\s*태그\s*\n/i;
  const match=heading.exec(raw);
  const body=match?raw.slice(0,match.index).trimEnd():raw;
  const existing=match?raw.slice(match.index+match[0].length):'';
  const tags:string[]=[];
  const titleTerms=seoTitleTerms(title,english);
  // Prioritize the actual search subject and natural search phrases, not independent generic words.
  for(const phrase of [titleTerms.slice(0,3).join(''),titleTerms.slice(0,2).join('')])addSeoTag(tags,phrase,english);
  for(const token of titleTerms.slice(0,6))addSeoTag(tags,token,english);
  for(const phrase of (existing.match(/#[^\s#]+/g)||[]).map(t=>t.slice(1))){
    if(tags.length>=9)break;
    const titleRelated=titleTerms.some(t=>phrase.toLowerCase().includes(t.toLowerCase())||t.toLowerCase().includes(phrase.toLowerCase()));
    if(titleRelated)addSeoTag(tags,phrase,english);
  }
  if(!english)addSeoTag(tags,category,false);
  // Never fill a quota with unrelated trending words or generic fallback tags.
  const brand=english?'#TodaysPick':'#오늘의픽';
  return body+'\n\n## '+(english?'Related Tags':'관련 태그')+'\n'+[brand,...tags.slice(0,9)].join(' ');
}
export function normalizeArticleTags(article:string,title:string,category=''):string{
  return normalizedTags(article,title,false,category);
}
export function normalizeEnglishArticleTags(article:string,title:string):string{
  return normalizedTags(article,title,true);
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

/** Editorial floor for drafts: excludes hashtags and reference appendices entirely. */
export type ArticleChannel = 'naver' | 'tistory' | 'tistoryEn';
export function articleReadiness(article: string, channel: ArticleChannel | boolean = 'naver'): {
  publishBlocked: boolean; reasons: string[]; bodyLength: number; sections: number;
  minimum: number; targetMax: number; units: string;
} {
  const kind: ArticleChannel = typeof channel === 'boolean' ? (channel ? 'tistoryEn' : 'naver') : channel;
  const raw = String(article || '').split(/(?:^|\n)#{1,3}\s*(?:관련\s*태그|Related Tags|Tags)\s*\n/i)[0]
    .split(/(?:^|\n)참고자료\s*(?:\([^)]*\))?\s*\n/)[0];
  const meaningful = raw.split(/\n+/).map(x=>x.trim()).filter(x =>
    x && !/^#{1,3}\s/.test(x) && !/^#\S+/.test(x) && !/^\[이미지 삽입:/.test(x));
  const joined = meaningful.join(' ').replace(/^\s*[-*•]\s*/gm, '').replace(/\s+/g,' ').trim();
  const len = kind === 'tistoryEn' ? (joined.match(/\b[\w]+(?:['’-][\w]+)*\b/g) || []).length : joined.length;
  const minimum = kind === 'naver' ? 1200 : kind === 'tistory' ? 1500 : 800;
  const targetMax = kind === 'naver' ? 2000 : kind === 'tistory' ? 2500 : 1200;
  const units = kind === 'tistoryEn' ? '단어' : '자';
  const sections = (raw.match(/^#{1,3}\s+.+/gm) || []).length;
  const summary = kind === 'tistoryEn' ? /(?:^|\n)#{1,3}\s*Three Key Takeaways/i.test(raw)
    : /(?:^|\n)#{1,3}\s*3줄\s*요약/.test(raw);
  const reasons:string[]=[];
  if (len < minimum) reasons.push('본문 분량 부족: '+len+units+' / 최소 '+minimum+units);
  if (!summary) reasons.push('핵심 요약 섹션이 없어');
  if (sections < 4) reasons.push('설명 소제목이 부족해 (요약 포함 최소 4개)');
  if (meaningful.length < 7) reasons.push('근거와 구체적인 설명이 부족해 (실질 문단 최소 7개)');
  return { publishBlocked: reasons.length > 0, reasons, bodyLength: len, sections, minimum, targetMax, units };
}
