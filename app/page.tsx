'use client';

import { useEffect, useMemo, useState } from 'react';
import ImageCard from './components/ImageCard';

type Status = 'research_required' | 'needs_sources' | 'sensitive_review' | 'excluded_promotion';
type Channel = 'naver' | 'tistory' | 'shortform';
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
type Draft = {
  id: string;
  mode?: "article" | "research_brief";
  sourceLinks?: { title: string; url: string }[];
  researchAudit?: { searchedSourceCount: number; returnedSourceCount: number; distinctSourceDomains: number; initiallyGeneratedMode: string; reasons: string[] };
  qualityAudit?: { blogsAreCopies: boolean; shortformCopiesBlog: boolean; visualRightsWarning: boolean; warnings: string[] };
  title: string;
  naver: string;
  tistory: string;
  shortform: string;
  verificationChecklist?: string[];
  sources?: { title: string; url: string; publisher: string }[];
  status: string;
};
type LocalEdit = {
  fields: Partial<Record<Channel, string>>;
  imageNotes: string[];
  verified: boolean;
  publishedUrls: Partial<Record<'naver' | 'tistory', string>>;
  updatedAt: string;
  generatedVersion?: number;
};

const ROOT = '/ai-blog-studio';
const WORKER_URL = 'https://todaypick-studio-api.jjuniverse-plant-lens.workers.dev';
const EDIT_KEY = 'todaypick_workspace_v1';
const DRAFT_VERSION = 2;
const channels: { id: Channel; label: string }[] = [
  { id: 'naver', label: '네이버 블로그' },
  { id: 'tistory', label: '티스토리' },
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
function safePublishedUrl(raw: string, channel: 'naver' | 'tistory') {
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
  const [researchLeads, setResearchLeads] = useState<ResearchLead[]>([]);
  const [researchDailyLimit, setResearchDailyLimit] = useState(3);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [showExcluded, setShowExcluded] = useState(false);
  const [channel, setChannel] = useState<Channel>('naver');
  const [localEdits, setLocalEdits] = useState<Record<string, LocalEdit>>({});
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<{ id: number; kind: 'success' | 'error' } | null>(null);
  const [studioPassphrase, setStudioPassphrase] = useState('');
  const [verifiedNotes, setVerifiedNotes] = useState('');
  const [generating, setGenerating] = useState(false);
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
    } catch { /* private mode or disabled local storage */ }
    setHydrated(true);
    Promise.allSettled([publicFile('/data/candidates.json'), publicFile('/data/drafts.json'), publicFile('/data/research.json')])
      .then(([a, b, research]) => {
        if (a.status === 'fulfilled') {
          const list = (a.value.candidates || []) as Candidate[];
          setCandidates(list);
          setUpdatedAt(a.value.generatedAt || '');
          setSelectedId((id) => id || (list.find((x) => x.status === 'research_required') || list[0])?.id || '');
        } else setLoadError('후보 데이터를 읽지 못했어. 뉴스 수집 Actions를 확인해 줘.');
        if (b.status === 'fulfilled') setDrafts((b.value.drafts || []) as Draft[]);
        if (research.status === 'fulfilled') {
          setResearchLeads((research.value.entries || []) as ResearchLead[]);
          setResearchDailyLimit(research.value.maxDailyCalls || 3);
        }
      }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(EDIT_KEY, JSON.stringify(localEdits)); } catch { setNotice('브라우저 저장 공간을 사용할 수 없어. 내보내기로 백업해 줘.'); }
  }, [localEdits, hydrated]);

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
      if (!payload.draft || !['naver','tistory','shortform'].every(k => typeof payload.draft[k] === 'string')) throw new Error('AI 응답 형식이 잘못됐어.');
      const draft: Draft = { ...payload.draft, id: selected.id, status: payload.status || 'unverified_review_required', sources: selected.headlines.map(h => ({ publisher: h.publisher, url: h.url, title: h.title })) };
      setDrafts(old => [draft, ...old.filter(x => x.id !== selected.id && !(x.sources || []).some(z => selected.headlines.some(h => h.url === z.url)))]);
      if (draft.mode === 'article') {
        setLocalEdits(old => ({
          ...old,
          [selected.id]: {
            fields: { naver: draft.naver, tistory: draft.tistory, shortform: draft.shortform },
            imageNotes: payload.draft.imageNotes,
            verified: false,
            publishedUrls: old[selected.id]?.publishedUrls || {},
            updatedAt: new Date().toISOString(),
            generatedVersion: DRAFT_VERSION,
          },
        }));
      }
      setChannel('naver');
      setPreviewMode(true);
      setNotice(draft.status === 'revision_required' ? '원고는 생성됐지만 중복 본문이나 숏폼·이미지 문제로 수정이 필요해.' : draft.mode === 'research_brief'
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
  const visible = useMemo(() => candidates.filter(x => {
    if (!showExcluded && (x.status === 'excluded_promotion' || x.status === 'sensitive_review')) return false;
    if (category !== '전체' && x.category !== category) return false;
    if (query.trim() && !(x.title + ' ' + x.category).toLowerCase().includes(query.toLowerCase().trim())) return false;
    return true;
  }), [candidates, category, showExcluded, query]);
  const selected = candidates.find(x => x.id === selectedId);
  const activeResearch = researchLeads.find(x => x.candidateId === selectedId);
  const matchingDraft = selected && drafts.find(d => d.id === selected.id || (d.sources || []).some(s => selected.headlines.some(h => h.url === s.url)));
  const editId = selected?.id || '';
  const saved = localEdits[editId];
  const legacyStored = !!saved && saved.generatedVersion !== DRAFT_VERSION && Object.values(saved.fields || {}).some(value => !!value?.trim());
  const legacyPublic = !!matchingDraft && matchingDraft.mode !== 'article' && matchingDraft.mode !== 'research_brief';
  const currentDraft = !legacyStored && !legacyPublic && (matchingDraft?.mode === 'article' || !!saved?.fields?.[channel]);
  const text = legacyStored ? (saved?.fields?.[channel] || '') : legacyPublic ? '' : (saved?.fields?.[channel] ?? matchingDraft?.[channel] ?? '');
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
      imageNotes: patch.imageNotes || old[editId]?.imageNotes || imagePrompts(selected),
      verified: patch.verified ?? old[editId]?.verified ?? false,
      publishedUrls: { ...(old[editId]?.publishedUrls || {}), ...(patch.publishedUrls || {}) },
      updatedAt: new Date().toISOString(),
      generatedVersion: patch.generatedVersion ?? old[editId]?.generatedVersion,
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
    setSelectedId(id);
    setChannel('naver');
    setSection(next);
    setNotice('');
  }
  async function copyText() {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(previous => ({ id: (previous?.id || 0) + 1, kind: 'success' }));
    } catch {
      setCopyFeedback(previous => ({ id: (previous?.id || 0) + 1, kind: 'error' }));
    }
  }
  function exportText() {
    download('todaypick-' + channel + '-draft.txt', (selected?.title || '') + '\n\n' + text + '\n\n' + images.map((n,i) => '[이미지 ' + (i + 1) + '] ' + n).join('\n'), 'text/plain;charset=utf-8');
  }
  function savePublished(channelId: 'naver' | 'tistory', value: string) {
    if (!value.trim()) { updateEdit({ publishedUrls: { [channelId]: '' } }); setNotice('기록된 게시 URL을 비웠어.'); return; }
    if (!safePublishedUrl(value, channelId)) { setNotice('오늘의 픽 블로그에서 발행한 https 주소를 입력해 줘.'); return; }
    updateEdit({ publishedUrls: { [channelId]: value.trim() } });
    setNotice('이 브라우저에만 게시 URL을 저장했어.');
  }
  const [urlInput, setUrlInput] = useState<Record<'naver'|'tistory', string>>({naver: '', tistory: ''});
  useEffect(() => { setUrlInput({ naver: saved?.publishedUrls?.naver || '', tistory: saved?.publishedUrls?.tistory || '' }); }, [selectedId, saved?.publishedUrls?.naver, saved?.publishedUrls?.tistory]);

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
          <div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="기사나 키워드 검색" aria-label="키워드 검색"/><select value={category} onChange={e => setCategory(e.target.value)} aria-label="카테고리 필터">{categories.map(v => <option key={v}>{v}</option>)}</select><label className="inline-check"><input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)}/> 제외된 주제 보기</label></div>
          {loading ? <div className="state-card">콘텐츠 후보를 불러오는 중...</div> : loadError ? <div className="state-card">{loadError}</div> : visible.length === 0 ? <div className="state-card">조건에 맞는 후보가 없어. 필터를 변경하거나 뉴스 수집을 실행해 줘.</div> : <div className="recommend-list">{visible.slice(0, 30).map(c => <article className="recommend-card" key={c.id}><div className="topic-main"><div className="pill-row"><span className="pill">{c.category}</span><span className="pill subtle">{c.region === 'EN' ? '해외 / 영어' : '국내 / 한국어'}</span><span className={'pill ' + (c.status === 'research_required' ? 'green' : c.status === 'needs_sources' ? 'yellow' : 'red')}>{statusLabel[c.status || 'needs_sources']}</span></div><h3>{c.title}</h3><p className="muted">{c.headlines.length}개 기사 · {c.scores.independentPublisherCount}개 매체 · {c.reasons?.[0] || '출처 검증 필요'}</p></div><div className="topic-actions"><span className="priority">검토 우선순위 <strong>{c.scores.editorialPriority}</strong></span><button className="btn btn-primary" onClick={() => choose(c.id)}>{c.status === 'research_required' || c.status === 'needs_sources' ? '자료 조사 →' : '제외 사유 보기 →'}</button></div></article>)}</div>}
        </>}
        {section === 'editor' && <div className="studio-grid">
          <div className="editor-main">
            <div className="panel">
              <div className="panel-heading"><h2>제작할 주제</h2><span>{candidates.length}개 수집 후보</span></div>
              <select className="wide-select" aria-label="주제 선택" value={selectedId} onChange={e => { setSelectedId(e.target.value); setNotice(''); }}>{candidates.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}</select>
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
                <label className="notes-label">직접 확인한 사실 메모 (선택)<textarea rows={3} value={verifiedNotes} onChange={e=>setVerifiedNotes(e.target.value)} placeholder="공식 발표에서 확인한 내용과 출처를 입력해. 입력하지 않으면 검수용 구조만 생성해."/></label>
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
              <div className="draft-selector"><strong>생성된 AI 초안 {drafts.length}건</strong>
                {drafts.length===0 ? <p className="muted">현재 저장된 초안이 없어.</p> : drafts.map((d,i)=>{
                  const corresponding=candidates.find(c=>c.id===d.id||(d.sources||[]).some(src=>c.headlines.some(h=>h.url===src.url)));
                  return <button type="button" key={d.id+'-'+i} className="saved-draft" disabled={!corresponding} onClick={()=>{if(corresponding){setSelectedId(corresponding.id);setChannel('naver');setNotice('기존 AI 검수 초안을 불러왔어.');}}}>
                    <span><b>{d.title}</b><small>{corresponding?'네이버·티스토리·숏폼 초안 보기':'현재 뉴스 목록에서 해당 주제를 찾을 수 없어'}</small></span><span>보기 →</span>
                  </button>;
                })}
                <p className="muted">초안은 발행용 완성 글이 아니라 출처 검증이 필요한 준비 자료야.</p>
              </div>
              {(legacyStored || legacyPublic) && <div className="legacy-draft-warning">
                <strong>저장된 원고의 버전 정보가 없어</strong>
                <p>원고 자체는 브라우저에 남아 있어. 이전 버전일 수도 있고, 새 생성 후 버전 정보만 빠졌을 수도 있어. 재생성 없이 내용을 복구해 확인할 수 있어.</p>
                {legacyStored ? <div className="editor-toolbar">
                  <button className="btn btn-primary" onClick={recoverStoredDraft}>저장된 원고 복구해서 보기 (무료)</button>
                  <button className="btn btn-light" onClick={archiveOldDraft}>백업 후 초기화</button>
                </div> : <span>서버에서 가져온 과거 초안은 자동 표시하지 않아.</span>}
              </div>}
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
              </div> : null}
              {!legacyStored && matchingDraft?.mode==='research_brief' && !saved?.fields?.[channel] ? <div className="empty-editor"><h3>발행용 본문 없음</h3><p>공식 발표나 독립된 추가 자료를 확인한 뒤 다시 생성해 줘.</p></div> : null}
              {currentDraft && !legacyStored && !!text.trim() ? <>
                <div className="draft-warning">이 원고는 AI가 작성한 검수용 자료야. 중요한 사실·출처·이미지 권리를 직접 확인하고 발행해 줘.</div>
                <div className="editor-toolbar"><button className={previewMode?'btn btn-primary':'btn btn-light'} onClick={()=>setPreviewMode(true)}>블로그 미리보기</button><button className={!previewMode?'btn btn-primary':'btn btn-light'} onClick={()=>setPreviewMode(false)}>원고 편집</button></div>
                {previewMode ? <div className="post-preview">
                  <div className="post-preview-label">오늘의 픽 · {channel === 'naver'?'네이버 블로그':channel==='tistory'?'티스토리':'숏폼 대본'} 발행 전 미리보기</div>
                  <h1>{matchingDraft?.title || selected?.title || '새 글'}</h1>
                  {text.split(/\n+/).filter(Boolean).map((paragraph, i) => <div key={i}>
                    {/^#{1,3}\s+/.test(paragraph) ? <h2>{paragraph.replace(/^#{1,3}\s+/, '')}</h2> : <p>{paragraph}</p>}
                    {i === 0 && channel !== 'shortform' && selected && <ImageCard title={matchingDraft?.title||selected.title} category={selected.category} description={images[0]} variant="cover" index={0}/>}
                    {i === 4 && channel !== 'shortform' && selected && <ImageCard title={matchingDraft?.title||selected.title} category={selected.category} description={images[1]} excerpt={text} variant="detail" index={1}/>}
                  </div>)}
                  {channel !== 'shortform' && selected && <ImageCard title={matchingDraft?.title||selected.title} category={selected.category} description={images[2]} excerpt={text} variant="summary" index={2}/>}
                </div> : <textarea className="draft-text" value={text} onChange={e => updateEdit({fields:{[channel]:e.target.value}, verified:false})} rows={17} placeholder="원고를 입력하거나 생성된 초안을 수정해 줘." aria-label="원고 편집"/>}
                <div className="editor-toolbar"><span className="copy-button-wrap">
                  <button className="btn btn-light" onClick={copyText} disabled={!text.trim()}>원고 복사</button>
                  {copyFeedback && <span className={'copy-tooltip '+(copyFeedback.kind==='error'?'copy-tooltip-error':'')} role="status" aria-live="polite">
                    {copyFeedback.kind==='success'?'✓ 복사됐어!':'복사에 실패했어'}
                  </span>}
                </span><button className="btn btn-light" onClick={exportText} disabled={!text.trim()}>텍스트 저장</button><label className="review-toggle"><input type="checkbox" checked={verified} onChange={e => updateEdit({verified:e.target.checked})}/> 직접 사실·저작권 검수 완료</label></div>
                {matchingDraft?.verificationChecklist?.length ? <details className="checklist"><summary>AI가 제안한 사실 검증 항목 {matchingDraft.verificationChecklist.length}개</summary><ul>{matchingDraft.verificationChecklist.map((t,i) => <li key={i}>{t}</li>)}</ul></details> : null}
              </> : null}
              {matchingDraft?.mode==='article' && !text.trim() && <div className="empty-editor"><h3>이 채널 원고는 품질 검사를 통과하지 못했어.</h3><p>다른 채널 탭에는 사용 가능한 원고가 있을 수 있어. 빈 글은 게시하지 마.</p></div>}
              {(!matchingDraft || legacyPublic) && !saved?.fields?.[channel] && <div className="empty-editor"><span className="empty-symbol">✦</span><h3>이 주제의 원고는 아직 없어</h3><p>위에서 자료 조사 버튼을 눌러 줘. 신뢰할 만한 근거가 부족하면 글 대신 확인할 항목을 표시해.</p></div>}
            </div>
          </div>
          <aside className="studio-side">
            <div className="panel"><div className="panel-heading"><h2>이미지 배치 계획</h2><span>이미지 생성 전</span></div><p className="muted">글을 읽기 쉽게 만드는 세 가지 이미지 슬롯이야. 실제 이미지는 아직 생성되지 않아.</p>{images.map((img,i) => <div key={i} className="image-slot"><div className="image-placeholder"><span>{i === 0 ? '▣' : i === 1 ? '▤' : '☰'}</span><small>이미지 {i+1}</small></div><label><strong>{['대표 이미지', '본문 설명', '핵심 요약'][i]}</strong><textarea rows={3} aria-label={'이미지 '+(i+1)+' 설명'} value={img} onChange={e => updateEdit({imageNotes:images.map((v,k) => k === i ? e.target.value : v)})}/></label></div>)}</div>
            <div className="panel"><h2>제작 원칙</h2><ul className="rules"><li>확인되지 않은 뉴스는 발행하지 않기</li><li>타 매체 기사나 사진 무단 복제 금지</li><li>정보 카드·직접 캡처 중심으로 제작</li><li>네이버와 티스토리 글은 별도로 검수</li></ul></div>
          </aside>
        </div>}
        {section === 'publish' && <div className="publish-grid">
          <div className="panel"><div className="panel-heading"><h2>발행 관리</h2><span>이 브라우저 전용 기록</span></div><div className="metric-grid compact"><div className="metric"><small>수정한 주제</small><strong>{editCount}</strong></div><div className="metric"><small>등록된 게시 URL</small><strong>{publishedCount}</strong></div></div><p className="muted">발행할 주제를 선택하고 실제 게시 후 주소를 입력해. 이 기록은 계정 연동이 아니라 브라우저에만 보관돼.</p><select className="wide-select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>{candidates.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}</select>
            {(['naver','tistory'] as const).map(c => <div className="publish-row" key={c}><div><h3>{c === 'naver' ? '네이버 블로그' : '티스토리'}</h3><a target="_blank" rel="noreferrer" href={links[c]}>블로그 열기 ↗</a></div><input aria-label={(c === 'naver' ? '네이버' : '티스토리')+' 발행 URL'} placeholder="발행된 글 URL" value={urlInput[c]} onChange={e => setUrlInput(old => ({...old,[c]:e.target.value}))}/><button className="btn btn-primary" onClick={() => savePublished(c,urlInput[c])}>저장</button></div>)}
            <div className="editor-toolbar"><button className="btn btn-light" onClick={() => download('todaypick-local-backup.json',JSON.stringify(localEdits,null,2),'application/json')}>기기 내 작업 백업 (JSON)</button><button className="btn btn-light" onClick={() => setSection('editor')}>원고 검수하기 →</button></div>
          </div>
          <div className="panel"><h2>현재 지원 범위</h2><ul className="rules"><li>네이버·티스토리: 직접 발행 후 링크 저장</li><li>이미지: 삽입 위치·내용 계획만 지원</li><li>숏폼: 검수용 대본 편집까지 지원</li><li>자동 게시·영상 렌더링·계정 로그인: 아직 미구현</li></ul><div className="draft-warning">공개 GitHub Pages에 인증 기능은 없어. 민감한 원고를 다루거나 실제 자동 게시를 구현하려면 별도 인증 백엔드가 필요해.</div></div>
        </div>}
      </div>
      <footer>AI Blog Studio · 오늘의 픽 · 공개 프리뷰 / 실제 광고 수익·트래픽 예측 기능 없음</footer>
    </main>
  </div>;
}
