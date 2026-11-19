import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPublished } from '../app/lib/publishedMatch.ts';

const post = {
  channel:'naver', title:'태연 정규 4집 컴백 이어 1년 10개월 만에 단독 콘서트 FLY 개최',
  url:'https://blog.naver.com/todaypickkr/224483300581',
};
const candidate = title => ({
  id:'id',title,
  headlines:[{title:title+' - 스포츠신문',publisher:'스포츠신문',url:'https://news.example/1'}],
});
test('same title is confirmed and excluded',() => {
  const result=matchPublished(candidate(post.title),[post]);
  assert.equal(result?.type,'confirmed');
});
test('only a celebrity name does not hide another story',() => {
  const result=matchPublished(candidate('태연 신곡 뮤직비디오 제작 비하인드 최초 공개'),[post]);
  assert.notEqual(result?.type,'confirmed');
});
test('show related but different coverage as suspicion',() => {
  const result=matchPublished(candidate('태연 콘서트 FLY 추가 공연 예매 및 팬클럽 선예매 안내'),[post]);
  assert.notEqual(result?.type,'confirmed');
});
test('unrelated entertainment is never marked published',() => {
  const result=matchPublished(candidate('새 드라마 시청률 기록과 방송 일정 안내'),[post]);
  assert.equal(result,null);
});
test('reject non-HTTPS links as RSS evidence',() => {
  assert.equal(matchPublished(candidate(post.title),[{...post,url:'http://example.test/1'}]),null);
});
