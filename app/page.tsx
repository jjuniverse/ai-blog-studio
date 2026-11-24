'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ImageCard from './components/ImageCard';
import PostImagePackage from './components/PostImagePackage';
import { matchPublished, type PublicFeed } from './lib/publishedMatch';
import { normalizeArticleTags, normalizeEnglishArticleTags, paragraphLines, imagePositions, withImageMarkers, articleReadiness } from './lib/postPackage';

type Status = 'research_required' | 'needs_sources' | 'sensitive_review' | 'excluded_promotion';
type Channel = 'naver' | 'tistory' | 'tistoryEn' | 'shortform';
type Section = 'discover' | 'editor' | 'publish';
type Candidate = {
  id: string;
  title: string;
  category: string;
  region: string;
  headlines: { title: string; publisher: string; url: string; publishedAt?: string }[];
  scores: { editorialPriority: number; commercialFitHeuristic: number; shortformFitHeuristic: number; independentPublisherCount: number; riskFlag: boolean; promotionFlag?: boolean };
  status?: Status;
  reasons?: string[];
};
type ResearchLead = {
  candidateId: string;
  title: string;
  category: string;
  region: string;
  researchedAt: string;
  status: "needs_human_review" | "insufficient_evidence" | "research_failed";
  summary?: string;
  keyFacts?: string[];
  openQuestions?: string[];
  sources?: { title: string; url: string }[];
  distinctSourceDomains?: number;
  officialSourceSuggested?: boolean;
};
type EvidenceReview = {
  reviewedText?: string;
  checkedAt: string;
  status: string;
  claims: { claim: string; status: 'supported' | 'uncertain' | 'conflicting'; explanation: string;
    sourceOrganization: string; measurementPeriod: string; measurementBasis: string;
    evidence: { url: string; title: string }[] }[];
  freshnessNotes: string[];
  correctionSuggestions: string[];
  notice: string;
};
type ImageGroup = { keyword: string; provider: string; images: ImageSearchResult[]; error?: string };
type ImageSearchResult = {
  id: string; title: string; creator: string; license: string; licenseVersion: string;
  licenseUrl: string; sourceUrl: string; imageUrl: string; thumbnailUrl: string; attribution: string;
};
type Draft = {
  id: string;
  mode?: "article" | "research_brief";
  generatedAt?: string;
  generationVersion?: number;
  comparedToPrevious?: 'changed' | 'same' | 'first' | 'brief';
  sourceLinks?: { title: string; url: string }[];
  imageKeywords?: string[];
  researchAudit?: { searchedSourceCount: number; returnedSourceCount: number; distinctSourceDomains: number; initiallyGeneratedMode: string; reasons: string[] };
  qualityAudit?: { blogsAreCopies: boolean; shortformCopiesBlog: boolean; visualRightsWarning: boolean; warnings: string[] };
  title: string;
  naverTitle?: string;
  tistoryTitle?: string;
  tistoryEnTitle?: string;
  naver: string;
  tistory: string;
  tistoryEn?: string;
  shortform: string;
  verificationChecklist?: string[];
  sources?: { title: string; url: string; publisher: string }[];
  status: string;
};
type LocalEdit = {
  fields: Partial<Record<Channel, string>>;
  titles?: Partial<Record<'naver' | 'tistory' | 'tistoryEn', string>>;
  imageNotes: string[];
  verified: boolean;
  publishedUrls: Partial<Record<'naver' | 'tistory' | 'tistoryEn', string>>;
  publishedManually?: boolean;
  publishedTopicTitle?: string;
  publishedSourceUrls?: string[];
  updatedAt: string;
  generatedVersion?: number;
  evidenceReview?: Partial<Record<Channel, EvidenceReview>>;
  selectedImage?: ImageSearchResult;
  selectedImages?: ImageSearchResult[];
  imageKeywords?: string[];
  imageRightsApproved?: string[];
};

