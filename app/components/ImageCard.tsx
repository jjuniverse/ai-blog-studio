'use client';
import { useEffect, useRef } from 'react';

type Variant = 'cover' | 'detail' | 'summary';
type Props = { title: string; category: string; description: string; variant: Variant; index: number; excerpt?: string; english?: boolean };
const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
const englishOnly = (value:string) => value.replace(/[^\x20-\x7E\n]/g,' ').replace(/\s+/g,' ').trim();
const englishCategory = (value:string) => {
  const raw=value.toLowerCase();
  if (/연예|드라마|엔터|k-pop|k-drama|음악/.test(raw)) return 'ENTERTAINMENT';
  if (/기술|테크|ai|인공지능|디지털|it/.test(raw)) return 'TECHNOLOGY';
  if (/경제|금융|비즈니스/.test(raw)) return 'BUSINESS';
  if (/여행|관광/.test(raw)) return 'TRAVEL';
  if (/생활|라이프/.test(raw)) return 'LIFESTYLE';
  return englishOnly(value).toUpperCase() || 'WORLD NEWS';
};
const visible = (value:string, english?:boolean) => english ? englishOnly(value) : value;
const C = { navy:'#152439', ink:'#14243C', gray:'#637085', mint:'#A6F1D6', cream:'#F6F5F0', line:'#DFE4E5', white:'#FFF' };
function rect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string){
  ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function wrap(ctx:CanvasRenderingContext2D,content:string,width:number,maxLines:number){
  const lines:string[]=[];let rest=content.replace(/\s+/g,' ').trim();
  while(rest&&lines.length<maxLines){
    let end=rest.length;
    while(end>1&&ctx.measureText(rest.slice(0,end)).width>width)end--;
    if(end<rest.length){const word=rest.lastIndexOf(' ',end);if(word>Math.floor(end*.45))end=word;}
    lines.push(rest.slice(0,end).trim());rest=rest.slice(end).trim();
  }
  if(rest&&lines.length){let last=lines.pop()||'';while(last.length&&ctx.measureText(last+'…').width>width)last=last.slice(0,-1);lines.push(last+'…');}
  return lines;
}
function print(ctx:CanvasRenderingContext2D,lines:string[],x:number,y:number,gap:number){lines.forEach((line,i)=>ctx.fillText(line,x,y+i*gap));}
function clean(value:string){return value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/[#*_]/g,'').replace(/\s+/g,' ').trim();}
function facts(article:string,variant:Variant,english=false){
  // Prefer the actual three summary bullets for the summary card.
  // Prevent generic truncated introductory prose from replacing the useful headline facts.
  if(variant==='summary'){
    const match=article.match(english ? /(?:^|\n)#{1,3}\s*Three Key Takeaways\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i : /(?:^|\n)#{1,3}\s*3줄\s*요약\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/);
    const bullets=match?.[1].split(/\n+/).map(x=>x.replace(/^\s*[-•*]\s*/,'').trim()).filter(Boolean).map(x=>visible(clean(x),english)).filter(Boolean).slice(0,3)||[];
    if(bullets.length>=2)return bullets;
  }
  const paragraphs=article.split(/\n\s*\n/).map(p=>p.trim()).filter(p=>p&&!/^#{1,3}\s/.test(p)&&!/^#\S/.test(p));
  return paragraphs.map(p=>visible(clean(p),english)).filter(p=>p.length>20).slice(0,3);
}
function header(ctx:CanvasRenderingContext2D,cat:string,dark:boolean,english=false){
  rect(ctx,80,76,154,47,23,dark?C.mint:C.navy);
  ctx.fillStyle=dark?C.navy:C.white;ctx.font='700 22px '+FONT;ctx.fillText(english?'TODAY PICK':'오늘의 픽',english?94:103,107);
  ctx.font='600 22px '+FONT;ctx.fillStyle=dark?'#DAEEE7':C.gray;
  ctx.textAlign='right';ctx.fillText(english?englishCategory(cat):cat.toUpperCase(),1120,107);ctx.textAlign='left';
}
function footer(ctx:CanvasRenderingContext2D,h:number,dark:boolean,index:number){
  ctx.fillStyle=dark?'#B7D4CF':'#7D8A97';ctx.font='600 20px '+FONT;ctx.fillText('TODAYPICKKR',80,h-53);
  ctx.textAlign='right';ctx.fillText('EDITORIAL  /  '+String(index+1).padStart(2,'0'),1120,h-53);ctx.textAlign='left';
}
function cover(ctx:CanvasRenderingContext2D,props:Props){
  const h=675;ctx.fillStyle=C.navy;ctx.fillRect(0,0,1200,h);
  const entertainment=/드라마|연예|k-pop|k-drama/i.test(props.category);
  if(entertainment){
    ctx.fillStyle='#28445B';ctx.beginPath();ctx.ellipse(1005,346,190,238,-.28,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#AED9C7';ctx.lineWidth=3;
    for(let i=0;i<7;i++){const x=825+i*26;ctx.beginPath();ctx.moveTo(x,190);ctx.lineTo(x+110,560);ctx.stroke();}
    ctx.fillStyle='#395B6C';ctx.beginPath();ctx.ellipse(1064,414,92,148,.2,0,Math.PI*2);ctx.fill();
    rect(ctx,835,507,255,14,7,C.mint);
  }else{
    ctx.strokeStyle='#3E6D71';ctx.lineWidth=5;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(1010,348,88+i*43,0,Math.PI*2);ctx.stroke();}
    rect(ctx,934,270,150,150,36,C.mint);
    ctx.fillStyle=C.navy;ctx.font='700 64px '+FONT;ctx.fillText('AI',971,368);
  }
  header(ctx,props.category,true,props.english);
  rect(ctx,80,169,192,39,9,'#355266');
  ctx.fillStyle='#CBEFE1';ctx.font='700 19px '+FONT;ctx.fillText('TODAY’S TOPIC',96,195);
  ctx.fillStyle=C.white;ctx.font='800 57px '+FONT;
  print(ctx,wrap(ctx,visible(clean(props.title),props.english)||'Today\'s Topic',750,4),80,286,77);
  ctx.strokeStyle=C.mint;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(80,548);ctx.lineTo(270,548);ctx.stroke();
  ctx.font='500 25px '+FONT;ctx.fillStyle='#CFDED9';ctx.fillText(props.english?'Today\'s News, Clearly Explained':'핵심만 정리한 오늘의 이슈',80,597);
  footer(ctx,h,true,props.index);
}
function information(ctx:CanvasRenderingContext2D,props:Props){
  const h=900;ctx.fillStyle=C.cream;ctx.fillRect(0,0,1200,h);
  ctx.fillStyle=C.mint;ctx.fillRect(0,0,1200,16);header(ctx,props.category,false,props.english);
  ctx.fillStyle=C.navy;ctx.font='800 55px '+FONT;
  ctx.fillText(props.english ? (props.variant==='detail'?'Key Facts at a Glance':'Three Key Takeaways') : (props.variant==='detail'?'이슈 핵심 살펴보기':'오늘의 이슈, 3줄 정리'),80,208);
  ctx.fillStyle=C.gray;ctx.font='500 23px '+FONT;ctx.fillText(props.english?'AI draft · Verify facts before publishing':'AI 초안 기반 · 발행 전 사실 확인 필요',80,256);
  const snippets=facts(props.excerpt||'',props.variant,props.english);
  if(!snippets.length){
    rect(ctx,80,320,1040,380,23,C.white);ctx.fillStyle=C.ink;ctx.font='700 39px '+FONT;
    print(ctx,wrap(ctx,visible(clean(props.title),props.english)||'Today\'s Topic',930,3),124,410,59);
    ctx.fillStyle=C.gray;ctx.font='500 25px '+FONT;ctx.fillText(props.english?'Key details appear when the article is ready.':'본문 내용이 준비되면 핵심 정보가 표시돼.',124,636);
  }else{
    snippets.forEach((snippet,i)=>{
      const y=304+i*168;
      rect(ctx,80,y,1040,147,20,C.white);
      rect(ctx,101,y+26,64,64,20,i===0?C.navy:'#E7F6EF');
      ctx.fillStyle=i===0?C.mint:C.navy;ctx.font='800 28px '+FONT;ctx.fillText(String(i+1).padStart(2,'0'),113,y+69);
      ctx.fillStyle=C.ink;ctx.font='600 27px '+FONT;
      print(ctx,wrap(ctx,snippet,895,3),192,y+51,37);
    });
  }
  ctx.strokeStyle=C.line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(80,814);ctx.lineTo(1120,814);ctx.stroke();
  footer(ctx,h,false,props.index);
}
export function drawInfoCard(canvas:HTMLCanvasElement,props:Props){
  canvas.width=1200;canvas.height=props.variant==='cover'?675:900;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  if(props.variant==='cover')cover(ctx,props);else information(ctx,props);
}
export default function ImageCard(props:Props){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(ref.current)drawInfoCard(ref.current,props)},[props.title,props.description,props.category,props.index,props.variant,props.excerpt]);
  const save=()=>{
    const canvas=ref.current;if(!canvas)return;
    canvas.toBlob(blob=>{
      if(!blob)return;
      const u=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=u;a.download='todaypick-'+props.variant+'-'+(props.index+1)+'.png';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
    },'image/png');
  };
  return <div className="generated-image">
    <canvas ref={ref} role="img" aria-label={props.title+' 관련 '+(props.index+1)+'번 자체 제작 정보 카드 미리보기'}/>
    <button className="btn btn-light" type="button" onClick={save}>PNG 이미지 저장 ↓</button>
  </div>;
}
