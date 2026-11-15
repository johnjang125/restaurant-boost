// 네이버 플레이스 방문자 리뷰 요약 모으기 → data/reviews.json
// 사용: node scripts/fetch-place-reviews.mjs
//
// 주의 (사장님 결정으로 넣은 기능):
// - 네이버 공개 페이지를 읽는 방식이라 네이버 약관상 허용된 방법이 아니고, 네이버가 화면 구조를 바꾸면 깨집니다.
//   실패하면 기존 data/reviews.json을 그대로 두고 조용히 끝냅니다.
// - 리뷰 글은 작성자 저작물이라 전문을 싣지 않습니다. 한 줄(최대 EXCERPT자) 인용 + 닉네임 가림 + 원문 링크만.
// - 구조화 데이터(JSON-LD)에 리뷰·별점으로 넣지 않습니다. 구글은 가게가 직접 올린 자기 리뷰 마크업을 인정하지 않습니다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const EXCERPT = 80;
const r = JSON.parse(readFileSync('restaurant.json', 'utf8'));
const placeId = (r.links.naverPlace.match(/place\/(\d+)/) || [])[1];
if (!placeId) { console.log('links.naverPlace에서 플레이스 번호를 못 찾음 → 건너뜀'); process.exit(0); }

const fail = msg => { console.log(`리뷰 갱신 실패: ${msg} → 기존 data/reviews.json 유지`); process.exit(0); };
let html;
try {
  const res = await fetch(`https://m.place.naver.com/restaurant/${placeId}/review/visitor`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 'Accept-Language': 'ko-KR' },
  });
  if (!res.ok) fail(`HTTP ${res.status}`);
  html = await res.text();
} catch (e) { fail(e.message); }

const m = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{.*?\});\s*window\./s);
if (!m) fail('페이지 구조가 바뀜');
let st; try { st = JSON.parse(m[1]); } catch { fail('데이터 해석 실패'); }

const text = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = s => {
  if (s.length <= EXCERPT) return s;
  const head = s.slice(0, EXCERPT);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('요 '));
  return (end > 30 ? head.slice(0, end + 1) : head.replace(/\s\S*$/, '')) + '…';
};
const mask = n => { n = text(n); return n ? n[0] + '*'.repeat(Math.min(Math.max(n.length - 1, 2), 4)) : '손님'; };

const json = JSON.stringify(st);
const total = +(json.match(/"visitorReviewsTotal":(\d+)/) || [])[1] || null;
const kwBlock = Object.values(st).find(v => v?.__typename === 'VisitorReviewStatsAnalysisVoteKeyword')
  || JSON.parse((json.match(/\{"__typename":"VisitorReviewStatsAnalysisVoteKeyword".*?"details":\[.*?\]\}/) || ['null'])[0]);
const keywords = (kwBlock?.details || []).slice(0, 5).map(d => ({ name: text(d.displayName), count: d.count }));

const reviews = Object.entries(st).filter(([k]) => k.startsWith('VisitorReview:')).map(([, v]) => v)
  .filter(v => text(v.body).length >= 20)
  .slice(0, 6)
  .map(v => ({
    excerpt: cut(text(v.body)),
    author: mask(st[v.author?.__ref]?.nickname),
    visited: text(v.visited),
    keywords: (v.votedKeywords || []).slice(0, 2).map(k => text(k.name)),
  }));

if (!reviews.length && !keywords.length) fail('리뷰를 못 찾음');
mkdirSync('data', { recursive: true });
writeFileSync('data/reviews.json', JSON.stringify({
  updated: new Date().toISOString().slice(0, 10),
  source: `https://m.place.naver.com/restaurant/${placeId}/review/visitor`,
  total, keywords, reviews,
}, null, 2) + '\n');
console.log(`방문자 리뷰 ${total ?? '?'}개 중 ${reviews.length}개 인용, 키워드 ${keywords.length}개 → data/reviews.json`);
