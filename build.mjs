// restaurant.json → site/ (홈페이지, 구조화 데이터, robots·sitemap·llms.txt, 대시보드)
// 실행: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';

const r = JSON.parse(readFileSync('restaurant.json', 'utf8'));
const OUT = 'site';
const base = r.site.url.endsWith('/') ? r.site.url : r.site.url + '/';
const DAY = { Mo: ['Monday', '월'], Tu: ['Tuesday', '화'], We: ['Wednesday', '수'], Th: ['Thursday', '목'], Fr: ['Friday', '금'], Sa: ['Saturday', '토'], Su: ['Sunday', '일'] };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const won = n => n.toLocaleString('ko-KR') + '원';
const fullAddr = `${r.address.region} ${r.address.locality} ${r.address.street}`;
const sameAs = Object.values(r.links).filter(Boolean);

// 빌드 경고: 네이버는 설명 80자 이하 권장, 구글은 160자 안팎
const warn = [];
if (r.seo.description.length > 80) warn.push(`seo.description ${r.seo.description.length}자 → 네이버 권장 80자 이하`);
if (r.faq.length < 5) warn.push(`FAQ ${r.faq.length}개 → 5개 이상 권장 (AI 답변에 인용되기 쉬움)`);
for (const [k, v] of Object.entries(r.links)) if (!v) warn.push(`links.${k} 비어 있음`);
if (!r.site.ogImage) warn.push('site.ogImage 비어 있음 → 카톡·인스타 공유 미리보기 이미지 없음');

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': base + '#restaurant',
    name: r.name,
    alternateName: r.nameEn || undefined,
    description: r.description,
    url: base,
    telephone: r.phone,
    priceRange: r.priceRange,
    servesCuisine: r.servesCuisine,
    image: r.site.ogImage || undefined,
    address: { '@type': 'PostalAddress', streetAddress: r.address.street, addressLocality: r.address.locality, addressRegion: r.address.region, postalCode: r.address.postalCode || undefined, addressCountry: r.address.country },
    geo: { '@type': 'GeoCoordinates', latitude: r.geo.lat, longitude: r.geo.lng },
    openingHoursSpecification: r.hours.map(h => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days.map(d => 'https://schema.org/' + DAY[d][0]), opens: h.open, closes: h.close })),
    amenityFeature: r.features.map(f => ({ '@type': 'LocationFeatureSpecification', name: f, value: true })),
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: r.menu.map(s => ({
        '@type': 'MenuSection', name: s.section,
        hasMenuItem: s.items.map(i => ({ '@type': 'MenuItem', name: i.name, description: i.description, offers: { '@type': 'Offer', price: i.price, priceCurrency: 'KRW' } })),
      })),
    },
    sameAs: sameAs.length ? sameAs : undefined,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: r.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  },
];

// 같은 요일 묶음은 한 줄로: "월·화·수·목·금 11:00~15:00, 17:00~20:30"
const hoursGroups = r.hours.reduce((m, h) => { const k = h.days.map(d => DAY[d][1]).join('·'); (m[k] ||= []).push(h.open + '~' + h.close); return m; }, {});
const hoursText = Object.entries(hoursGroups).map(([d, t]) => d + ' ' + t.join(', '));
const mapLinks = [
  ['네이버 지도', r.links.naverPlace || `https://map.naver.com/p/search/${encodeURIComponent(r.name)}`],
  ['카카오맵', r.links.kakaoMap || `https://map.kakao.com/?q=${encodeURIComponent(r.name)}`],
  ['구글 지도', r.links.googleMaps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + fullAddr)}`],
];

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.seo.title)}</title>
<meta name="description" content="${esc(r.seo.description)}">
<link rel="canonical" href="${esc(base)}">
${r.site.naverVerification ? `<meta name="naver-site-verification" content="${esc(r.site.naverVerification)}">` : '<!-- naver-site-verification: restaurant.json site.naverVerification -->'}
${r.site.googleVerification ? `<meta name="google-site-verification" content="${esc(r.site.googleVerification)}">` : '<!-- google-site-verification: restaurant.json site.googleVerification -->'}
<meta property="og:type" content="restaurant">
<meta property="og:title" content="${esc(r.seo.title)}">
<meta property="og:description" content="${esc(r.seo.description)}">
<meta property="og:url" content="${esc(base)}">
<meta property="og:locale" content="ko_KR">
${r.site.ogImage ? `<meta property="og:image" content="${esc(r.site.ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>
:root{--bg:#fbf8f3;--ink:#2a2420;--muted:#6e645b;--line:#e6ddd2;--accent:#b4441f;--card:#fff;--space-2:8px;--space-3:12px;--space-4:16px;--space-6:24px;--space-8:32px;--space-12:48px;--radius:12px}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--ink:#f3ede6;--muted:#b3a99f;--line:#3a332e;--accent:#f08a5d;--card:#26211e}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all}
main{max-width:720px;margin:0 auto;padding:0 var(--space-4) var(--space-12)}
header{padding:var(--space-12) 0 var(--space-8);border-bottom:1px solid var(--line)}
.eyebrow{color:var(--accent);font-weight:600;font-size:14px;margin:0}
h1{font-size:clamp(32px,8vw,48px);line-height:1.15;margin:var(--space-2) 0}
h2{font-size:22px;margin:var(--space-12) 0 var(--space-4)}
h3{font-size:15px;color:var(--muted);margin:var(--space-6) 0 var(--space-2)}
.lead{font-size:18px;color:var(--muted);margin:0}
.actions{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-6)}
.btn{display:inline-block;padding:10px 16px;border-radius:999px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600;font-size:15px;background:var(--card)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
ul.menu{list-style:none;padding:0;margin:0}
ul.menu li{display:grid;grid-template-columns:1fr auto;gap:0 var(--space-4);padding:var(--space-3) 0;border-bottom:1px solid var(--line)}
ul.menu .price{font-variant-numeric:tabular-nums;font-weight:600}
ul.menu .desc{grid-column:1/-1;color:var(--muted);font-size:14px}
.sig{color:var(--accent);font-size:13px;font-weight:600;margin-left:6px}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:var(--space-2) var(--space-4)}
dt{color:var(--muted)}dd{margin:0}
.tags{display:flex;flex-wrap:wrap;gap:var(--space-2);padding:0;list-style:none}
.tags li{padding:4px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:14px}
details{border-bottom:1px solid var(--line);padding:var(--space-3) 0}
summary{font-weight:600;cursor:pointer}
details p{margin:var(--space-2) 0 0;color:var(--muted)}
footer{margin-top:var(--space-12);color:var(--muted);font-size:13px}
</style>
</head>
<body>
<main>
<header>
<p class="eyebrow">${esc(r.area)} · ${esc(r.category)}</p>
<h1>${esc(r.name)}</h1>
<p class="lead">${esc(r.tagline)}</p>
<div class="actions">
<a class="btn primary" href="tel:${esc(r.phone.replace(/[^0-9+]/g, ''))}">전화 ${esc(r.phone)}</a>
${mapLinks.map(([t, u]) => `<a class="btn" href="${esc(u)}" rel="noopener">${t}</a>`).join('\n')}
${r.links.instagram ? `<a class="btn" href="${esc(r.links.instagram)}" rel="noopener">인스타그램</a>` : ''}
</div>
</header>

