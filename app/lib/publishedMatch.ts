/** Public RSS evidence matching: no inferred private or older publications. */
export type PublicPost = {
  channel: 'naver' | 'tistory';
  title: string;
  url: string;
  publishedAt?: string;
};
export type PublicFeedSource = {
  channel: 'naver' | 'tistory';
  feedUrl: string;
  status: 'ok' | 'error';
  count: number;
  lastSuccessAt?: string;
  error?: string;
};
export type PublicFeed = {
  generatedAt: string;
  sources: PublicFeedSource[];
  posts: PublicPost[];
};
export type CandidatePublic = {
  id: string;
  title: string;
  headlines: {title: string; url: string; publisher?: string}[];
};
export type PublishedMatch = {
  type: 'confirmed' | 'suspected';
  post: PublicPost;
  reason: string;
  score: number;
};
const COMMON = new Set([
  '뉴스','속보','단독','정리','공개','소식','확인','정보','오늘','내일','발표',
  '최신','지난','이번','대한','통해','올해','예정','진행','공식','이후','여부',
  '관련','모든','기자','공연','출연','방송','콘서트','컴백',
  'news','latest','official','update','today','blog','review','guide','with',
  'from','the','and','for','this','that','what','when','about','more',
]);
export function canonicalTitle(raw: string): string {
  return raw.toLowerCase().normalize('NFKC')
    .replace(/[“”‘’"']/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}
export function titleWords(raw: string): Set<string> {
  const tokens = raw.toLowerCase().normalize('NFKC')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(tokens.filter(t => t.length >= 2 && !COMMON.has(t) && !/^\d+$/.test(t)));
}
export function matchPublished(candidate: CandidatePublic, posts: PublicPost[]): PublishedMatch | null {
  const candidates = [
    candidate.title,
    ...candidate.headlines.map(h => h.publisher && h.title.endsWith(' - '+h.publisher)
      ? h.title.slice(0, -(' - '+h.publisher).length) : h.title),
  ];
  let best: PublishedMatch | null = null;
  for (const post of posts) {
    if (!/^https:\/\//.test(post.url)) continue;
    const publishedWords = titleWords(post.title);
    const normalizedPost = canonicalTitle(post.title);
    for (const title of candidates) {
      const normalized = canonicalTitle(title);
      if (normalized.length >= 12 && normalized === normalizedPost) {
        return { type:'confirmed', post, reason:'발행 글 제목이 일치해', score:1 };
      }
      const candidateWords = titleWords(title);
      if (!candidateWords.size || !publishedWords.size) continue;
      const common = [...candidateWords].filter(t => publishedWords.has(t)).length;
      const min = Math.min(candidateWords.size,publishedWords.size);
      const max = Math.max(candidateWords.size,publishedWords.size);
      const coverage = common / min;
      const symmetric = common / max;
      const confirmed = common >= 4 && coverage >= .82 && symmetric >= .75;
      const suspected = common >= 2 && coverage >= .42 && symmetric >= .3;
      if (!confirmed && !suspected) continue;
      const type = confirmed ? 'confirmed' : 'suspected';
      const score = (coverage + symmetric) / 2;
      if (!best || (type === 'confirmed' && best.type !== 'confirmed') ||
          (type === best.type && score > best.score)) {
        best = {type,post,reason: confirmed ?
          '게시글과 뉴스 제목의 주요 검색어가 대부분 일치해' : '같은 주제를 다룬 글일 수 있어 확인이 필요해',
          score};
      }
    }
  }
  return best;
}
