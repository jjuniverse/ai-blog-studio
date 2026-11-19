'use client';
import { useEffect, useRef, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import { drawInfoCard } from './ImageCard';
import { IMAGE_FILENAMES, withImageMarkers, type ImageKind } from '../lib/postPackage';

type Props = {
  title: string;
  category: string;
  article: string;
  channel: 'naver' | 'tistory';
};
type GeneratedAsset = { kind: ImageKind; blob: Blob; url: string; label: string };

const kinds: { kind: ImageKind; variant: 'cover' | 'detail' | 'summary'; label: string; index: number }[] = [
  {kind:'cover',variant:'cover',label:'대표 썸네일',index:0},
  {kind:'summary',variant:'summary',label:'3줄 요약 카드',index:1},
  {kind:'detail',variant:'detail',label:'핵심 정보 카드',index:2},
];
const descriptions = {
  cover:'오늘의 픽 원본 타이포그래피 대표 이미지',
  summary:'3줄 요약을 기반으로 제작한 정보 카드',
  detail:'본문에서 확인해야 할 핵심 사실 정리 카드',
};
function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>
    blob ? resolve(blob) : reject(new Error('PNG 생성에 실패했어.')), 'image/png'));
}

export default function PostImagePackage({title,category,article,channel}:Props) {
  const [generated,setGenerated] = useState<GeneratedAsset[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const current = useRef<GeneratedAsset[]>([]);
  useEffect(()=>()=>{current.current.forEach(asset=>URL.revokeObjectURL(asset.url));},[]);
  const generate = async () => {
    if (!article.trim() || loading) return;
    setLoading(true);setError('');
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const next:GeneratedAsset[] = [];
      try {
        for (const kind of kinds) {
          const canvas = document.createElement('canvas');
          drawInfoCard(canvas,{
            title,category,excerpt:article,description:descriptions[kind.kind],
            variant:kind.variant,index:kind.index,
          });
          const blob = await pngBlob(canvas);
          next.push({kind:kind.kind,blob,url:URL.createObjectURL(blob),label:kind.label});
        }
      } catch (err) {
        next.forEach(asset=>URL.revokeObjectURL(asset.url));
        throw err;
      }
      const previous=current.current;
      current.current=next;
      setGenerated(next);
      previous.forEach(asset=>URL.revokeObjectURL(asset.url));
    } catch (err) {setError(err instanceof Error?err.message:'이미지 생성에 실패했어.');}
    finally {setLoading(false);}
  };
  const savePackage = async () => {
    if (generated.length !== 3) return;
    try {
      const files:Record<string,Uint8Array> = {};
      for (const asset of generated) {
        files[IMAGE_FILENAMES[asset.kind]]=new Uint8Array(await asset.blob.arrayBuffer());
      }
      files['원고-이미지배치.txt'] = strToU8(title+'\n\n'+withImageMarkers(article));
      files['사용안내.txt'] = strToU8(
        '오늘의 픽 · '+(channel==='naver'?'네이버':'티스토리')+' 포스팅 패키지\n\n'+
        '1. 이 ZIP에는 새로 렌더링한 오리지널 PNG 3장이 포함돼.\n'+
        '2. 원고-이미지배치.txt의 [이미지 삽입] 위치에 해당 PNG 파일을 직접 업로드해 줘.\n'+
        '3. 제목 아래에는 대표 썸네일, 3줄 요약 근처에는 요약 카드, 핵심 정보 섹션에는 정보 카드가 배치돼.\n'+
        '4. 네이버·티스토리 외부 글쓰기 화면에 자동으로 파일을 업로드하는 기능은 아직 없어.\n'+
        '5. 이미지에 포함된 날짜·숫자·인물 관련 내용은 최종 발행 전 실제 출처와 대조해 줘.\n'
      );
      const zip = zipSync(files,{level:0});
      const url=URL.createObjectURL(new Blob([Uint8Array.from(zip)],{type:'application/zip'}));
      const link=document.createElement('a');
      link.href=url;
      link.download='todaypick-'+channel+'-images.zip';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1200);
    } catch (err) {setError(err instanceof Error?err.message:'압축 파일 생성에 실패했어.');}
  };
  return <div className="post-image-package">
    <div className="panel-heading">
      <div><h3>원고 이미지 3장 제작</h3><p>제목·본문으로 실제 PNG를 그려. 이미지 API 비용은 없어.</p></div>
      <button type="button" className="btn btn-primary" onClick={generate} disabled={loading || !article.trim()}>
        {loading?'PNG 제작 중…':generated.length?'3장 다시 제작':'PNG 3장 제작 (무료)'}
      </button>
    </div>
    {error && <p className="generator-error" role="alert">{error}</p>}
    {generated.length>0 ? <>
      <p className="muted">실제 PNG 3장 제작 완료! 카드별 저장이나 ZIP 묶음 다운로드를 이용해 줘.</p>
      <div className="post-image-items">{generated.map(asset=><div key={asset.kind} className="post-image-item">
        <img src={asset.url} alt={asset.label+' 미리보기'} />
        <div><strong>{asset.label}</strong><a className="btn btn-light" href={asset.url} download={IMAGE_FILENAMES[asset.kind]}>PNG 저장 ↓</a></div>
      </div>)}</div>
      <button type="button" className="btn btn-primary" onClick={savePackage}>이미지 3장 + 본문 배치안 ZIP 다운로드 ↓</button>
    </> : <p className="muted">선택한 원고를 기준으로 이미지 3장을 직접 생성해 미리보기와 파일 다운로드를 제공해.</p>}
  </div>;
}