<section>
<h2>가게 소개</h2>
<p>${esc(r.description)}</p>
<ul class="tags">${r.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
</section>

<section>
<h2>메뉴</h2>
${r.menu.map(s => `<h3>${esc(s.section)}</h3>
<ul class="menu">${s.items.map(i => `<li><span>${esc(i.name)}${i.signature ? '<span class="sig">대표</span>' : ''}</span><span class="price">${won(i.price)}</span>${i.description ? `<span class="desc">${esc(i.description)}</span>` : ''}</li>`).join('')}</ul>`).join('\n')}
</section>

<section>
<h2>영업시간 · 오시는 길</h2>
<dl>
<dt>영업</dt><dd>${hoursText.map(esc).join('<br>')}</dd>
<dt>안내</dt><dd>${esc(r.hoursNote)}</dd>
<dt>주소</dt><dd>${esc(fullAddr)}</dd>
<dt>찾아오기</dt><dd>${esc(r.directions)}</dd>
<dt>전화</dt><dd>${esc(r.phone)}</dd>
</dl>
</section>

<section>
<h2>자주 묻는 질문</h2>
${r.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
</section>

<footer>© ${esc(r.name)} · ${esc(fullAddr)}</footer>
</main>
</body>
</html>
`;

const robots = `# 검색엔진과 AI 검색(ChatGPT·Perplexity·Claude·Gemini 등) 모두 허용
User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${base}sitemap.xml
`;

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${esc(base)}</loc><lastmod>${today}</lastmod></url>
</urlset>
`;

// llms.txt: AI가 가게 정보를 한 번에 읽어 가도록 정리한 요약
const llms = `# ${r.name}

> ${r.description}

- 종류: ${r.servesCuisine.join(', ')}
- 주소: ${fullAddr}
- 찾아오기: ${r.directions}
- 전화: ${r.phone}
- 영업: ${hoursText.join(' / ')} (${r.hoursNote})
- 특징: ${r.features.join(', ')}

## 메뉴
${r.menu.flatMap(s => s.items.map(i => `- ${i.name} ${won(i.price)}${i.description ? ` — ${i.description}` : ''}`)).join('\n')}

## 자주 묻는 질문
${r.faq.map(f => `- Q. ${f.q}\n  A. ${f.a}`).join('\n')}

## 링크
- 홈페이지: ${base}
${Object.entries(r.links).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/data`, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
writeFileSync(`${OUT}/robots.txt`, robots);
writeFileSync(`${OUT}/sitemap.xml`, sitemap);
writeFileSync(`${OUT}/llms.txt`, llms);
writeFileSync(`${OUT}/data/restaurant.json`, JSON.stringify(r, null, 2));
cpSync('dashboard', `${OUT}/admin`, { recursive: true });
if (existsSync('public')) cpSync('public', OUT, { recursive: true });
writeFileSync(`${OUT}/.nojekyll`, '');

console.log(`site/ 생성 완료 (${base})`);
if (warn.length) console.log('\n점검 필요:\n- ' + warn.join('\n- '));
