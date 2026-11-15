// 네이버 블로그 후기 모으기 (네이버 공식 검색 API)
// 사용: node scripts/fetch-blog.mjs   → data/blog.json
//
// 필요한 값(.env 또는 GitHub Actions secrets): NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
//   developers.naver.com → 애플리케이션 등록 → 사용 API "검색" → Client ID/Secret 발급
//
// 글 전문은 가져오지 않습니다. 네이버 API가 주는 제목·요약 한 줄·작성자·날짜와 원문 링크만 씁니다.
// (리뷰 전문 복사는 작성자 저작권과 네이버 약관 문제가 있고, 검색엔진에는 중복 문서로 보입니다.)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

try { process.loadEnvFile('.env'); } catch {}
const { NAVER_CLIENT_ID: id, NAVER_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.log('NAVER_CLIENT_ID/SECRET 없음 → 블로그 후기 갱신 건너뜀'); process.exit(0); }

const r = JSON.parse(readFileSync('restaurant.json', 'utf8'));
const cfg = r.blogSearch || {};
const queries = cfg.queries || [`${r.name} ${r.area}`, `${r.name} 설렁탕`];
const must = cfg.mustInclude || r.name;
const exclude = new Set(cfg.exclude || []);
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim();

const seen = new Map();
for (const q of queries) {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(q)}&display=50&sort=date`;
  const res = await fetch(url, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } });
  if (!res.ok) { console.error(`검색 실패 (${res.status}): ${q}`); process.exit(1); }
  for (const it of (await res.json()).items) {
    // 저장은 일반 텍스트로만. 홈페이지에 넣을 때 build.mjs가 모든 칸을 다시 이스케이프한다.
    // 링크는 https 네이버 주소만 받는다 (javascript: 같은 주소가 href로 들어가는 것 차단).
    let u; try { u = new URL(it.link); } catch { continue; }
    if (u.protocol !== 'https:' || !/(^|\.)naver\.com$/.test(u.hostname)) continue;
    const post = { title: strip(it.title), summary: strip(it.description), blogger: strip(it.bloggername), date: String(it.postdate).replace(/\D/g, '').slice(0, 8), link: u.href };
    // 가게 이름이 제목이나 요약에 있는 글만, 제외 목록(광고·다른 가게) 빼고
    if (!(post.title + post.summary).includes(must) || exclude.has(post.link)) continue;
    seen.set(post.link, post);
  }
}

const posts = [...seen.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, cfg.max || 12);
mkdirSync('data', { recursive: true });
writeFileSync('data/blog.json', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), posts }, null, 2) + '\n');
console.log(`블로그 후기 ${posts.length}개 → data/blog.json`);