const ROOT = '/ai-blog-studio';
const WORKER_URL = 'https://todaypick-studio-api.jjuniverse-plant-lens.workers.dev';
const EDIT_KEY = 'todaypick_workspace_v1';
const GENERATED_DRAFTS_KEY = 'todaypick_generated_drafts_v1';
const DRAFT_VERSION = 2;
const channels: { id: Channel; label: string }[] = [
  { id: 'naver', label: '네이버 블로그' },
  { id: 'tistory', label: '티스토리 · 한국어' },
  { id: 'tistoryEn', label: '티스토리 · English' },
  { id: 'shortform', label: '숏폼 대본' },
];
const links = {
  naver: 'https://blog.naver.com/todaypickkr',
  tistory: 'https://blog83848.tistory.com/',
  workflow: 'https://github.com/jjuniverse/ai-blog-studio/actions/workflows/generate-drafts.yml',
  collect: 'https://github.com/jjuniverse/ai-blog-studio/actions/workflows/collect-news.yml',
};
const statusLabel: Record<Status, string> = {
  research_required: '검토 후보',
  needs_sources: '자료 조사 필요',
  sensitive_review: '민감 이슈 제외',
  excluded_promotion: '홍보성 제외',
};
const publicFile = async (path: string) => {
  const response = await fetch(ROOT + path, { cache: 'no-store' });
  if (!response.ok) throw new Error('데이터를 불러오지 못했어');
  return response.json();
};
const imagePrompts = (topic: Candidate | undefined) => [
  '대표 이미지 — 주제 핵심을 전달하는 제목 카드. 오늘의 픽 네이비·민트 디자인. 실제 인물/상품 이미지처럼 오해할 생성 이미지 사용 금지.',
  (topic?.category.includes('AI') || topic?.category.includes('IT'))
    ? '본문 설명 — 공식 사용법을 확인한 후 직접 캡처 또는 검증된 기능 비교 카드 삽입.'
    : '본문 설명 — 확인된 공개 일정·사실을 바탕으로 직접 제작한 정보 카드 삽입.',
  '핵심 정리 — 출처 확인 후 요점 3개를 독자적인 인포그래픽으로 제작. 기사 사진 및 방송 장면 무단 사용 금지.',
];
function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const el = document.createElement('a');
  el.href = url;
  el.download = filename;
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safePublishedUrl(raw: string, channel: 'naver' | 'tistory' | 'tistoryEn') {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return false;
    if (channel === 'naver') return u.hostname === 'blog.naver.com' && u.pathname.startsWith('/todaypickkr/');
    return u.hostname === 'blog83848.tistory.com' && u.pathname.length > 1;
  } catch { return false; }
}
export default function Home() {
  const [section, setSection] = useState<Section>('discover');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [localDrafts, setLocalDrafts] = useState<Draft[]>([]);
  const [researchLeads, setResearchLeads] = useState<ResearchLead[]>([]);
  const [publishedFeed, setPublishedFeed] = useState<PublicFeed | null>(null);
  const [publishedFeedError, setPublishedFeedError] = useState('');
  const [researchDailyLimit, setResearchDailyLimit] = useState(3);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [languageFilter, setLanguageFilter] = useState<'all' | 'KO' | 'EN'>('all');
  const [showExcluded, setShowExcluded] = useState(false);
  const [showPublished, setShowPublished] = useState(false);
  const [channel, setChannel] = useState<Channel>('naver');
  const [localEdits, setLocalEdits] = useState<Record<string, LocalEdit>>({});
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<{ id: number; kind: 'success' | 'error'; target: 'title' | 'article' } | null>(null);
  const [studioPassphrase, setStudioPassphrase] = useState('');
  const [verifiedNotes, setVerifiedNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [imageQuery, setImageQuery] = useState('');
  const [imageSearching, setImageSearching] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageResults, setImageResults] = useState<ImageSearchResult[]>([]);
  const [imageGroups, setImageGroups] = useState<ImageGroup[]>([]);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [imageSourceNotice, setImageSourceNotice] = useState('');
  const imageRequestId = useRef(0);
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [manualSourceUrl, setManualSourceUrl] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [connectionState, setConnectionState] = useState<'idle' | 'checking' | 'ready' | 'unconfigured' | 'unreachable'>('idle');
  const [connectionDetails, setConnectionDetails] = useState('');
  const [previewMode, setPreviewMode] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EDIT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setLocalEdits(parsed as Record<string, LocalEdit>);
      }
      const generated = window.localStorage.getItem(GENERATED_DRAFTS_KEY);
      if (generated) {
        const parsed: unknown = JSON.parse(generated);
        if (Array.isArray(parsed)) setLocalDrafts(parsed.filter((entry): entry is Draft =>
          !!entry && typeof entry === 'object' && typeof entry.id === 'string' &&
          (entry.mode === 'article' || entry.mode === 'research_brief')).slice(0, 40));
      }
    } catch { /* private mode or disabled local storage */ }
    setHydrated(true);
    Promise.allSettled([publicFile('/data/candidates.json'), publicFile('/data/drafts.json'), publicFile('/data/research.json'), publicFile('/data/published.json')])
      .then(([a, b, research, published]) => {
        if (a.status === 'fulfilled') {
          const list = (a.value.candidates || []) as Candidate[];
          setCandidates(list);
          setUpdatedAt(a.value.generatedAt || '');
          // Do not auto-select a headline: old drafts must only be shown after an explicit choice.
        } else setLoadError('후보 데이터를 읽지 못했어. 뉴스 수집 Actions를 확인해 줘.');
        if (b.status === 'fulfilled') setDrafts((b.value.drafts || []) as Draft[]);
        if (research.status === 'fulfilled') {
          setResearchLeads((research.value.entries || []) as ResearchLead[]);
          setResearchDailyLimit(research.value.maxDailyCalls || 3);
        }
        if (published.status === 'fulfilled' && Array.isArray(published.value.posts) && Array.isArray(published.value.sources)) {
          setPublishedFeed(published.value as PublicFeed);
        } else {
          setPublishedFeedError('공개 블로그 발행 목록을 아직 읽지 못했어. 기존 수동 발행 기록만 적용돼.');
        }
      }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(EDIT_KEY, JSON.stringify(localEdits)); } catch { setNotice('브라우저 저장 공간을 사용할 수 없어. 내보내기로 백업해 줘.'); }
  }, [localEdits, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(GENERATED_DRAFTS_KEY, JSON.stringify(localDrafts.slice(0, 40))); }
    catch { setNotice('생성 결과 보관 공간이 부족해. 중요한 원고는 텍스트 파일로 저장해 줘.'); }
  }, [localDrafts, hydrated]);

  useEffect(() => {
    // Selecting a new topic should never expose the previous topic's image results.
    imageRequestId.current += 1;
    setImageQuery('');
    setImageResults([]);
    setImageGroups([]);
    setImageError('');
    setImageSourceNotice('');
  }, [selectedId]);
  useEffect(() => {
    if (!copyFeedback) return;
    const timeout = window.setTimeout(() => setCopyFeedback(current => current?.id === copyFeedback.id ? null : current), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  const configuredWorker = true;
  async function checkWorkerConnection() {
    setConnectionState('checking');
    setConnectionDetails('');
    try {
      // No credentials, no paid generation. This only checks the public health endpoint.
      const response = await fetch(WORKER_URL + '/health', {
        method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Worker HTTP ' + response.status);
      const body = await response.json();
      if (!body?.ok) throw new Error('Worker health response was unexpected');
      if (body.configured !== true) {
        setConnectionState('unconfigured');
        setConnectionDetails('Worker 응답은 정상이지만 OpenAI API 키 또는 관리자 암호 설정이 누락됐어. Cloudflare Secrets를 확인해 줘.');
        return false;
      }
      // Reproduce /generate's cross-origin POST + custom-header preflight without paid API calls.
      let probeResponse: Response;
      try {
        probeResponse = await fetch(WORKER_URL + '/probe', {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Studio-Passphrase': 'diagnostic-only' },
          body: JSON.stringify({ probe: true }),
          signal: AbortSignal.timeout(12000),
        });
      } catch {
        setConnectionState('unreachable');
        setConnectionDetails('GET /health는 정상인데 POST /probe가 실패했어. POST 사전 요청(CORS), 네트워크 또는 Worker의 배포 상태를 확인해야 해. AI 생성 비용은 발생하지 않았어.');
        return false;
      }
      if (!probeResponse.ok) {
        setConnectionState('unreachable');
        setConnectionDetails('GET은 정상이지만 POST 테스트 HTTP ' + probeResponse.status + '가 나왔어. 최신 Worker 자동 배포가 완료됐는지 확인해 줘.');
        return false;
      }
      const probeData = await probeResponse.json().catch(() => ({}));
      if (probeData.transport !== 'post') {
        setConnectionState('unreachable');
        setConnectionDetails('POST 진단 응답 형식이 달라. Cloudflare Worker 최신 버전 배포를 확인해 줘.');
        return false;
      }
      if (studioPassphrase) {
        try {
          const authResponse = await fetch(WORKER_URL + '/auth-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Studio-Passphrase': studioPassphrase },
            body: JSON.stringify({ check: true }),
            cache: 'no-store',
            signal: AbortSignal.timeout(12000),
          });
          if (!authResponse.ok) {
            const outcome = await authResponse.json().catch(() => ({}));
            setConnectionState('unconfigured');
            setConnectionDetails(authResponse.status === 401
              ? 'Worker 통신은 정상인데 관리자 암호가 일치하지 않아. Cloudflare STUDIO_PASSWORD와 입력값을 확인해 줘.'
              : authResponse.status === 429
                ? '관리자 인증 시도 횟수 제한이야. 바로 반복하지 말고 제한이 풀린 뒤 시도해 줘.'
                : '관리자 인증 점검 실패: HTTP ' + authResponse.status + (outcome.error ? ' · ' + String(outcome.error).slice(0, 100) : ''));
            return false;
          }
        } catch {
          setConnectionState('unreachable');
          setConnectionDetails('GET/POST 기본 연결은 되지만 관리자 인증 요청만 실패했어. Worker 배포 상태나 요청 차단 여부를 확인해 줘.');
          return false;
        }
      }
      setConnectionState('ready');
      setConnectionDetails(studioPassphrase
        ? 'GET, POST, 관리자 인증 모두 정상 · OpenAI 호출은 아직 테스트하지 않았어.'
        : 'GET 및 POST/CORS 통신 정상 · 관리자 암호를 입력하면 인증까지 무료로 확인할 수 있어.');
      return true;
    } catch (error) {
      setConnectionState('unreachable');
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      setConnectionDetails(timedOut
        ? 'Worker 상태 확인 요청이 12초 안에 끝나지 않았어. Cloudflare 배포 상태와 네트워크를 확인해 줘.'
        : 'Worker에 연결하지 못했어. workers.dev 주소가 브라우저에서 열리는지, 네트워크·브라우저 확장 기능·Cloudflare 설정을 확인해 줘.');
      return false;
    }
  }
  async function generateHere() {
    if (!selected || generating) return;
    setGenerateError('');
    if (selected.status === 'sensitive_review' || selected.status === 'excluded_promotion') { setGenerateError('이 주제는 민감하거나 광고성으로 분류돼 생성하지 않아.'); return; }
    if (!studioPassphrase) { setGenerateError('관리자 암호를 입력해 줘.'); return; }
    setGenerating(true);
    try {
      // Check reachability before sending a paid OpenAI request.
      if (!(await checkWorkerConnection())) return;
      const response = await fetch(WORKER_URL + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Passphrase': studioPassphrase },
        body: JSON.stringify({
          title: selected.title, category: selected.category, region: selected.region,
          status: selected.status, verifiedNotes,
          sources: selected.headlines.map(h => ({ publisher: h.publisher, url: h.url, title: h.title })).slice(0,5),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = [payload.error || 'HTTP ' + response.status, payload.code, payload.stage].filter(Boolean).join(' · ');
        throw new Error(detail + (response.status >= 500 ? ' · 서버 내부 오류야. 추가 생성은 누르지 말고 이 오류 문구를 알려줘.' : ''));
      }
      if (!payload.draft || !['naver','tistory','tistoryEn','shortform'].every(k => typeof payload.draft[k] === 'string')) throw new Error('AI 응답 형식이 잘못됐어.');
      const previousText = saved?.fields?.naver || matchingDraft?.naver || '';
      const newText = String(payload.draft.naver || '');
      const comparedToPrevious = payload.draft.mode !== 'article' ? 'brief' :
        !previousText.trim() ? 'first' :
        previousText.trim() === newText.trim() ? 'same' : 'changed';
      const draft: Draft = {
        ...payload.draft, id: selected.id, generatedAt: new Date().toISOString(), generationVersion: 4,
        comparedToPrevious,
        status: payload.status || 'unverified_review_required',
        sources: selected.headlines.map(h => ({ publisher: h.publisher, url: h.url, title: h.title })),
      };
      // Preserve the most recent paid response separately from bundled public files.
      setLocalDrafts(old => [draft, ...old.filter(x => x.id !== selected.id)]);
      if (draft.mode === 'article') {
        setLocalEdits(old => ({
          ...old,
          [selected.id]: {
            fields: { naver: draft.naver, tistory: draft.tistory, tistoryEn: draft.tistoryEn || '', shortform: draft.shortform },
            titles: { naver: draft.naverTitle || draft.title, tistory: draft.tistoryTitle || draft.title, tistoryEn: draft.tistoryEnTitle || draft.title },
            imageNotes: payload.draft.imageNotes,
            verified: false,
            publishedUrls: old[selected.id]?.publishedUrls || {},
            publishedManually: old[selected.id]?.publishedManually ?? false,
            publishedTopicTitle: old[selected.id]?.publishedTopicTitle,
            publishedSourceUrls: old[selected.id]?.publishedSourceUrls,
            updatedAt: new Date().toISOString(),
            generatedVersion: DRAFT_VERSION,
            evidenceReview: {},
            selectedImage: old[selected.id]?.selectedImage,
            selectedImages: old[selected.id]?.selectedImages,
            imageRightsApproved: old[selected.id]?.imageRightsApproved || [],
            imageKeywords: draft.imageKeywords || [],
          },
        }));
      }
      setImageGroups([]);
      setImageSourceNotice('');
      setChannel('naver');
      setPreviewMode(true);
      setNotice(draft.status === 'revision_required' ? '검수용 초안은 저장했어. 분량, 출처, 채널별 구성 등 보완 항목을 확인해 줘.' : draft.mode === 'research_brief'
        ? '참고 자료가 부족해서 글을 억지로 생성하지 않았어. 조사 항목을 확인해 줘.'
        : '자료를 조사해 AI 원고를 작성했어. 출처와 내용을 확인한 뒤 편집해 줘.');
    } catch (e) {
      if (e instanceof TypeError) {
        setGenerateError('Worker 요청을 보내거나 응답을 받지 못했어 (Failed to fetch). CORS 사전 요청, 네트워크 차단, Worker 연결 또는 장시간 응답 중단 가능성이 있어. API 요청이 이미 처리됐을 수도 있으니 바로 다시 누르지 말고 Cloudflare 요청 기록을 확인해 줘.');
      } else {
        setGenerateError(e instanceof Error ? e.message : '원고 생성 중 오류가 발생했어.');
      }
    } finally { setGenerating(false); }
  }
  const categories = useMemo(() => ['전체', ...Array.from(new Set(candidates.map(x => x.category)))], [candidates]);
  const publicMatchFor = (candidate: Candidate) => matchPublished(candidate, publishedFeed?.posts || []);
  const isPublishedTopic = (candidate: Candidate) => {
    // Avoid hiding unrelated topics; only use exact topic identity, exact normalized title
    // or source URLs recorded when the topic was published.
    const canonicalTitle = (title: string) => title.toLowerCase().normalize('NFKC')
      .replace(/[\s\p{P}\p{S}]/gu, '');
    const candidateTitle = canonicalTitle(candidate.title);
    return (publicMatchFor(candidate)?.type === 'confirmed') || Object.entries(localEdits).some(([id, edit]) => {
      const published = !!edit.publishedManually || Object.values(edit.publishedUrls || {}).some(Boolean);
      if (!published) return false;
      if (id === candidate.id) return true;
      if (edit.publishedTopicTitle && canonicalTitle(edit.publishedTopicTitle) === candidateTitle) return true;
      const urls = new Set(edit.publishedSourceUrls || []);
      return candidate.headlines.some(headline => urls.has(headline.url));
    });
  };
  const publishedTopicsCount = candidates.filter(isPublishedTopic).length;
  const visible = useMemo(() => candidates.filter(x => {
    if (!showExcluded && (x.status === 'excluded_promotion' || x.status === 'sensitive_review')) return false;
    if (category !== '전체' && x.category !== category) return false;
    if (languageFilter !== 'all' && x.region !== languageFilter) return false;
    if (!showPublished && isPublishedTopic(x)) return false;
    if (query.trim() && !(x.title + ' ' + x.category).toLowerCase().includes(query.toLowerCase().trim())) return false;
    return true;
  }), [candidates, category, languageFilter, showExcluded, showPublished, localEdits, publishedFeed, query]);
  const selected = candidates.find(x => x.id === selectedId);
  const activeResearch = researchLeads.find(x => x.candidateId === selectedId);
  const matchingDraft = selected && (
    localDrafts.find(d => d.id === selected.id) ||
    drafts.find(d => d.id === selected.id || (d.sources || []).some(s => selected.headlines.some(h => h.url === s.url)))
  );
  const editId = selected?.id || '';
  const saved = localEdits[editId];
  const legacyStored = !!saved && saved.generatedVersion !== DRAFT_VERSION && Object.values(saved.fields || {}).some(value => !!value?.trim());
  const legacyPublic = !!matchingDraft && matchingDraft.mode !== 'article' && matchingDraft.mode !== 'research_brief';
  // When latest research cannot produce an article, never mix its new sources with an old cached body.
  const currentDraft = !legacyStored && !legacyPublic && matchingDraft?.mode !== 'research_brief' &&
    (matchingDraft?.mode === 'article' || !!saved?.fields?.[channel]);
  const storedText = matchingDraft?.mode === 'research_brief' ? '' :
    legacyStored ? (saved?.fields?.[channel] || '') :
    legacyPublic ? '' : (saved?.fields?.[channel] ?? matchingDraft?.[channel] ?? '');
  const text = channel === 'shortform' ? storedText : channel === 'tistoryEn'
    ? normalizeEnglishArticleTags(storedText, saved?.titles?.tistoryEn || matchingDraft?.tistoryEnTitle || matchingDraft?.title || '')
    : normalizeArticleTags(storedText,
    saved?.titles?.[channel] || (channel === 'naver' ? matchingDraft?.naverTitle : matchingDraft?.tistoryTitle) || matchingDraft?.title || selected?.title || '', selected?.category || '');
  const articleTitle = channel === 'shortform' ? (matchingDraft?.title || selected?.title || '') :
    (saved?.titles?.[channel] || (channel === 'naver' ? matchingDraft?.naverTitle : channel === 'tistoryEn' ? matchingDraft?.tistoryEnTitle : matchingDraft?.tistoryTitle) || matchingDraft?.title || selected?.title || '');
  const referenceAppendix = matchingDraft?.mode === 'article' && matchingDraft?.sourceLinks?.length
    ? '\n\n참고자료 (내용·저작권 확인 후 발행)\n' + matchingDraft.sourceLinks.map((source, i) => (i + 1) + '. ' + (source.title || '원문') + ' — ' + source.url).join('\n')
    : '';
  const copyableArticle = channel === 'shortform' ? text : articleTitle.trim() + '\n\n' + text + referenceAppendix;
  const previewLines = paragraphLines(text);
  const cardPositions = imagePositions(previewLines);
  const readiness = articleReadiness(text, channel === 'tistoryEn' ? 'tistoryEn' : channel === 'tistory' ? 'tistory' : 'naver');
  const articleCopyBlocked = channel !== 'shortform' && readiness.publishBlocked;
  const reviewed = saved?.evidenceReview?.[channel];
  const reviewIsStale = !!reviewed && reviewed.reviewedText !== text;
  const selectedImages = saved?.selectedImages || (saved?.selectedImage ? [saved.selectedImage] : []);
  const selectedImage = selectedImages[0];
  const imageKeywords = saved?.imageKeywords?.length ? saved.imageKeywords :
    matchingDraft?.imageKeywords?.length ? matchingDraft.imageKeywords : selected ? [selected.title] : [];
  const imageRightsApproved = saved?.imageRightsApproved || [];
  const approvedImages = selectedImages.filter(image => imageRightsApproved.includes(image.imageUrl));
  const verified = !!saved?.verified;
  const images = saved?.imageNotes?.length === 3 ? saved.imageNotes : imagePrompts(selected);
  const reviewCount = candidates.filter(x => x.status === 'research_required' || x.status === 'needs_sources').length;
  const excludedCount = candidates.filter(x => ['excluded_promotion', 'sensitive_review'].includes(x.status || '')).length;
  const editCount = Object.values(localEdits).filter(x => Object.values(x.fields || {}).some(s => s?.trim())).length;
  const publishedCount = Object.values(localEdits).reduce((sum, x) => sum + Object.values(x.publishedUrls || {}).filter(Boolean).length, 0);
  function updateEdit(patch: Partial<LocalEdit>) {
    if (!editId) return;
    setLocalEdits(old => ({ ...old, [editId]: {
      fields: { ...(old[editId]?.fields || {}), ...(patch.fields || {}) },
      titles: { ...(old[editId]?.titles || {}), ...(patch.titles || {}) },
      imageNotes: patch.imageNotes || old[editId]?.imageNotes || imagePrompts(selected),
      verified: patch.verified ?? old[editId]?.verified ?? false,
      publishedUrls: { ...(old[editId]?.publishedUrls || {}), ...(patch.publishedUrls || {}) },
      publishedManually: patch.publishedManually ?? old[editId]?.publishedManually ?? false,
      publishedTopicTitle: patch.publishedTopicTitle ?? old[editId]?.publishedTopicTitle,
      publishedSourceUrls: patch.publishedSourceUrls ?? old[editId]?.publishedSourceUrls,
      updatedAt: new Date().toISOString(),
      generatedVersion: patch.generatedVersion ?? old[editId]?.generatedVersion,
      evidenceReview: { ...(old[editId]?.evidenceReview || {}), ...(patch.evidenceReview || {}) },
      selectedImage: patch.selectedImage ?? old[editId]?.selectedImage,
      selectedImages: patch.selectedImages ?? old[editId]?.selectedImages,
      imageKeywords: patch.imageKeywords ?? old[editId]?.imageKeywords,
      imageRightsApproved: patch.imageRightsApproved ?? old[editId]?.imageRightsApproved,
    } }));
  }
  function recoverStoredDraft() {
    if (!editId || !saved || !Object.values(saved.fields || {}).some(value => value?.trim())) return;
    // Never call the paid endpoint; preserve the exact existing text and user edits.
    updateEdit({ generatedVersion: DRAFT_VERSION, verified: false });
    setPreviewMode(true);
    setNotice('브라우저에 저장돼 있던 원고를 복구했어. 재생성 비용은 발생하지 않았어. 내용과 출처를 직접 검수해 줘.');
  }
  function archiveOldDraft() {
    if (!editId || !saved) return;
    download('todaypick-old-draft-backup.json', JSON.stringify({ topic: selected?.title, data: saved }, null, 2), 'application/json');
    setLocalEdits(old => {
      const copy = { ...old };
      delete copy[editId];
      return copy;
    });
    setNotice('기존 초안을 백업한 뒤 이 화면에서 초기화했어. 새 자료 조사 버튼으로 다시 생성해 줘.');
  }
  function choose(id: string, next: Section = 'editor') {
    imageRequestId.current += 1;
    setImageResults([]); setImageGroups([]); setImageError(''); setImageSourceNotice(''); setImageQuery('');
    setSelectedId(id);
    setChannel('naver');
    setSection(next);
    setNotice('');
  }
  async function verifyCurrentDraft() {
    if (!selected || !text.trim() || !studioPassphrase || verifying) return;
    setVerifyError('');
    setVerifying(true);
    try {
      const response = await fetch(WORKER_URL + '/verify', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-Studio-Passphrase':studioPassphrase },
        body:JSON.stringify({title: articleTitle, article:text, sources:matchingDraft?.sourceLinks || []}),
      });
      const value = await response.json().catch(()=>({}));
      if (!response.ok || !value.result) throw Error(value.error || '검증 API 요청 실패 (HTTP '+response.status+')');
      updateEdit({evidenceReview:{[channel]:{...value.result,reviewedText:text}},verified:false});
      setNotice('근거 대조 결과를 저장했어. 지원·충돌·미확인 판정은 참고용이며, 직접 출처를 확인해야 해.');
    } catch (error) {setVerifyError(error instanceof Error ? error.message : '검증에 실패했어.');}
    finally {setVerifying(false);}
  }
  async function searchImages() {
    if (imageQuery.trim().length < 2 || imageSearching) return;
    setImageError('');
    setImageSearching(true);
    setImageResults([]);
    const query = imageQuery.trim();
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    const params = {
      action: 'query', generator: 'search', gsrsearch: query,
      gsrnamespace: '6', gsrlimit: '18', prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime', iiurlwidth: '480',
      format: 'json', origin: '*',
    };
    Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
    const plain = (value: unknown) => String(value || '').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim().slice(0,180);
    try {
      const response = await fetch(url.toString(), {signal: AbortSignal.timeout(16000)});
      if (!response.ok) throw new Error('Wikimedia Commons HTTP '+response.status);
      const data = await response.json();
      const pages: any[] = Object.values(data.query?.pages || {});
      const images: ImageSearchResult[] = pages.flatMap(page=>{
        const info = page.imageinfo?.[0];
        if (!info || !String(info.mime || '').startsWith('image/')) return [];
        const meta = info.extmetadata || {};
        const license = plain(meta.LicenseShortName?.value);
        if (!/^(CC0|CC BY(?: 1\.0| 2\.0| 2\.5| 3\.0| 4\.0)?|Public domain)$/i.test(license)) return [];
        const sourceUrl = info.descriptionurl;
        const imageUrl = info.url;
        const thumbnailUrl = info.thumburl || info.url;
        if (![sourceUrl,imageUrl,thumbnailUrl].every(value => {
          try {return new URL(value).protocol==='https:';}catch{return false;}
        })) return [];
        return [{
          id: String(page.pageid || page.title),
          title: String(page.title || '').replace(/^File:/,'').slice(0,140),
          creator: plain(meta.Artist?.value) || '제작자 확인 필요',
          license, licenseVersion: '',
          licenseUrl: /^https:\/\//.test(String(meta.LicenseUrl?.value || '')) ? meta.LicenseUrl.value : sourceUrl,
          sourceUrl, imageUrl, thumbnailUrl,
          attribution: plain(meta.Attribution?.value) || '원본에서 저작자와 이용 조건 확인 필요',
        }];
      }).slice(0,12);
      setImageResults(images);
      if (!images.length) setImageError('명시된 CC0·CC BY·퍼블릭 도메인 이미지 후보가 없어. 검색어를 바꾸거나 구글에서 원본을 찾아봐.');
    } catch(error) {
      setImageError('이미지 검색에 실패했어 ('+(error instanceof Error?error.message:'연결 문제')+'). 구글 이미지 검색 또는 원본 URL 직접 등록을 이용해 줘.');
    } finally {setImageSearching(false);}
  }
  function toggleSavedImage(item: ImageSearchResult) {
    const current = saved?.selectedImages || (saved?.selectedImage ? [saved.selectedImage] : []);
    const exists = current.some(x=>x.id===item.id && x.sourceUrl===item.sourceUrl);
    const next = exists ? current.filter(x=>!(x.id===item.id && x.sourceUrl===item.sourceUrl)) : [...current,item].slice(0,8);
    updateEdit({selectedImages:next,selectedImage:next[0],verified:false});
  }
  function addManualImage() {
    const validHttps = (raw:string) => {try{const parsed=new URL(raw.trim());return parsed.protocol==='https:' && !parsed.username && !parsed.password;}catch{return false;}};
    if (!validHttps(manualImageUrl)||!validHttps(manualSourceUrl)) {
      setImageError('이미지 파일 주소와 원본 출처 주소를 둘 다 HTTPS URL로 입력해 줘.');
      return;
    }
    const item: ImageSearchResult = {
      id:'manual-'+manualImageUrl.trim(),
      title:'직접 등록한 이미지 (사용 권한 미확인)', creator:'확인 필요',
      license:'미확인',licenseVersion:'',licenseUrl:manualSourceUrl.trim(),
      sourceUrl:manualSourceUrl.trim(),imageUrl:manualImageUrl.trim(),
      thumbnailUrl:manualImageUrl.trim(),attribution:'원본에서 저작권·초상권·사용 허가 확인 필요',
    };
    const old = saved?.selectedImages || (saved?.selectedImage ? [saved.selectedImage] : []);
    const next=[...old.filter(x=>x.id!==item.id),item].slice(0,8);
    updateEdit({selectedImages:next,selectedImage:next[0],verified:false});
    setImageError('');setManualImageUrl('');setManualSourceUrl('');
    setNotice('외부 이미지 후보를 보관했어. 원본 권한 확인 전에는 발행에 사용하지 마.');
  }
  async function copyToClipboard(content: string, target: 'title' | 'article') {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopyFeedback(previous => ({ id: (previous?.id || 0) + 1, kind: 'success', target }));
    } catch {
      setCopyFeedback(previous => ({ id: (previous?.id || 0) + 1, kind: 'error', target }));
    }
  }
  async function copyText() {
    return copyToClipboard(copyableArticle, 'article');
  }
  async function copyWithImagePositions() {
    if (channel === 'shortform' || !text.trim()) return;
    return copyToClipboard(articleTitle.trim() + '\n\n' + withImageMarkers(text) + referenceAppendix, 'article');
  }
  function exportText() {
    download('todaypick-' + channel + '-draft.txt', copyableArticle + '\n\n' + images.map((n,i) => '[이미지 ' + (i + 1) + '] ' + n).join('\n'), 'text/plain;charset=utf-8');
  }
  function savePublished(channelId: 'naver' | 'tistory' | 'tistoryEn', value: string) {
    if (!value.trim()) { updateEdit({ publishedUrls: { [channelId]: '' } }); setNotice('기록된 게시 URL을 비웠어.'); return; }
    if (!safePublishedUrl(value, channelId)) { setNotice('오늘의 픽 블로그에서 발행한 https 주소를 입력해 줘.'); return; }
    updateEdit({ publishedUrls: { [channelId]: value.trim() },
      publishedTopicTitle: selected?.title,
      publishedSourceUrls: selected?.headlines.map(item=>item.url) || [] });
    setNotice('발행 URL 저장 완료. 이 주제는 탐색 추천에서 자동 제외돼.');
  }
  const [urlInput, setUrlInput] = useState<Record<'naver'|'tistory'|'tistoryEn', string>>({naver: '', tistory: '', tistoryEn: ''});
  useEffect(() => { setUrlInput({ naver: saved?.publishedUrls?.naver || '', tistory: saved?.publishedUrls?.tistory || '', tistoryEn: saved?.publishedUrls?.tistoryEn || '' }); }, [selectedId, saved?.publishedUrls?.naver, saved?.publishedUrls?.tistory, saved?.publishedUrls?.tistoryEn]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><div><strong>AI Blog Studio</strong><small>TODAY&apos;S PICK</small></div></div>
      <nav aria-label="주요 메뉴">
        <button className={section === 'discover' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('discover')}><span>⌕</span> 주제 탐색</button>
        <button className={section === 'editor' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('editor')}><span>✎</span> 콘텐츠 스튜디오</button>
        <button className={section === 'publish' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('publish')}><span>↗</span> 발행 관리</button>
      </nav>
      <div className="side-bottom"><span className="state-dot" /> Public preview<div>AI 원고 생성은 Worker 연결 후 이용 가능.</div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><span>오늘의 픽 / {section === 'discover' ? '주제 탐색' : section === 'editor' ? '콘텐츠 스튜디오' : '발행 관리'}</span><div><a href={links.naver} target="_blank" rel="noreferrer">네이버 ↗</a><a href={links.tistory} target="_blank" rel="noreferrer">티스토리 ↗</a></div></header>
      <div className="main-inner">
        <div className="page-head"><div><span className="eyebrow">CONTENT WORKSPACE</span><h1>{section === 'discover' ? '오늘 어떤 콘텐츠를 만들까?' : section === 'editor' ? '콘텐츠 스튜디오' : '발행 관리'}</h1><p>{section === 'discover' ? '실제 수집된 이슈를 검토하고 제작할 주제를 선택해 봐.' : section === 'editor' ? '검수용 초안을 편집하고 이미지 배치를 계획해 봐.' : '발행한 콘텐츠의 링크와 진행 상태를 관리해 봐.'}</p></div><a className="btn btn-light" href={links.collect} target="_blank" rel="noreferrer">뉴스 수집 관리 ↗</a></div>
        <div className="privacy-note"><strong>공개 프리뷰</strong> · 뉴스와 AI 검수 초안은 공개 저장소 데이터야. 직접 수정한 글과 게시 기록은 이 기기 브라우저에만 임시 저장되고 다른 기기와 동기화되지 않아. 비밀번호·개인정보·비공개 원고를 입력하지 마.</div>
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="닫기">×</button></div>}
        {section === 'discover' && <>
          <div className="metric-grid">
            <div className="metric"><small>자료 조사 가능한 후보</small><strong>{reviewCount}</strong><span>기사 제목 기반 · 조사 전 단계</span></div>
            <div className="metric"><small>제외된 이슈</small><strong>{excludedCount}</strong><span>홍보성·민감 이슈</span></div>
            <div className="metric"><small>자동 조사 완료 후보</small><strong>{researchLeads.filter(x=>x.status==='needs_human_review').length}</strong><span>사람이 근거를 확인할 후보</span></div>
          </div>
          <div className="section-title"><div><h2>수집된 콘텐츠 후보</h2><p>{updatedAt ? '마지막 분석 ' + new Date(updatedAt).toLocaleString('ko-KR') : '뉴스 수집 후 목록이 업데이트돼.'}</p></div><span className="small-label">점수는 검색량·수익 예측이 아닌 내부 편집 기준</span></div>
          <div className="published-feed-status">
            <strong>내 블로그 자동 발행 확인 (공개 RSS)</strong>
            {publishedFeed ? <>
              <span>네이버 {publishedFeed.sources.find(x=>x.channel==='naver')?.count ?? 0}건 · 티스토리 {publishedFeed.sources.find(x=>x.channel==='tistory')?.count ?? 0}건 조회</span>
              <span>마지막 확인: {new Date(publishedFeed.generatedAt).toLocaleString('ko-KR')}</span>
              {publishedFeed.sources.some(source => source.status !== 'ok') && <span className="warning-line">일부 피드 조회에 실패해 이전 기록을 유지했어. RSS 미노출 글은 자동 판별하지 못해.</span>}
            </> : <span>{publishedFeedError || '공개 발행 기록을 확인하는 중…'}</span>}
            <small>확실히 같은 주제만 자동 제외하고, 비슷한 글은 중복 의심으로 표시해. 공개 RSS 최신 글만 확인할 수 있어.</small>
          </div>
          <div className="filters"><select aria-label="콘텐츠 언어 선택" value={languageFilter} onChange={e => setLanguageFilter(e.target.value as 'all' | 'KO' | 'EN')}><option value="all">전체 언어</option><option value="KO">한국어 콘텐츠</option><option value="EN">영어 콘텐츠 · Shorts/Reels</option></select><input value={query} onChange={e => setQuery(e.target.value)} placeholder="기사나 키워드 검색" aria-label="키워드 검색"/><select value={category} onChange={e => setCategory(e.target.value)} aria-label="카테고리 필터">{categories.map(v => <option key={v}>{v}</option>)}</select><label className="inline-check"><input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)}/> 제외된 주제 보기</label><label className="inline-check"><input type="checkbox" checked={showPublished} onChange={e => setShowPublished(e.target.checked)}/> 발행 완료 포함 ({publishedTopicsCount})</label></div>
          {loading ? <div className="state-card">콘텐츠 후보를 불러오는 중...</div> : loadError ? <div className="state-card">{loadError}</div> : visible.length === 0 ? <div className="state-card">조건에 맞는 후보가 없어. 필터를 변경하거나 뉴스 수집을 실행해 줘.</div> : <div className="recommend-list">{visible.slice(0, 30).map(c => { const rssMatch = publicMatchFor(c); return <article className="recommend-card" key={c.id}><div className="topic-main"><div className="pill-row"><span className="pill">{c.category}</span><span className="pill subtle">{c.region === 'EN' ? '영어 블로그·Shorts' : '국내 / 한국어'}</span><span className={'pill ' + (c.status === 'research_required' ? 'green' : c.status === 'needs_sources' ? 'yellow' : 'red')}>{statusLabel[c.status || 'needs_sources']}</span>{rssMatch?.type === 'suspected' && <span className="pill yellow">중복 의심</span>}</div><h3>{c.title}</h3><p className="muted">{c.headlines.length}개 기사 · {c.scores.independentPublisherCount}개 매체 · {c.reasons?.[0] || '출처 검증 필요'}</p></div><div className="topic-actions"><span className="priority">검토 우선순위 <strong>{c.scores.editorialPriority}</strong></span><button className="btn btn-primary" onClick={() => choose(c.id)}>{c.status === 'research_required' || c.status === 'needs_sources' ? '자료 조사 →' : '제외 사유 보기 →'}</button></div>
                    {rssMatch && <div className={'published-match '+rssMatch.type}>
                      <strong>{rssMatch.type==='confirmed'?'공개 RSS에서 발행 확인':'중복 의심 · 직접 확인 필요'}</strong>
                      <span>{rssMatch.reason} · {rssMatch.post.channel==='naver'?'네이버':'티스토리'}</span>
                      <a href={rssMatch.post.url} target="_blank" rel="noopener noreferrer">{rssMatch.post.title} ↗</a>
                    </div>}
                  </article>; })}</div>}
        </>}
        {section === 'editor' && <div className="studio-grid">
          <div className="editor-main">
            <div className="panel">
              <div className="panel-heading"><h2>제작할 주제</h2><span>{candidates.length}개 수집 후보</span></div>
              <select className="wide-select" aria-label="주제 선택" value={selectedId} onChange={e => { setSelectedId(e.target.value); setNotice(''); }}>
                <option value="">주제를 선택해 줘</option>
                {candidates.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}
              </select>
              {selected && publicMatchFor(selected) && <div className="published-match suspected">
                <strong>{publicMatchFor(selected)?.type === 'confirmed' ? '이미 발행된 주제야' : '기존 발행 글과 비슷한 주제야'}</strong>
                <p>새 기사를 작성하기 전에 아래 발행 글과 중복 여부를 확인해 줘.</p>
                <a href={publicMatchFor(selected)?.post.url} target="_blank" rel="noopener noreferrer">{publicMatchFor(selected)?.post.title} ↗</a>
              </div>}
              {selected && <div className="source-summary"><div className="pill-row"><span className="pill">{selected.category}</span><span className={'pill ' + (selected.status === 'research_required' ? 'green' : 'yellow')}>{statusLabel[selected.status || 'needs_sources']}</span></div><p>{selected.reasons?.join(' · ')}</p><details><summary>참고 뉴스 {selected.headlines.length}개와 출처 보기</summary><ul>{selected.headlines.map((h,i) => <li key={i}><a href={h.url} target="_blank" rel="noreferrer">{h.publisher || '출처'} — {h.title} ↗</a></li>)}</ul></details></div>}
            </div>
            <div className="panel">
              <div className="panel-heading"><div><h2>자동 자료 조사</h2><p>매일 최대 {researchDailyLimit}개 후보를 자동 조사해. 결과는 사람이 사실을 확인해야 하는 참고자료야.</p></div><a className="btn btn-light" href="https://github.com/jjuniverse/ai-blog-studio/actions/workflows/research-news.yml" target="_blank" rel="noreferrer">조사 실행 기록 ↗</a></div>
              {activeResearch ? <div className="research-lead">
                <div className="pill-row"><span className={'pill '+(activeResearch.status==='needs_human_review'?'green':'yellow')}>{activeResearch.status==='needs_human_review'?'추가 검토 가능':activeResearch.status==='insufficient_evidence'?'근거 부족':'조사 실패'}</span><span className="pill subtle">{new Date(activeResearch.researchedAt).toLocaleString('ko-KR')}</span></div>
                <p>{activeResearch.summary || '근거 확보가 완료되지 않았어.'}</p>
                {(activeResearch.keyFacts||[]).length>0 && <><strong>AI가 추출한 확인 대상 사실</strong><ul>{activeResearch.keyFacts?.map((fact,i)=><li key={i}>{fact}</li>)}</ul></>}
                {(activeResearch.openQuestions||[]).length>0 && <><strong>추가 확인할 내용</strong><ul>{activeResearch.openQuestions?.map((q,i)=><li key={i}>{q}</li>)}</ul></>}
                {(activeResearch.sources||[]).length>0 && <><strong>참고 출처</strong><ul>{activeResearch.sources?.map((source,i)=><li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title||source.url} ↗</a></li>)}</ul></>}
                <p className="muted">출처를 찾았다는 것은 사실 확인 완료를 뜻하지 않아. AI 결과와 실제 공식 문서를 대조한 뒤 원고를 생성해 줘.</p>
              </div> : <div className="research-lead"><p>이 주제의 자동 조사 결과가 아직 없어. 매일 선별된 일부 후보만 조사하므로 모두 조사되지는 않아.</p></div>}
            </div>
            <div className="panel editor-panel">
              <div className="panel-heading"><div><h2>원고 편집 · AI 생성</h2><p>검토 후보와 추가 출처 필요 주제도 생성할 수 있어. 단일 출처는 사실 검증용 초안만 제공해.</p></div></div>
              <div className="inline-generator">
                <div className="panel-heading"><strong>AI 연결</strong><span>Worker 주소 자동 연결됨</span></div>
                <div className="generator-inputs">
                  <div className="worker-endpoint"><small>연결된 Worker</small><span>https://todaypick-studio-api.jjuniverse-plant-lens.workers.dev</span></div>
                  <label>관리자 암호 (저장되지 않음)<input type="password" autoComplete="off" placeholder="Cloudflare에 등록한 STUDIO_PASSWORD" value={studioPassphrase} onChange={e=>setStudioPassphrase(e.target.value)}/></label>
                </div>
                <label className="notes-label">직접 확인한 사실 메모 (선택)<textarea rows={3} value={verifiedNotes} onChange={e=>setVerifiedNotes(e.target.value)} placeholder="직접 확인한 내용과 공식 자료 링크가 있으면 추가해 줘. 비워도 AI가 자료를 조사해."/></label>
                <p className="generator-help">{!selected?'주제를 먼저 선택해 줘.':!studioPassphrase?'관리자 암호를 입력한 뒤 생성 버튼을 눌러 줘.':selected.status==='needs_sources'?'제목만 수집한 단계야. 자료 조사 버튼으로 공식 발표·관련 자료를 추가로 찾아봐. 검증 후 글을 만들 수 있어.':selected.status!=='research_required'?'이 주제는 홍보성·민감 이슈로 제한돼.':'생성 준비 완료 · 검수용 초안이며 실제 발행 전 사실 확인이 필요해.'}</p>
                <div className="worker-health">
                  <button type="button" className="btn btn-light" disabled={connectionState==='checking'||generating} onClick={checkWorkerConnection}>{connectionState==='checking'?'연결 확인 중…':'통신 + 관리자 인증 검사 (무료)'}</button>
                  <span className={connectionState==='ready'?'worker-health-ok':connectionState==='unreachable'||connectionState==='unconfigured'?'worker-health-bad':'worker-health-idle'}>{connectionState==='ready'?'정상':connectionState==='unreachable'?'연결 불가':connectionState==='unconfigured'?'서버 설정 필요':'검사 전'}</span>
                  {connectionDetails&&<p role="status">{connectionDetails}</p>}
                </div>
                <div className="generator-actions"><button className="btn btn-primary" disabled={generating||!selected} onClick={generateHere}>{generating?'AI 생성 중…':'✦ 자료 조사하고 원고 생성'}</button><span>OpenAI 웹 검색 + 원고 작성 비용 발생 · 먼저 무료 연결 테스트 권장</span></div>
                {generateError&&<p className="generator-error" role="alert">{generateError}</p>}
                <p className="muted">Worker URL은 자동 연결했어. 관리자 암호는 브라우저에 저장하지 않아. Cloudflare Secrets 등록이 완료돼야 실제 생성돼.</p>
              </div>
              {!selected && <div className="empty-editor"><h3>아직 선택한 주제가 없어</h3><p>위에서 제작할 주제를 고르거나 아래 저장된 초안을 선택하면 해당 원고를 표시할게.</p></div>}
              <div className="draft-selector"><strong>AI 초안 · 내 브라우저 {localDrafts.length}건 / 서버 제공 {drafts.length}건</strong>
                {localDrafts.length+drafts.length===0 ? <p className="muted">현재 저장된 초안이 없어.</p> : [...localDrafts, ...drafts.filter(d => !localDrafts.some(local => local.id === d.id))].map((d,i)=>{
                  const corresponding=candidates.find(c=>c.id===d.id||(d.sources||[]).some(src=>c.headlines.some(h=>h.url===src.url)));
                  return <button type="button" key={d.id+'-'+i} className="saved-draft" disabled={!corresponding} onClick={()=>{if(corresponding){setSelectedId(corresponding.id);setChannel('naver');setNotice('기존 AI 검수 초안을 불러왔어.');}}}>
                    <span><b>{d.title}</b><small>{corresponding?'네이버·티스토리·숏폼 초안 보기':'현재 뉴스 목록에서 해당 주제를 찾을 수 없어'}</small></span><span>보기 →</span>
                  </button>;
                })}
                <p className="muted">초안은 발행용 완성 글이 아니라 출처 검증이 필요한 준비 자료야.</p>
              </div>
              {matchingDraft?.generatedAt ? <div className="research-lead" role="status">
                <strong>마지막 AI 요청 결과 · {new Date(matchingDraft.generatedAt).toLocaleString('ko-KR')}</strong>
                <p>{matchingDraft.mode==='article'
                  ? matchingDraft.comparedToPrevious==='same' ? 'API는 새로 응답했지만 네이버 본문이 이전 저장본과 완전히 동일해. 다른 주제로 시도하거나 원고를 직접 개선해 줘.'
                    : matchingDraft.comparedToPrevious==='changed' ? '이전 저장본과 비교해 새 본문으로 변경됐어. 현재 화면에는 가장 최근 생성 결과가 표시돼.'
                    : '가장 최근에 받은 원고야. 브라우저에 별도로 보관하고 있어.'
                  : '이번 조사에서 발행용 원고가 만들어지지 않았어. 이전 본문을 새 결과로 표시하지 않도록 숨겼어.'}</p>
              </div> : matchingDraft?.mode==='article' && saved?.fields?.[channel] ? <div className="research-lead">
                <strong>이전 저장본 · 생성 시각 확인 불가</strong>
                <p>현재 보이는 글은 이전 브라우저 저장본일 수 있어. 새로 생성된 원고라고 판단하지 말아 줘.</p>
              </div> : null}
              {(legacyStored || legacyPublic) && <div className="legacy-draft-warning">
                <strong>저장된 원고의 버전 정보가 없어</strong>
                <p>원고 자체는 브라우저에 남아 있어. 이전 버전일 수도 있고, 새 생성 후 버전 정보만 빠졌을 수도 있어. 재생성 없이 내용을 복구해 확인할 수 있어.</p>
                {legacyStored ? <div className="editor-toolbar">
                  <button className="btn btn-primary" onClick={recoverStoredDraft}>저장된 원고 복구해서 보기 (무료)</button>
                  <button className="btn btn-light" onClick={archiveOldDraft}>백업 후 초기화</button>
                </div> : <span>서버에서 가져온 과거 초안은 자동 표시하지 않아.</span>}
              </div>}
              {selected?.region === 'EN' && <div className="research-lead"><strong>해외 콘텐츠</strong><p>티스토리 English 탭에서 영어 블로그 원고를, 숏폼 대본 탭에서 해외 Shorts·Reels 대본을 확인할 수 있어.</p></div>}
              {channel === 'tistoryEn' && matchingDraft?.mode==='article' && !storedText.trim() && <div className="draft-warning">이전에 생성된 초안에는 영문 원고가 없어. 이전 원고를 영어로 자동 표시하지 않으며, 새 생성 결과부터 별도 영어 버전이 저장돼.</div>}
              <div className="tabs">{channels.map(c => <button key={c.id} className={channel === c.id ? 'tab active' : 'tab'} onClick={() => setChannel(c.id)}>{c.label}</button>)}</div>
              {!legacyPublic && matchingDraft?.sourceLinks?.length ? <div className="research-sources"><strong>AI 검색에서 찾은 참고 링크 · 내용과 출처 직접 확인</strong><ul>{matchingDraft.sourceLinks.map((src,i)=><li key={i}><a href={src.url} rel="noopener noreferrer" target="_blank">{src.title || src.url} ↗</a></li>)}</ul></div> : null}
              {matchingDraft?.qualityAudit?.warnings?.length ? <div className="draft-warning" role="alert">
                <strong>원고 품질 검사 · 수정 필요</strong>
                <ul>{matchingDraft.qualityAudit.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
                <p>자동 생성 성공이 발행 승인이라는 뜻은 아니야. 사실·채널별 원고·이미지 권리를 확인해 줘.</p>
              </div> : null}
              {!legacyStored && matchingDraft?.mode==='research_brief' ? <div className="draft-warning">
                <strong>원고 보류 · 원인을 확인해 줘</strong>
                <p>기사 내용이 부족하거나 품질 검사에서 탈락했어. 같은 주제를 반복 생성하면 API 비용만 발생할 수 있으니, 먼저 아래 결과를 확인해 줘.</p>
                {matchingDraft.researchAudit && <div className="research-audit">
                  <p>검색에서 발견된 링크 {matchingDraft.researchAudit.searchedSourceCount}개 · 반환된 참고 링크 {matchingDraft.researchAudit.returnedSourceCount}개 · 사이트 {matchingDraft.researchAudit.distinctSourceDomains}곳</p>
                  <strong>생성 보류 사유</strong>
                  <ul>{matchingDraft.researchAudit.reasons.map((x,i)=><li key={i}>{x}</li>)}</ul>
                </div>}
                <strong>추가 검증할 내용</strong>
                <ul>{(matchingDraft.verificationChecklist||[]).map((x,i)=><li key={i}>{x}</li>)}</ul>
                <p>충분한 공식 자료를 찾지 못했다면 다른 주제를 선택하는 게 좋아.</p>
                {saved?.fields && Object.values(saved.fields).some(value => !!value?.trim()) && <div className="editor-toolbar">
                  <button className="btn btn-light" onClick={() => download('todaypick-previous-local-draft.json', JSON.stringify({
                    title: selected?.title, savedAt: saved.updatedAt, previousDraft: saved.fields, previousTitles: saved.titles,
                  }, null, 2), 'application/json')}>이전 저장 원고 백업 (무료)</button>
                  <p className="muted">이 버튼은 이번 실패 결과가 아니라 이 브라우저에 이전부터 남아 있던 원고를 저장해.</p>
                </div>}
              </div> : null}
              {!legacyStored && matchingDraft?.mode==='research_brief' ? <div className="empty-editor"><h3>발행용 본문 없음</h3><p>공식 발표나 독립된 추가 자료를 확인한 뒤 다시 생성해 줘.</p></div> : null}
              {currentDraft && !legacyStored && !!text.trim() ? <>
                {channel !== 'shortform' && readiness.publishBlocked && <div className="draft-warning" role="alert">
                  <strong>보완 필요 · 발행 보류</strong>
                  <p>태그와 참고자료를 제외한 본문은 {readiness.bodyLength}{readiness.units}야. 최소 {readiness.minimum}{readiness.units}, 권장 {readiness.minimum}~{readiness.targetMax}{readiness.units}를 목표로 해. 부족한 원고도 삭제하지 않고 보존해.</p>
                  <ul>{readiness.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>
                  <p>발행용 복사는 본문을 보완한 뒤 사용할 수 있어. 지금은 원고를 편집하거나 검수용 초안으로 저장할 수 있어.</p>
                </div>}

                <div className="draft-warning">이 원고는 AI가 작성한 검수용 자료야. 중요한 사실·출처·이미지 권리를 직접 확인하고 발행해 줘.</div>
                {channel !== 'shortform' && <div className="notes-label">
                  <label htmlFor="editor-post-title">검색형 게시 제목</label>
                  <div className="post-title-row">
                    <input id="editor-post-title" className="wide-select" value={articleTitle} onChange={e=>updateEdit({titles:{[channel]:e.target.value},verified:false})} aria-label={channel==='naver'?'네이버 게시 제목':'티스토리 게시 제목'} />
                    <span className="copy-button-wrap">
                      <button type="button" className="btn btn-light" onClick={()=>copyToClipboard(articleTitle,'title')} disabled={!articleTitle.trim()}>제목 복사</button>
                      {copyFeedback?.target==='title' && <span className={'copy-tooltip '+(copyFeedback.kind==='error'?'copy-tooltip-error':'')} role="status" aria-live="polite">{copyFeedback.kind==='success'?'✓ 복사됐어!':'복사에 실패했어'}</span>}
                    </span>
                  </div>
                </div>}
                <div className="editor-toolbar"><button className={previewMode?'btn btn-primary':'btn btn-light'} onClick={()=>setPreviewMode(true)}>블로그 미리보기</button><button className={!previewMode?'btn btn-primary':'btn btn-light'} onClick={()=>setPreviewMode(false)}>원고 편집</button></div>
                {previewMode ? <div className="post-preview">
                  <div className="post-preview-label">오늘의 픽 · {channel === 'naver'?'네이버 블로그':channel==='tistory'?'티스토리 한국어':channel==='tistoryEn'?'티스토리 English':'숏폼 대본'} 발행 전 미리보기</div>
                  <h1>{articleTitle || '새 글'}</h1>
                  {channel !== 'shortform' && selected && <>
                    <ImageCard title={articleTitle || selected.title} category={selected.category} description={images[0]} variant="cover" index={0}/>
                    {selectedImages.map(img=><figure className="post-selected-image" key={img.id}>
                      <img src={img.imageUrl} alt={img.title} loading="lazy" referrerPolicy="no-referrer" />
                      <figcaption>{img.title} · {img.creator} · {img.license}
                        {' · '}<a href={img.sourceUrl} target="_blank" rel="noopener noreferrer">원본/사용 조건 확인 ↗</a>
                      </figcaption>
                    </figure>)}
                  </>}
                  {previewLines.map((paragraph, i) => <div key={i}>
                    {/^#{1,3}\s+/.test(paragraph) ? <h2>{paragraph.replace(/^#{1,3}\s+/, '')}</h2> : <p>{paragraph}</p>}
                    {i === cardPositions.summary && channel !== 'shortform' && selected && <ImageCard title={articleTitle || selected.title} category={selected.category} description={images[2]} excerpt={text} variant="summary" index={1}/>}
                    {i === cardPositions.detail && channel !== 'shortform' && selected && <ImageCard title={articleTitle || selected.title} category={selected.category} description={images[1]} excerpt={text} variant="detail" index={2}/>}
                  </div>)}
                </div> : <textarea className="draft-text" value={text} onChange={e => updateEdit({fields:{[channel]:e.target.value}, verified:false})} rows={17} placeholder="원고를 입력하거나 생성된 초안을 수정해 줘." aria-label="원고 편집"/>}
                {channel !== 'shortform' && matchingDraft?.sourceLinks?.length ? <div className="research-sources">
                  <strong>본문과 분리한 참고 출처</strong>
                  <ul>{matchingDraft.sourceLinks.map((src,i)=><li key={i}><a href={src.url} rel="noopener noreferrer" target="_blank">{src.title || src.url} ↗</a></li>)}</ul>
                  <p className="muted">글에 적힌 개별 주장과 자료가 실제로 일치하는지 발행 전에 확인해 줘.</p>
                </div> : null}
                <div className="editor-toolbar"><span className="copy-button-wrap">
                  <button className="btn btn-light" onClick={copyText} disabled={!text.trim() || articleCopyBlocked}>원고 복사</button>
                  {copyFeedback?.target==='article' && <span className={'copy-tooltip '+(copyFeedback.kind==='error'?'copy-tooltip-error':'')} role="status" aria-live="polite">
                    {copyFeedback.kind==='success'?'✓ 복사됐어!':'복사에 실패했어'}
                  </span>}
                </span>{channel !== 'shortform' && <button className="btn btn-light" onClick={copyWithImagePositions} disabled={!text.trim() || articleCopyBlocked}>이미지 위치 포함 복사</button>}
                <button className="btn btn-light" onClick={exportText} disabled={!text.trim()}>{articleCopyBlocked ? '검수용 초안 저장' : '텍스트 저장'}</button><label className="review-toggle"><input type="checkbox" checked={verified} onChange={e => updateEdit({verified:e.target.checked})}/> 직접 사실·저작권 검수 완료</label></div>
                {channel !== 'shortform' && <div className="evidence-panel">
                  <div className="panel-heading"><div><h3>원고 근거 대조</h3><p>현재 편집 중인 본문의 핵심 수치·날짜·순위를 추가 웹 검색으로 점검해.</p></div>
                    <button className="btn btn-light" onClick={verifyCurrentDraft} disabled={verifying || !text.trim() || !studioPassphrase}>
                      {verifying?'근거 확인 중…':'근거 대조 실행 (유료)'}
                    </button>
                  </div>
                  {verifyError && <p className="generator-error" role="alert">{verifyError}</p>}
                  {reviewed ? <>
                    <p className="muted">마지막 검사: {new Date(reviewed.checkedAt).toLocaleString('ko-KR')} · 검증 보증이 아닌 AI 검색 기반 점검 결과야.</p>
                    {reviewIsStale && <p className="generator-error" role="alert">검증 이후 본문이 수정됐어. 아래 결과는 이전 버전 기준이니 주요 주장을 다시 확인해 줘.</p>}
                    {reviewed.claims.map((claim,i)=><div className="evidence-claim" key={i}>
                      <span className={'evidence-status '+claim.status}>{claim.status==='supported'?'근거 후보 있음':claim.status==='conflicting'?'상충 가능성':'확인 필요'}</span>
                      <strong>{claim.claim}</strong>
                      <p>{claim.explanation}</p>
                      {(claim.sourceOrganization||claim.measurementPeriod||claim.measurementBasis) && <small>조사: {claim.sourceOrganization || '불명'} · 기간: {claim.measurementPeriod || '불명'} · 기준: {claim.measurementBasis || '불명'}</small>}
                      {!!claim.evidence?.length && <div className="evidence-links">{claim.evidence.map((link,j)=><a key={j} href={link.url} target="_blank" rel="noopener noreferrer">{link.title || '확인한 출처'} ↗</a>)}</div>}
                    </div>)}
                    {!!reviewed.freshnessNotes?.length && <><strong>최신성 점검</strong><ul>{reviewed.freshnessNotes.map((note,i)=><li key={i}>{note}</li>)}</ul></>}
                    {!!reviewed.correctionSuggestions?.length && <><strong>수정 제안</strong><ul>{reviewed.correctionSuggestions.map((suggestion,i)=><li key={i}>{suggestion}</li>)}</ul></>}
                  </> : <p className="muted">아직 대조하지 않았어. 필요한 주제만 검사해서 API 비용을 줄여 줘.</p>}
                </div>}
                {matchingDraft?.verificationChecklist?.length ? <details className="checklist"><summary>AI가 제안한 사실 검증 항목 {matchingDraft.verificationChecklist.length}개</summary><ul>{matchingDraft.verificationChecklist.map((t,i) => <li key={i}>{t}</li>)}</ul></details> : null}
              </> : null}
              {matchingDraft?.mode==='article' && !text.trim() && <div className="empty-editor"><h3>이 채널 원고는 품질 검사를 통과하지 못했어.</h3><p>다른 채널 탭에는 사용 가능한 원고가 있을 수 있어. 빈 글은 게시하지 마.</p></div>}
              {(!matchingDraft || legacyPublic) && !saved?.fields?.[channel] && <div className="empty-editor"><span className="empty-symbol">✦</span><h3>이 주제의 원고는 아직 없어</h3><p>위에서 자료 조사 버튼을 눌러 줘. 신뢰할 만한 근거가 부족하면 글 대신 확인할 항목을 표시해.</p></div>}
            </div>
          </div>
          <aside className="studio-side">
            {selected && currentDraft && channel !== 'shortform' && text.trim() && <div className="panel">
              <PostImagePackage key={selected.id + '-' + channel + '-' + articleTitle + '-' + text}
                title={articleTitle} category={selected.category} article={text} referenceAppendix={referenceAppendix} channel={channel}/>
            </div>}
            <div className="panel"><div className="panel-heading"><h2>이미지 배치 계획</h2><span>자체 제작 PNG</span></div><p className="muted">위의 PNG 3장 제작 버튼으로 실제 파일을 생성하고 묶음 다운로드할 수 있어. 이 설명은 각 이미지의 기본 기획이야.</p>{images.map((img,i) => <div key={i} className="image-slot"><div className="image-placeholder"><span>{i === 0 ? '▣' : i === 1 ? '▤' : '☰'}</span><small>이미지 {i+1}</small></div><label><strong>{['대표 이미지', '본문 설명', '핵심 요약'][i]}</strong><textarea rows={3} aria-label={'이미지 '+(i+1)+' 설명'} value={img} onChange={e => updateEdit({imageNotes:images.map((v,k) => k === i ? e.target.value : v)})}/></label></div>)}</div>
            <div className="panel">
              <div className="panel-heading"><h2>이미지 후보 찾기·저장</h2><span>최대 8장 · 이 브라우저 보관</span></div>
              <p className="muted">구글 이미지를 새 탭에서 검색하거나, 라이선스 정보가 있는 Wikimedia Commons 후보를 바로 확인해. 구글 검색 결과가 곧 사용 허가를 뜻하진 않아.</p>
              <div className="image-search-row">
                <input value={imageQuery} onChange={e=>setImageQuery(e.target.value)} placeholder="예: 100일의 거짓말 / 1930s Seoul" aria-label="이미지 검색어"/>
                <button className="btn btn-light" disabled={!imageQuery.trim()} onClick={()=>window.open('https://www.google.com/search?tbm=isch&q='+encodeURIComponent(imageQuery.trim()),'_blank','noopener,noreferrer')}>구글에서 보기 ↗</button>
              </div>
              <div className="editor-toolbar">
                <button className="btn btn-primary" disabled={imageSearching || imageQuery.trim().length<2} onClick={searchImages}>{imageSearching?'추천 찾는 중…':'사용 조건 있는 후보 검색'}</button>
              </div>
              <p className="muted">추천 결과는 Wikimedia Commons 검색이야. 작품 포스터·배우 사진처럼 권리 확인이 어려운 이미지는 직접 원본을 확인해 줘.</p>
              {imageError && <p className="generator-error" role="alert">{imageError}</p>}
              {!!imageResults.length && <div className="licensed-image-grid">{imageResults.map(item=>{
                const isSaved=selectedImages.some(saved=>saved.id===item.id && saved.sourceUrl===item.sourceUrl);
                return <div className="licensed-image" key={item.id}>
                  <img src={item.thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />
                  <strong>{item.title}</strong><small>{item.creator} · {item.license}</small>
                  <div><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">원본 ↗</a> · <a href={item.licenseUrl} target="_blank" rel="noopener noreferrer">사용 조건 ↗</a></div>
                  <button className={isSaved?'btn btn-primary':'btn btn-light'} onClick={()=>toggleSavedImage(item)}>{isSaved?'✓ 보관됨 · 선택 해제':'후보 보관'}</button>
                </div>;
              })}</div>}
              <details className="image-manual-add">
                <summary>구글에서 찾은 이미지 직접 등록</summary>
                <p className="muted">구글에서 원본 사이트를 열고, 이미지 파일 주소와 해당 페이지 URL을 각각 입력해 줘. 등록은 권리 승인과 무관해.</p>
                <input value={manualImageUrl} onChange={e=>setManualImageUrl(e.target.value)} placeholder="이미지 파일 HTTPS URL" aria-label="외부 이미지 파일 주소"/>
                <input value={manualSourceUrl} onChange={e=>setManualSourceUrl(e.target.value)} placeholder="원본 출처 페이지 HTTPS URL" aria-label="외부 이미지 출처 주소"/>
                <button className="btn btn-light" onClick={addManualImage} disabled={!selected}>이미지 후보 보관</button>
              </details>
              <div className="saved-images">
                <strong>보관한 이미지 후보 {selectedImages.length} / 8</strong>
                {selectedImages.length ? <div className="licensed-image-grid">{selectedImages.map(item=><div className="licensed-image" key={item.id}>
                  <img src={item.thumbnailUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer"/>
                  <small>{item.license} · {item.creator}</small>
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">원본과 권리 확인 ↗</a>
                  <a href={item.imageUrl} target="_blank" rel="noopener noreferrer">이미지 원본 열기 ↗</a>
                  <button className="btn btn-light" onClick={()=>toggleSavedImage(item)}>보관 해제</button>
                </div>)}</div> : <p className="muted">아직 보관한 이미지가 없어.</p>}
              </div>
              <p className="muted">이미지는 URL과 출처를 저장하며 실제 이미지 파일을 다운로드하거나 영구 보관하지는 않아. 원본 권리 확인 후 파일을 직접 저장해 블로그에 올려 줘.</p>
            </div>
            <div className="panel"><h2>제작 원칙</h2><ul className="rules"><li>확인되지 않은 뉴스는 발행하지 않기</li><li>타 매체 기사나 사진 무단 복제 금지</li><li>정보 카드·직접 캡처 중심으로 제작</li><li>네이버와 티스토리 글은 별도로 검수</li></ul></div>
          </aside>
        </div>}
        {section === 'publish' && <div className="publish-grid">
          <div className="panel"><div className="panel-heading"><h2>발행 관리</h2><span>이 브라우저 전용 기록</span></div><div className="metric-grid compact"><div className="metric"><small>수정한 주제</small><strong>{editCount}</strong></div><div className="metric"><small>등록된 게시 URL</small><strong>{publishedCount}</strong></div></div><p className="muted">발행할 주제를 선택하고 실제 게시 후 주소를 입력해. 이 기록은 계정 연동이 아니라 브라우저에만 보관돼.</p><select className="wide-select" value={selectedId} aria-label="발행 관리 주제 선택" onChange={e => setSelectedId(e.target.value)}><option value="">발행할 주제를 선택해 줘</option>{candidates.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}</select>
            {selected && <div className="publish-completion">
              <div><strong>이미 발행한 주제인가?</strong><p className="muted">발행 완료로 표시하거나 아래 게시 URL을 저장하면, 주제 탐색의 기본 추천에서 제외돼. 글과 원고는 삭제되지 않아.</p></div>
              <button type="button" className={(saved?.publishedManually ? 'btn btn-primary' : 'btn btn-light')} onClick={() => {
                const next = !saved?.publishedManually;
                updateEdit({publishedManually:next,publishedTopicTitle:selected.title,publishedSourceUrls:selected.headlines.map(x=>x.url)});
                setNotice(next ? '발행 완료로 표시했어. 추천에서 숨겨질 거야.' : '수동 발행 완료 표시를 해제했어. 발행 URL이 남아 있으면 계속 추천에서 제외돼.');
              }}>{saved?.publishedManually?'✓ 발행 완료 · 표시 해제':'발행 완료로 표시'}</button>
              {isPublishedTopic(selected) && <small>이 주제는 발행 기록이 있어서 기본 추천에서 제외돼.</small>}
            </div>}
            {(['naver','tistory','tistoryEn'] as const).map(c => <div className="publish-row" key={c}><div><h3>{c === 'naver' ? '네이버 블로그' : c === 'tistoryEn' ? '티스토리 English' : '티스토리 한국어'}</h3><a target="_blank" rel="noreferrer" href={c === 'tistoryEn' ? links.tistory : links[c]}>블로그 열기 ↗</a></div><input aria-label={(c === 'naver' ? '네이버' : '티스토리')+' 발행 URL'} placeholder="발행된 글 URL" value={urlInput[c]} onChange={e => setUrlInput(old => ({...old,[c]:e.target.value}))}/><button className="btn btn-primary" disabled={!selected} onClick={() => savePublished(c,urlInput[c])}>저장</button></div>)}
            <div className="editor-toolbar"><button className="btn btn-light" onClick={() => download('todaypick-local-backup.json',JSON.stringify(localEdits,null,2),'application/json')}>기기 내 작업 백업 (JSON)</button><button className="btn btn-light" onClick={() => setSection('editor')}>원고 검수하기 →</button></div>
          </div>
          <div className="panel"><h2>현재 지원 범위</h2><ul className="rules"><li>네이버·티스토리: 직접 발행 후 링크 저장</li><li>이미지: 삽입 위치·내용 계획만 지원</li><li>숏폼: 검수용 대본 편집까지 지원</li><li>자동 게시·영상 렌더링·계정 로그인: 아직 미구현</li></ul><div className="draft-warning">공개 GitHub Pages에 인증 기능은 없어. 민감한 원고를 다루거나 실제 자동 게시를 구현하려면 별도 인증 백엔드가 필요해.</div></div>
        </div>}
      </div>
      <footer>AI Blog Studio · 오늘의 픽 · 공개 프리뷰 / 실제 광고 수익·트래픽 예측 기능 없음</footer>
    </main>
  </div>;
}
