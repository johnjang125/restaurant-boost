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
    image: [r.site.ogImage, ...r.menu.flatMap(s => s.items).filter(i => i.photo).map(i => base + i.photo)].filter(Boolean),
    address: { '@type': 'PostalAddress', streetAddress: r.address.street, addressLocality: r.address.locality, addressRegion: r.address.region, postalCode: r.address.postalCode || undefined, addressCountry: r.address.country },
    geo: { '@type': 'GeoCoordinates', latitude: r.geo.lat, longitude: r.geo.lng },
    openingHoursSpecification: r.hours.map(h => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days.map(d => 'https://schema.org/' + DAY[d][0]), opens: h.open, closes: h.close })),
    amenityFeature: r.features.map(f => ({ '@type': 'LocationFeatureSpecification', name: f, value: true })),
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: r.menu.map(s => ({
        '@type': 'MenuSection', name: s.section,
        hasMenuItem: s.items.map(i => ({ '@type': 'MenuItem', name: i.name, description: i.description, image: i.photo ? base + i.photo : undefined, offers: { '@type': 'Offer', price: i.price, priceCurrency: 'KRW' } })),
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

const ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const byDay = Object.fromEntries(ORDER.map(d => [d, r.hours.filter(h => h.days.includes(d)).map(h => [h.open, h.close])]));
const hanja = r.nameHanja || r.name;
const telHref = 'tel:' + r.phone.replace(/[^0-9+]/g, '');
const dash = s => s.replace(/~/g, '–');
// 요일 묶음: 같은 시간표인 요일을 모아 "월–금"처럼
const dayRange = ds => ds.length > 2 && ds.every((d, i) => i === 0 || ORDER.indexOf(d) === ORDER.indexOf(ds[i - 1]) + 1)
  ? `${DAY[ds[0]][1]}–${DAY[ds.at(-1)][1]}` : ds.map(d => DAY[d][1]).join('·');
const schedule = Object.values(ORDER.reduce((m, d) => {
  const k = JSON.stringify(byDay[d]); (m[k] ||= { days: [], times: byDay[d] }).days.push(d); return m;
}, {})).map(g => ({ label: dayRange(g.days), text: g.times.length ? g.times.map(([o, c]) => `${o}–${c}`).join(' · ') : '휴무', off: !g.times.length }));
const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const reviews = readJson('data/reviews.json');
const blog = readJson('data/blog.json');
const kwMax = Math.max(1, ...(reviews?.keywords || []).map(k => k.count));
const mapRows = [
  ['네이버 지도', mapLinks[0][1], '길찾기'],
  ['카카오맵', mapLinks[1][1], '길찾기'],
  ['Google Maps', mapLinks[2][1], 'Directions'],
];
const arrow = '<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>';
const plus = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const heroDish = r.menu.flatMap(s => s.items).find(i => i.signature && i.photo);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.seo.title)}</title>
<meta name="description" content="${esc(r.seo.description)}">
<link rel="canonical" href="${esc(base)}">
${r.site.naverVerification ? `<meta name="naver-site-verification" content="${esc(r.site.naverVerification)}">` : ''}
${r.site.googleVerification ? `<meta name="google-site-verification" content="${esc(r.site.googleVerification)}">` : ''}
<meta name="theme-color" content="#f4f3ef">
<meta property="og:type" content="restaurant">
<meta property="og:title" content="${esc(r.seo.title)}">
<meta property="og:description" content="${esc(r.seo.description)}">
<meta property="og:url" content="${esc(base)}">
<meta property="og:locale" content="ko_KR">
${r.site.ogImage ? `<meta property="og:image" content="${esc(r.site.ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=block&text=${encodeURIComponent(hanja)}">
<style>
:root{
  --board:#f4f3ef;--paper:#fff;--ink:#141210;--ink-2:#4a4540;--ink-3:#6b655e;--line:#dcd8d0;
  --awning:#5a3523;--awning-ink:#f3e6da;--open:#1f7a45;
  --brush:"Ma Shan Zheng",serif;--sans:"Pretendard Variable",Pretendard,system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;--s8:64px;--s9:96px;
  --ease:cubic-bezier(.16,1,.3,1);
  color-scheme:light;
}
*{box-sizing:border-box}
html{scrollbar-color:var(--ink-3) var(--paper)}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 var(--sans);word-break:keep-all;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 0}
::selection{background:var(--awning);color:var(--awning-ink)}
a{color:inherit;text-underline-offset:.25em;text-decoration-thickness:1px}
:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.wrap{max-width:1080px;margin:0 auto;padding:0 var(--s4)}
.num{font-variant-numeric:tabular-nums}

/* 간판: 흰 판에 검은 붓글씨, 조명 세 개 */
.sign{position:relative;background:var(--board);border-bottom:1px solid var(--line);overflow:hidden}
.sign::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(38% 120% at 18% -10%,#fff 0,rgba(255,255,255,0) 70%),radial-gradient(30% 110% at 46% -10%,#fff 0,rgba(255,255,255,0) 70%),radial-gradient(34% 120% at 82% -10%,#fff 0,rgba(255,255,255,0) 70%);
  animation:lamps 1.6s var(--ease) .2s forwards}
@keyframes lamps{to{opacity:1}}
@media (prefers-reduced-motion:reduce){.sign::before{animation:none;opacity:1}}
.sign .wrap{position:relative;display:grid;gap:var(--s2);padding-top:var(--s6);padding-bottom:var(--s5)}
.hanja{font-family:var(--brush);font-weight:400;font-size:clamp(76px,24vw,168px);line-height:.95;margin:0;letter-spacing:.01em;color:var(--ink);text-shadow:0 3px 6px rgba(20,18,16,.18)}
.sign-sub{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:var(--s1) var(--s4)}
h1{font-size:22px;font-weight:800;letter-spacing:.3em;margin:0}
.spec{margin:0;font-size:16px;font-weight:600;letter-spacing:.08em;color:var(--ink-2)}
@media (min-width:900px){
  .sign .wrap{grid-template-columns:auto 1fr;align-items:end;column-gap:var(--s5);padding-top:var(--s7);padding-bottom:var(--s6)}
  .sign-sub{display:contents}
  h1{align-self:end;margin-bottom:.6em}
  .spec{grid-column:1/-1;justify-self:end;margin-top:calc(var(--s6) * -1)}
}

/* 차양: 갈색 띠에 지금 영업 상태 */
.awning{background:var(--awning);color:var(--awning-ink);font-size:15px}
.awning .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--s1) var(--s4);padding-top:var(--s3);padding-bottom:var(--s3)}
.status{display:inline-flex;align-items:center;gap:var(--s2);font-weight:700}
.status::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--awning-ink);opacity:.5}
.status[data-open="1"]::before{background:#7fe0a3;opacity:1}

/* 첫 화면 본문 */
.lead{display:grid;gap:var(--s6);padding:var(--s6) 0 var(--s8)}
.dish{margin:0;justify-self:center;width:min(100%,520px)}
.dish img{display:block;width:100%;height:auto}
.dish figcaption{display:flex;justify-content:space-between;gap:var(--s3);border-top:1px solid var(--ink);padding-top:var(--s2);font-weight:700}
.go{display:grid;gap:var(--s5);align-content:start}
.tagline{margin:0;font-size:clamp(26px,6.4vw,40px);line-height:1.3;font-weight:800;letter-spacing:-.02em;text-wrap:balance}
.en{margin:calc(var(--s3) * -1) 0 0;font-size:15px;color:var(--ink-3)}
.maps{display:grid;border-top:2px solid var(--ink)}
.maps a{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);min-height:58px;padding:0 var(--s1);border-bottom:1px solid var(--line);text-decoration:none;font-weight:700;font-size:18px;transition:background .2s var(--ease),padding .2s var(--ease)}
.maps a span{display:inline-flex;align-items:center;gap:var(--s2);font-weight:600;font-size:15px;color:var(--ink-2)}
.maps a:first-child{background:var(--ink);color:var(--paper);padding:0 var(--s4);border-bottom:0}
.maps a:first-child span{color:var(--board)}
.maps a:hover{padding-left:var(--s3)}
.maps a:first-child:hover{padding-left:var(--s5);background:#000}
.arr{width:16px;height:16px}
.call{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:var(--s1) var(--s4);margin:0;font-size:15px;color:var(--ink-2)}
.call a{white-space:nowrap}
.call a{font-size:22px;font-weight:800;color:var(--ink);text-decoration:none;letter-spacing:.01em}
@media (min-width:900px){
  .lead{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:var(--s8);align-items:center;padding:var(--s7) 0 var(--s9)}
  .dish{justify-self:stretch;width:100%}
}

/* 섹션 공통 */
section{padding:var(--s8) 0 0}
h2{font-size:clamp(24px,5.4vw,30px);font-weight:800;letter-spacing:-.01em;margin:0 0 var(--s4);padding-bottom:var(--s3);border-bottom:2px solid var(--ink)}
.cols{display:grid;gap:var(--s8)}
@media (min-width:900px){.cols{grid-template-columns:1fr 1fr;gap:var(--s8)}}

/* 메뉴판 */
h3{font-size:15px;font-weight:700;letter-spacing:.12em;color:var(--ink-3);margin:var(--s6) 0 0}
h3:first-child{margin-top:var(--s2)}
.menu{list-style:none;margin:0;padding:0}
.menu li{display:grid;grid-template-columns:1fr auto;column-gap:var(--s4);align-items:baseline;padding:var(--s3) 0;border-bottom:1px solid var(--line)}
.menu li.has-photo{grid-template-columns:88px 1fr auto;align-items:center}
.menu .ph{grid-row:span 2;width:88px}
@media (max-width:599px){.menu .ph{display:none}.menu li.has-photo:has(.ph){grid-template-columns:1fr auto}.menu li.has-photo:has(.ph) .d{grid-column:1/-1}}
.menu img{grid-row:span 2;width:88px;height:88px;object-fit:cover;display:block}
.menu .n{font-size:18px;font-weight:700}
.menu .p{font-weight:700;font-variant-numeric:tabular-nums}
.menu .d{grid-column:1/-1;font-size:15px;color:var(--ink-2);line-height:1.55;margin-top:2px}
.menu li.has-photo .d{grid-column:2/-1;margin-top:0}
.sig{display:inline-block;margin-left:var(--s2);padding:0 5px;border:1px solid var(--awning);color:var(--awning);font-size:13px;font-weight:700;vertical-align:2px;line-height:1.5}

/* 영업시간·길 */
.sched{margin:0;display:grid}
.sched div{display:grid;grid-template-columns:4.5em 1fr;gap:var(--s3);padding:var(--s3) 0;border-bottom:1px solid var(--line);font-size:18px}
.sched dt{font-weight:800}
.sched dd{margin:0;font-variant-numeric:tabular-nums}
.sched .off dd{color:var(--awning);font-weight:700}
.note{margin:var(--s3) 0 0;color:var(--ink-2);font-size:16px}
.way{margin:0;display:grid}
.way div{display:grid;grid-template-columns:4.5em 1fr;gap:var(--s3);padding:var(--s3) 0;border-bottom:1px solid var(--line)}
.way dt{font-weight:800}
.way dd{margin:0;color:var(--ink-2)}

/* 손님 후기 */
.kw{list-style:none;margin:0 0 var(--s6);padding:0;display:grid;gap:var(--s2)}
.kw li{display:grid;grid-template-columns:9.5em 1fr 3em;align-items:center;gap:var(--s3);font-size:16px}
.kw i{display:block;height:10px;background:var(--awning)}
.kw b{text-align:right;font-variant-numeric:tabular-nums}
.quotes{list-style:none;margin:0;padding:0;display:grid;gap:0}
.quotes li{padding:var(--s4) 0;border-bottom:1px solid var(--line)}
.quotes blockquote{margin:0;font-size:17px}
.quotes p{margin:var(--s1) 0 0;font-size:14px;color:var(--ink-3)}
@media (min-width:900px){.quotes{grid-template-columns:1fr 1fr;column-gap:var(--s7)}}
.more{display:inline-flex;align-items:center;gap:var(--s2);margin-top:var(--s4);font-weight:700}
.blog{list-style:none;margin:0;padding:0}
.blog li{padding:var(--s3) 0;border-bottom:1px solid var(--line)}
.blog a{font-weight:700}
.blog p{margin:2px 0 0;font-size:14px;color:var(--ink-3)}
.fine{font-size:13px;color:var(--ink-3);margin:var(--s3) 0 0}

/* 가게 이야기 */
.about{font-size:clamp(20px,5vw,26px);line-height:1.6;font-weight:600;letter-spacing:-.01em;max-width:30em;margin:0}

details{border-bottom:1px solid var(--line)}
summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:var(--s4);padding:var(--s3) 0;font-weight:700;cursor:pointer}
summary::-webkit-details-marker{display:none}
.ico{width:16px;height:16px;flex:none;transition:transform .3s var(--ease)}
details[open] .ico{transform:rotate(45deg)}
details p{margin:0 0 var(--s4);color:var(--ink-2);max-width:62ch}

footer{margin-top:var(--s9);background:var(--awning);color:var(--awning-ink)}
footer .wrap{display:grid;gap:var(--s2);padding-top:var(--s6);padding-bottom:calc(var(--s8) + 64px)}
footer .hanja{color:var(--awning-ink);font-size:64px;text-shadow:none}
footer p{margin:0;font-size:15px}
footer a{color:var(--awning-ink)}

/* 휴대폰: 아래 고정 길찾기·전화 */
.dock{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:1fr 1fr;background:var(--ink);transform:translateY(100%);transition:transform .35s var(--ease);z-index:10;padding-bottom:env(safe-area-inset-bottom)}
.dock.on{transform:none}
.dock a{display:flex;align-items:center;justify-content:center;gap:var(--s2);min-height:56px;color:var(--paper);text-decoration:none;font-weight:800}
.dock a+a{border-left:1px solid #3a3530}
@media (min-width:900px){.dock{display:none}footer .wrap{padding-bottom:var(--s8)}}
</style>
</head>
<body>
<header>
<div class="sign">
<div class="wrap">
<p class="hanja" lang="zh-Hant" aria-hidden="true">${esc(hanja)}</p>
<div class="sign-sub">
<h1>${esc(r.name)}</h1>
<p class="spec">${esc(r.servesCuisine.slice(1, 3).join('·'))} 전문점</p>
</div>
</div>
</div>
<div class="awning"><div class="wrap"><span>${esc(r.area)}</span><span class="status" id="status" role="status">${esc(schedule.map(s => s.label + ' ' + s.text).join(' / '))}</span></div></div>
</header>

<main class="wrap">
<div class="lead">
${heroDish ? `<figure class="dish"><img src="${esc(heroDish.photo)}" alt="${esc(heroDish.name)}, 위에서 본 뚝배기" width="640" height="640" fetchpriority="high"><figcaption><span>${esc(heroDish.name)}</span><span class="num">${won(heroDish.price)}</span></figcaption></figure>` : ''}
<div class="go">
<p class="tagline">${esc(r.tagline)}</p>
${r.taglineEn ? `<p class="en" lang="en">${esc(r.nameEn)} — ${esc(r.taglineEn)}</p>` : ''}
<nav class="maps" aria-label="길찾기">${mapRows.map(([t, u, a]) => `<a href="${esc(u)}" rel="noopener">${esc(t)}<span>${a}${arrow}</span></a>`).join('')}</nav>
<p class="call">${esc(fullAddr)}<a href="${esc(telHref)}" class="num">${esc(r.phone)}</a></p>
</div>
</div>

<section id="menu" aria-labelledby="h-menu">
<h2 id="h-menu">메뉴</h2>
<div class="cols">
${[0, 1].map(col => `<div>${r.menu.filter((_, i) => (i % 2) === col).map(s => `<h3>${esc(s.section)}</h3>
<ul class="menu">${s.items.map((i, _, all) => { const ph = all.some(x => x.photo); return `<li${ph ? ' class="has-photo"' : ''}>${i.photo ? `<img src="${esc(i.photo)}" alt="" width="88" height="88" loading="lazy" decoding="async">` : ph ? '<span class="ph" aria-hidden="true"></span>' : ''}<span class="n">${esc(i.name)}${i.signature ? '<span class="sig">대표</span>' : ''}</span><span class="p">${won(i.price)}</span>${i.description ? `<span class="d">${esc(i.description)}</span>` : ''}</li>`; }).join('')}</ul>`).join('\n')}</div>`).join('\n')}
</div>
</section>

<section id="hours">
<div class="cols">
<div>
<h2>영업시간</h2>
<dl class="sched">${schedule.map(s => `<div${s.off ? ' class="off"' : ''}><dt>${esc(s.label)}</dt><dd>${esc(s.text)}</dd></div>`).join('')}</dl>
${r.lastOrder ? `<p class="note">라스트오더 ${esc(r.lastOrder)}</p>` : ''}
</div>
<div>
<h2>찾아오는 길</h2>
<dl class="way">
<div><dt>주소</dt><dd>${esc(fullAddr)}</dd></div>
${(r.transit || []).map(t => `<div><dt>${esc(t.label)}</dt><dd>${esc(t.text)}</dd></div>`).join('')}
</dl>
</div>
</div>
</section>

${reviews ? `<section id="reviews" aria-labelledby="h-rev">
<h2 id="h-rev">손님 후기</h2>
${reviews.keywords?.length ? `<ul class="kw" aria-label="네이버 방문자 리뷰 키워드">${reviews.keywords.map(k => `<li><span>${esc(k.name)}</span><i style="width:${Math.round(k.count / kwMax * 100)}%"></i><b>${k.count}</b></li>`).join('')}</ul>` : ''}
<ul class="quotes">${(reviews.reviews || []).map(q => `<li><blockquote>${esc(q.excerpt)}</blockquote><p>${esc(q.author)} · ${esc(q.visited)} 방문</p></li>`).join('')}</ul>
<a class="more" href="${esc(r.links.naverPlace)}" rel="noopener">네이버 방문자 리뷰${reviews.total ? ` ${reviews.total}개` : ''} 전체 보기${arrow}</a>
<p class="fine">네이버 플레이스 방문자 리뷰에서 일부만 옮겼습니다 (${esc(reviews.updated)} 기준).</p>
${blog?.posts?.length ? `<h3>블로그 후기</h3><ul class="blog">${blog.posts.slice(0, 6).map(p => `<li><a href="${esc(p.link)}" rel="noopener nofollow">${esc(p.title)}</a><p>${esc(p.blogger)} · ${esc(p.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3'))}</p></li>`).join('')}</ul>` : ''}
</section>` : ''}

<section id="about" aria-labelledby="h-about">
<h2 id="h-about">가게 이야기</h2>
<p class="about">${esc(r.description)}</p>
</section>

<section id="faq" aria-labelledby="h-faq">
<h2 id="h-faq">자주 묻는 질문</h2>
${r.faq.map(f => `<details><summary>${esc(f.q)}${plus}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
</section>
</main>

<footer>
<div class="wrap">
<p class="hanja" lang="zh-Hant" aria-hidden="true">${esc(hanja)}</p>
<p>${esc(r.name)}${r.nameEn ? ` · <span lang="en">${esc(r.nameEn)}</span>` : ''} · ${esc(fullAddr)} · <a href="${esc(telHref)}">${esc(r.phone)}</a></p>
<p>${[...mapLinks, ...(r.links.instagram ? [['인스타그램', r.links.instagram]] : [])].map(([t, u]) => `<a href="${esc(u)}" rel="noopener">${t}</a>`).join(' · ')}</p>
</div>
</footer>

<nav class="dock" aria-label="빠른 길찾기"><a href="${esc(mapLinks[0][1])}" rel="noopener">길찾기</a><a href="${esc(telHref)}">전화</a></nav>

<script>
(() => {
  // 지금 영업 상태 (서울 시간 기준)
  const H = ${JSON.stringify(byDay)}, ORDER = ${JSON.stringify(ORDER)}, KO = ${JSON.stringify(ORDER.map(d => DAY[d][1]))}, LAST = ${JSON.stringify(r.lastOrder || '')};
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const di = ORDER.indexOf(parts.weekday.slice(0, 2)), now = parts.hour + ':' + parts.minute;
  const el = document.getElementById('status'), today = H[ORDER[di]] || [];
  const next = () => { for (let k = 1; k <= 7; k++) { const d = ORDER[(di + k) % 7]; if (H[d].length) return (k === 1 ? '내일' : KO[(di + k) % 7] + '요일') + ' ' + H[d][0][0]; } return ''; };
  let t;
  const cur = today.find(([o, c]) => now >= o && now < c);
  if (cur) { t = '지금 영업 중' + (LAST && now < LAST ? ' · 라스트오더 ' + LAST : ''); el.dataset.open = '1'; }
  else if (!today.length) t = '오늘 휴무 · ' + next() + ' 열어요';
  else if (now < today[0][0]) t = '영업 전 · ' + today[0][0] + ' 열어요';
  else { const later = today.find(([o]) => now < o); t = later ? '브레이크타임 · ' + later[0] + ' 다시 열어요' : '오늘 영업 끝 · ' + next() + ' 열어요'; }
  el.textContent = t;
  // 길찾기 버튼이 화면 밖으로 나가면 아래 고정 막대 표시
  const dock = document.querySelector('.dock'), maps = document.querySelector('.maps');
  if (dock && maps && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => dock.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0)).observe(maps);
})();
</script>
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
