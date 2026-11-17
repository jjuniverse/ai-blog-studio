'use client';
import { useEffect, useRef } from 'react';

type Variant = 'cover' | 'detail' | 'summary';
type Props = {
  title: string;
  category: string;
  description: string;
  variant: Variant;
  index: number;
};
function wrap(ctx: CanvasRenderingContext2D, content: string, maxWidth: number, maxLines: number) {
  const output: string[] = [];
  let text = content.replace(/\s+/g, ' ').trim();
  while (text && output.length < maxLines) {
    let size = text.length;
    while (size > 1 && ctx.measureText(text.slice(0, size)).width > maxWidth) size--;
    if (size < text.length && size > 2) {
      const space = text.lastIndexOf(' ', size);
      if (space > Math.floor(size / 2)) size = space;
    }
    output.push(text.slice(0, size).trim());
    text = text.slice(size).trim();
  }
  if (text && output.length) {
    let last = output.pop() || '';
    while (last.length && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    output.push(last + '…');
  }
  return output;
}
export function drawInfoCard(canvas: HTMLCanvasElement, {title, category, description, variant, index}: Props) {
  const w = 1200, h = variant === 'cover' ? 675 : 900;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#10263e'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#173953'; ctx.beginPath();ctx.ellipse(1040, -80, 380, 390, 0, 0, Math.PI * 2);ctx.fill();
  ctx.fillStyle = '#1b4a5b';ctx.beginPath();ctx.ellipse(-110, h+55, 420, 330, 0, 0, Math.PI*2);ctx.fill();
  ctx.fillStyle = '#9ff5c6';
  ctx.beginPath();ctx.roundRect(76, 76, 216, 66, 30);ctx.fill();
  ctx.font = 'bold 30px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.fillStyle = '#0d3041';ctx.fillText('오늘의 픽', 104, 121);
  ctx.fillStyle='#ffffff';ctx.font='600 26px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.fillText(category.length>18?category.slice(0,18):category, 80, 204);
  const headline = variant === 'cover' ? title : variant === 'detail' ? '핵심 내용 한눈에 보기' : '오늘의 PICK 요약';
  ctx.fillStyle='#fff';ctx.font='bold 62px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  const lines=wrap(ctx, headline, w-160, variant==='cover'?3:2);
  const lineHeight=83;
  lines.forEach((l,i)=>ctx.fillText(l,80,310+i*lineHeight));
  const lower=variant==='cover'?540:520;
  ctx.fillStyle='#9ff5c6';ctx.fillRect(80,lower-36,96,6);
  ctx.font='32px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';ctx.fillStyle='#dbece9';
  let lineText=description.trim();
  if (variant==='cover') lineText='알아두면 좋은 소식, 오늘의 픽';
  const bodyLines=wrap(ctx,lineText,w-170,variant==='cover'?2:5);
  bodyLines.forEach((line,i)=>ctx.fillText(line,80,lower+30+i*56));
  ctx.fillStyle='#9ab2c3';ctx.font='24px ui-sans-serif, sans-serif';
  ctx.fillText('TODAYPICKKR  /  '+String(index+1).padStart(2,'0'),80,h-55);
  ctx.fillStyle='#9ff5c6';ctx.fillRect(w-146,h-85,66,8);
}
export default function ImageCard(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(ref.current)drawInfoCard(ref.current,props)},[props.title,props.description,props.category,props.index,props.variant]);
  const save=()=>{
    const canvas=ref.current;
    if(!canvas)return;
    canvas.toBlob(blob=>{
      if(!blob)return;
      const u=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=u;a.download='todaypick-'+props.variant+'-'+(props.index+1)+'.png';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
    },'image/png');
  };
  return <div className="generated-image">
    <canvas ref={ref} role="img" aria-label={props.title+' 관련 '+(props.index+1)+'번 정보 카드 미리보기'}/>
    <button className="btn btn-light" type="button" onClick={save}>PNG 이미지 저장 ↓</button>
  </div>;
}
