import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'AI Blog Studio | 오늘의 픽',description:'콘텐츠 큐레이션 및 숏폼 제작 워크스페이스'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="ko"><body>{children}</body></html>}
