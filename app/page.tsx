'use client';

import { useEffect, useMemo, useState } from 'react';

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
type Draft = {
  id: string;
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
};

const ROOT = '/ai-blog-studio';
const EDIT_KEY = 'todaypick_workspace_v1';
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
  needs_sources: '추가 출처 필요',
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
function DefaultEditorHint({ candidate }: { candidate?: Candidate }) {
  return <div className="empty-editor">
    <span className="empty-symbol">✦</span>
    <h3>아직 준비된 AI 원고가 없어</h3>
    <p>이 주제의 검수용 초안이 생성되지 않았어. 공개 GitHub Actions에서 원고 생성 작업을 실행할 수 있어.</p>
    {candidate?.status !== 'research_required' && <p className="warning-line">현재 주제는 출처가 부족하거나 제외 대상으로 분류돼 자동 생성 대상이 아니야.</p>}
    <a className="btn btn-primary" href={links.workflow} target="_blank" rel="noreferrer">AI 초안 생성 작업 열기 ↗</a>
  </div>;
}
export default function Home() {
  const [section, setSection] = useState<Section>('discover');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EDIT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) setLocalEdits(parsed as Record<string, LocalEdit>);
      }
    } catch { /* private mode or disabled local storage */ }
    setHydrated(true);
    Promise.allSettled([publicFile('/data/candidates.json'), publicFile('/data/drafts.json')])
      .then(([a, b]) => {
        if (a.status === 'fulfilled') {
          const list = (a.value.candidates || []) as Candidate[];
          setCandidates(list);
          setUpdatedAt(a.value.generatedAt || '');
          setSelectedId((id) => id || (list.find((x) => x.status === 'research_required') || list[0])?.id || '');
        } else setLoadError('후보 데이터를 읽지 못했어. 뉴스 수집 Actions를 확인해 줘.');
        if (b.status === 'fulfilled') setDrafts((b.value.drafts || []) as Draft[]);
      }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(EDIT_KEY, JSON.stringify(localEdits)); } catch { setNotice('브라우저 저장 공간을 사용할 수 없어. 내보내기로 백업해 줘.'); }
  }, [localEdits, hydrated]);

  const categories = useMemo(() => ['전체', ...Array.from(new Set(candidates.map(x => x.category)))], [candidates]);
  const visible = useMemo(() => candidates.filter(x => {
    if (!showExcluded && (x.status === 'excluded_promotion' || x.status === 'sensitive_review')) return false;
    if (category !== '전체' && x.category !== category) return false;
    if (query.trim() && !(x.title + ' ' + x.category).toLowerCase().includes(query.toLowerCase().trim())) return false;
    return true;
  }), [candidates, category, showExcluded, query]);
  const selected = candidates.find(x => x.id === selectedId);
  const matchingDraft = selected && drafts.find(d => d.id === selected.id || (d.sources || []).some(s => selected.headlines.some(h => h.url === s.url)));
  const editId = selected?.id || '';
  const saved = localEdits[editId];
  const text = saved?.fields?.[channel] ?? matchingDraft?.[channel] ?? '';
  const verified = !!saved?.verified;
  const images = saved?.imageNotes?.length === 3 ? saved.imageNotes : imagePrompts(selected);
  const reviewCount = candidates.filter(x => x.status === 'research_required').length;
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
    } }));
  }
  function choose(id: string, next: Section = 'editor') {
    setSelectedId(id);
    setChannel('naver');
    setSection(next);
    setNotice('');
  }
  async function copyText() {
    if (!text.trim()) return;
    try { await navigator.clipboard.writeText(text); setNotice('원고를 복사했어. 발행 전 사실관계를 확인해 줘.'); }
    catch { setNotice('복사 권한이 없어. 원고를 직접 선택해 복사해 줘.'); }
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
      <div className="side-bottom"><span className="state-dot" /> Public preview<div>실제 AI 생성은 GitHub Actions에서 실행돼.</div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><span>오늘의 픽 / {section === 'discover' ? '주제 탐색' : section === 'editor' ? '콘텐츠 스튜디오' : '발행 관리'}</span><div><a href={links.naver} target="_blank" rel="noreferrer">네이버 ↗</a><a href={links.tistory} target="_blank" rel="noreferrer">티스토리 ↗</a></div></header>
      <div className="main-inner">
        <div className="page-head"><div><span className="eyebrow">CONTENT WORKSPACE</span><h1>{section === 'discover' ? '오늘 어떤 콘텐츠를 만들까?' : section === 'editor' ? '콘텐츠 스튜디오' : '발행 관리'}</h1><p>{section === 'discover' ? '실제 수집된 이슈를 검토하고 제작할 주제를 선택해 봐.' : section === 'editor' ? '검수용 초안을 편집하고 이미지 배치를 계획해 봐.' : '발행한 콘텐츠의 링크와 진행 상태를 관리해 봐.'}</p></div><a className="btn btn-light" href={links.collect} target="_blank" rel="noreferrer">뉴스 수집 관리 ↗</a></div>
        <div className="privacy-note"><strong>공개 프리뷰</strong> · 뉴스와 AI 검수 초안은 공개 저장소 데이터야. 직접 수정한 글과 게시 기록은 이 기기 브라우저에만 임시 저장되고 다른 기기와 동기화되지 않아. 비밀번호·개인정보·비공개 원고를 입력하지 마.</div>
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="닫기">×</button></div>}
        {section === 'discover' && <>
          <div className="metric-grid">
            <div className="metric"><small>검토할 만한 후보</small><strong>{reviewCount}</strong><span>복수 매체 보도 · 추가 검증 필요</span></div>
            <div className="metric"><small>제외된 이슈</small><strong>{excludedCount}</strong><span>홍보성·민감 이슈</span></div>
            <div className="metric"><small>생성된 AI 검수 초안</small><strong>{drafts.length}</strong><span>완성된 게시글이 아닌 준비 자료</span></div>
          </div>
          <div className="section-title"><div><h2>추천 주제</h2><p>{updatedAt ? '마지막 분석 ' + new Date(updatedAt).toLocaleString('ko-KR') : '뉴스 수집 후 목록이 업데이트돼.'}</p></div><span className="small-label">점수는 검색량·수익 예측이 아닌 내부 편집 기준</span></div>
          <div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="기사나 키워드 검색" aria-label="키워드 검색"/><select value={category} onChange={e => setCategory(e.target.value)} aria-label="카테고리 필터">{categories.map(v => <option key={v}>{v}</option>)}</select><label className="inline-check"><input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)}/> 제외된 주제 보기</label></div>
          {loading ? <div className="state-card">콘텐츠 후보를 불러오는 중...</div> : loadError ? <div className="state-card">{loadError}</div> : visible.length === 0 ? <div className="state-card">조건에 맞는 후보가 없어. 필터를 변경하거나 뉴스 수집을 실행해 줘.</div> : <div className="recommend-list">{visible.slice(0, 30).map(c => <article className="recommend-card" key={c.id}><div className="topic-main"><div className="pill-row"><span className="pill">{c.category}</span><span className="pill subtle">{c.region === 'EN' ? '해외 / 영어' : '국내 / 한국어'}</span><span className={'pill ' + (c.status === 'research_required' ? 'green' : c.status === 'needs_sources' ? 'yellow' : 'red')}>{statusLabel[c.status || 'needs_sources']}</span></div><h3>{c.title}</h3><p className="muted">{c.headlines.length}개 기사 · {c.scores.independentPublisherCount}개 매체 · {c.reasons?.[0] || '출처 검증 필요'}</p></div><div className="topic-actions"><span className="priority">검토 우선순위 <strong>{c.scores.editorialPriority}</strong></span><button className="btn btn-primary" onClick={() => choose(c.id)}>{c.status === 'research_required' ? '콘텐츠 준비 →' : '근거 확인 →'}</button></div></article>)}</div>}
        </>}
        {section === 'editor' && <div className="studio-grid">
          <div className="editor-main">
            <div className="panel">
              <div className="panel-heading"><h2>제작할 주제</h2><span>{candidates.length}개 수집 후보</span></div>
              <select className="wide-select" aria-label="주제 선택" value={selectedId} onChange={e => { setSelectedId(e.target.value); setNotice(''); }}>{candidates.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}</select>
              {selected && <div className="source-summary"><div className="pill-row"><span className="pill">{selected.category}</span><span className={'pill ' + (selected.status === 'research_required' ? 'green' : 'yellow')}>{statusLabel[selected.status || 'needs_sources']}</span></div><p>{selected.reasons?.join(' · ')}</p><details><summary>참고 뉴스 {selected.headlines.length}개와 출처 보기</summary><ul>{selected.headlines.map((h,i) => <li key={i}><a href={h.url} target="_blank" rel="noreferrer">{h.publisher || '출처'} — {h.title} ↗</a></li>)}</ul></details></div>}
            </div>
            <div className="panel editor-panel"><div className="panel-heading"><div><h2>원고 편집</h2><p>생성된 검수 초안이 있다면 불러와서 수정할 수 있어.</p></div><a className="btn btn-light" href={links.workflow} target="_blank" rel="noreferrer">AI 초안 생성 ↗</a></div>
              <div className="tabs">{channels.map(c => <button key={c.id} className={channel === c.id ? 'tab active' : 'tab'} onClick={() => setChannel(c.id)}>{c.label}</button>)}</div>
              {matchingDraft || saved?.fields?.[channel] ? <>
                <div className="draft-warning">이 원고는 기사 제목·출처에 기반한 검수용 자료야. 문장에 있는 사실을 공식 자료와 대조하고 이미지 권리도 확인해야 발행할 수 있어.</div>
                <textarea className="draft-text" value={text} onChange={e => updateEdit({fields:{[channel]:e.target.value}, verified:false})} rows={17} placeholder="원고를 입력하거나 생성된 초안을 수정해 줘." aria-label="원고 편집"/>
                <div className="editor-toolbar"><button className="btn btn-light" onClick={copyText} disabled={!text.trim()}>원고 복사</button><button className="btn btn-light" onClick={exportText} disabled={!text.trim()}>텍스트 저장</button><label className="review-toggle"><input type="checkbox" checked={verified} onChange={e => updateEdit({verified:e.target.checked})}/> 직접 사실·저작권 검수 완료</label></div>
                {matchingDraft?.verificationChecklist?.length ? <details className="checklist"><summary>AI가 제안한 사실 검증 항목 {matchingDraft.verificationChecklist.length}개</summary><ul>{matchingDraft.verificationChecklist.map((t,i) => <li key={i}>{t}</li>)}</ul></details> : null}
              </> : <DefaultEditorHint candidate={selected}/>}
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
