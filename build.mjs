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
const dishes = r.menu.flatMap(s => s.items).filter(i => i.photo);
const telHref = 'tel:' + r.phone.replace(/[^0-9+]/g, '');
const glaze = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .78 0 0 0 0 .62 0 0 0 0 .46 0 0 0 .16 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`;
const plus = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

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
<meta name="theme-color" content="#1c140f">
<meta property="og:type" content="restaurant">
<meta property="og:title" content="${esc(r.seo.title)}">
<meta property="og:description" content="${esc(r.seo.description)}">
<meta property="og:url" content="${esc(base)}">
<meta property="og:locale" content="ko_KR">
${r.site.ogImage ? `<meta property="og:image" content="${esc(r.site.ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=block&text=${encodeURIComponent(hanja)}">
<style>
:root{
  --onggi:#1c140f;--onggi-raised:#261b15;--rim:#0d0806;--glaze:#6b4a34;
  --broth:#f0eadf;--broth-deep:#e2d8c8;--ink:#231912;--ink-soft:#5a4a3d;
  --on-onggi:#ece3d6;--on-onggi-soft:#bba892;--seal:#c23b22;--on-seal:#fbefe6;
  --rule:rgba(236,227,214,.14);
  --brush:"Ma Shan Zheng",serif;--batang:"Gowun Batang",serif;
  --sans:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;--s8:72px;--s9:112px;
  --ease:cubic-bezier(.16,1,.3,1);
  color-scheme:dark;
}
*{box-sizing:border-box}
html{scrollbar-color:var(--glaze) var(--onggi)}
body{margin:0;background:var(--onggi) ${glaze};color:var(--on-onggi);font:17px/1.7 var(--sans);word-break:keep-all;-webkit-font-smoothing:antialiased}
::selection{background:var(--seal);color:var(--on-seal)}
a{color:inherit;text-underline-offset:.22em;text-decoration-thickness:1px}
:focus-visible{outline:2px solid var(--broth);outline-offset:3px;border-radius:4px}
.wrap{max-width:1120px;margin:0 auto;padding:0 var(--s4)}

/* 첫 화면: 위에서 내려다본 뚝배기 한 그릇 */
.hero{display:grid;gap:var(--s6);padding:var(--s8) 0 var(--s8);align-items:center}
.bowl-wrap{position:relative;justify-self:center;width:min(92vw,62vh,560px);aspect-ratio:1}
.bowl{position:absolute;inset:0;border-radius:50%;background:var(--rim);
  box-shadow:0 18px 40px rgba(0,0,0,.55),0 2px 0 rgba(255,255,255,.04) inset;
  display:grid;place-items:center}
.bowl::before{content:"";position:absolute;inset:3.2%;border-radius:50%;border:1px solid var(--glaze);opacity:.7}
.broth{position:relative;width:86%;aspect-ratio:1;border-radius:50%;
  background:radial-gradient(circle at 42% 38%,#f8f4ec 0%,var(--broth) 45%,var(--broth-deep) 100%);
  box-shadow:inset 0 10px 28px rgba(0,0,0,.24);
  color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:12%}
.hanja{font-family:var(--brush);font-size:clamp(64px,19vw,128px);line-height:1;margin:0;letter-spacing:.02em;color:#120c08}
h1{font-family:var(--batang);font-weight:700;font-size:clamp(20px,5.2vw,26px);margin:var(--s3) 0 0;letter-spacing:.24em;padding-left:.24em}
.kind{margin:var(--s1) 0 0;font-size:15px;color:var(--ink-soft)}
.status{margin:var(--s4) 0 0;font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:var(--s2);color:var(--ink)}
.status::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ink-soft)}
.status[data-open="1"]::before{background:#2f7d4a;box-shadow:0 0 0 3px rgba(47,125,74,.18)}
.seal{position:absolute;right:4%;bottom:7%;width:clamp(52px,14vw,74px);aspect-ratio:1;background:var(--seal);color:var(--on-seal);
  border-radius:6px;transform:rotate(-6deg);display:grid;place-items:center;font-family:var(--batang);font-weight:700;
  font-size:clamp(13px,3.4vw,17px);line-height:1.05;writing-mode:vertical-rl;letter-spacing:.06em;box-shadow:0 6px 14px rgba(0,0,0,.35)}
.steam{position:absolute;left:50%;top:-14%;width:34%;transform:translateX(-50%);overflow:visible;pointer-events:none}
.steam path{fill:none;stroke:var(--broth);stroke-width:2.2;stroke-linecap:round;stroke-dasharray:160;stroke-dashoffset:160;opacity:0;
  animation:steam 2.8s var(--ease) .4s forwards}
.steam path:nth-child(2){animation-delay:.75s}.steam path:nth-child(3){animation-delay:1.1s}
@keyframes steam{0%{stroke-dashoffset:160;opacity:0}35%{opacity:.75}100%{stroke-dashoffset:0;opacity:.28}}
@media (prefers-reduced-motion:reduce){.steam path{animation:none;stroke-dashoffset:0;opacity:.28}}

.go{display:grid;gap:var(--s4);justify-items:center;text-align:center}
.tagline{font-family:var(--batang);font-size:clamp(22px,5.6vw,34px);line-height:1.35;margin:0;max-width:16em;text-wrap:balance}
.addr{margin:0;color:var(--on-onggi-soft);font-size:16px}
.maps{display:grid;gap:var(--s2);width:100%;max-width:420px}
.btn{display:flex;align-items:center;justify-content:center;gap:var(--s2);min-height:52px;padding:0 var(--s5);border-radius:999px;
  font-weight:700;font-size:16px;text-decoration:none;border:1.5px solid var(--broth);color:var(--on-onggi);
  transition:background .25s var(--ease),color .25s var(--ease),transform .25s var(--ease)}
.btn:hover{background:rgba(240,234,223,.08)}
.btn:active{transform:scale(.98)}
.btn.primary{background:var(--broth);color:var(--ink)}
.btn.primary:hover{background:#fff}
.maps .pair{display:grid;grid-template-columns:1fr 1fr;gap:var(--s2)}
.call{font-weight:700;font-size:18px;font-variant-numeric:tabular-nums;text-decoration:none;border-bottom:1px solid var(--glaze);padding-bottom:2px}
.ico{width:16px;height:16px;flex:none}

@media (min-width:900px){
  .hero{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);min-height:88vh;padding:var(--s8) 0}
  .bowl-wrap{justify-self:start;width:min(46vw,76vh,620px)}
  .hanja{font-size:clamp(96px,9vw,140px)}
  .go{justify-items:start;text-align:left;padding-left:var(--s5)}
  .tagline{font-size:clamp(30px,3vw,40px)}
}

/* 그릇 줄: 흰 상 위에 놓인 대표 그릇들 */
.dishes{list-style:none;margin:0 calc(var(--s4) * -1) var(--s7);padding:0 var(--s4) var(--s2);display:grid;grid-auto-flow:column;grid-auto-columns:68%;gap:var(--s3);overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.dishes::-webkit-scrollbar{display:none}
.dishes li{scroll-snap-align:start}
.dishes img{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:cover;border-radius:10px;background:var(--broth)}
.dishes p{margin:var(--s3) 0 0;display:flex;justify-content:space-between;gap:var(--s3);font-weight:600}
.dishes span{font-variant-numeric:tabular-nums;color:var(--on-onggi-soft);font-weight:500}
@media (min-width:900px){.dishes{grid-auto-flow:row;grid-template-columns:repeat(5,1fr);margin:0 0 var(--s7);padding:0;overflow:visible}}
.story{display:block;width:100%;height:auto;border-radius:10px;margin:var(--s6) 0 0}

/* 본문 */
section{padding:var(--s8) 0 0}
h2{font-family:var(--batang);font-weight:700;font-size:clamp(26px,6vw,34px);margin:0 0 var(--s5);letter-spacing:.04em}
h3{font-family:var(--batang);font-weight:400;font-size:18px;color:var(--on-onggi-soft);margin:var(--s7) 0 var(--s2)}
.cols{display:grid;gap:var(--s7)}
@media (min-width:900px){.cols{grid-template-columns:1fr 1fr;gap:var(--s8)}}

.menu{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}
.menu li{display:grid;grid-template-columns:1fr auto;column-gap:var(--s4);align-items:baseline;min-height:60px;padding:var(--s3) 0;border-bottom:1px solid var(--rule)}
.menu .n{font-size:17px;font-weight:600}
.menu .p{font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:.01em}
.menu .d{grid-column:1/-1;font-size:14px;color:var(--on-onggi-soft);line-height:1.55;margin-top:2px}
.menu .sig{display:inline-block;margin-left:var(--s2);padding:1px 6px;border-radius:3px;background:var(--seal);color:var(--on-seal);font-size:12px;font-weight:700;vertical-align:2px}

.week{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(7,1fr);border:1px solid var(--rule);border-radius:10px;overflow:hidden}
.week li{padding:var(--s3) var(--s1);text-align:center;font-size:13px;line-height:1.45;font-variant-numeric:tabular-nums;border-left:1px solid var(--rule);color:var(--on-onggi-soft)}
.week li:first-child{border-left:0}
.week b{display:block;font-family:var(--batang);font-size:17px;color:var(--on-onggi);margin-bottom:var(--s1)}
.week li.off{color:#ec7a62}
.week li.today{background:var(--broth);color:var(--ink-soft)}
.week li.today b{color:var(--ink)}
.note{margin:var(--s4) 0 0;color:var(--on-onggi-soft);font-size:15px}

.way{margin:0;display:grid;gap:var(--s4)}
.way div{display:grid;gap:2px}
.way dt{font-size:13px;color:var(--on-onggi-soft);letter-spacing:.06em}
.way dd{margin:0}

.about{font-family:var(--batang);font-size:clamp(19px,4.6vw,23px);line-height:1.8;max-width:34em;margin:0}
.feats{margin:var(--s5) 0 0;color:var(--on-onggi-soft);font-size:15px;line-height:2}

details{border-bottom:1px solid var(--rule)}
details:first-of-type{border-top:1px solid var(--rule)}
summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:var(--s4);padding:var(--s4) 0;font-weight:600;cursor:pointer}
summary::-webkit-details-marker{display:none}
summary .ico{transition:transform .3s var(--ease);color:var(--on-onggi-soft)}
details[open] summary .ico{transform:rotate(45deg)}
details p{margin:0 0 var(--s4);color:var(--on-onggi-soft);max-width:60ch}

footer{margin-top:var(--s9);padding:var(--s7) 0 var(--s8);border-top:1px solid var(--rule);display:grid;gap:var(--s3)}
footer .hanja{color:var(--on-onggi);font-size:56px}
footer p{margin:0;color:var(--on-onggi-soft);font-size:15px}
footer a{color:var(--on-onggi)}
</style>
</head>
<body>
<main class="wrap">

<header class="hero">
<div class="bowl-wrap">
<svg class="steam" viewBox="0 0 120 80" aria-hidden="true">
<path d="M40 78c-8-12 8-20 0-34s6-22 2-40"/><path d="M62 78c-9-14 9-22 1-37s5-20 1-38"/><path d="M84 78c-8-12 7-19 0-32s5-21 2-38"/>
</svg>
<div class="bowl">
<div class="broth">
<p class="hanja" lang="zh-Hant" aria-hidden="true">${esc(hanja)}</p>
<h1>${esc(r.name)}</h1>
<p class="kind">${esc(r.servesCuisine.slice(1, 3).join("·"))} 전문점</p>
<p class="status" id="status">${esc(hoursText.join(' / '))}</p>
</div>
</div>
<div class="seal" aria-hidden="true">${esc(r.name)}</div>
</div>

<div class="go">
<p class="tagline">${esc(r.tagline)}</p>
<p class="addr">${esc(r.area)} · ${esc(fullAddr)}</p>
<div class="maps">
<a class="btn primary" href="${esc(mapLinks[0][1])}" rel="noopener">${mapLinks[0][0]}로 길찾기</a>
<div class="pair">${mapLinks.slice(1).map(([t, u]) => `<a class="btn" href="${esc(u)}" rel="noopener">${t}</a>`).join('')}</div>
</div>
<a class="call" href="${esc(telHref)}">${esc(r.phone)}</a>
</div>
</header>

<section id="menu" aria-labelledby="h-menu">
<h2 id="h-menu">메뉴</h2>
${dishes.length ? `<ul class="dishes">${dishes.map(i => `<li><img src="${esc(i.photo)}" alt="${esc(i.name)} 사진" width="640" height="640" loading="lazy" decoding="async"><p>${esc(i.name)}<span>${won(i.price)}</span></p></li>`).join('')}</ul>` : ''}
<div class="cols">
${[0, 1].map(col => `<div>${r.menu.filter((_, i) => (i % 2) === col).map((s, k) => `<h3${k === 0 ? ' style="margin-top:0"' : ''}>${esc(s.section)}</h3>
<ul class="menu">${s.items.map(i => `<li><span class="n">${esc(i.name)}${i.signature ? '<span class="sig">대표</span>' : ''}</span><span class="p">${won(i.price)}</span>${i.description ? `<span class="d">${esc(i.description)}</span>` : ''}</li>`).join('')}</ul>`).join('\n')}</div>`).join('\n')}
</div>
</section>

<section id="hours" aria-labelledby="h-hours">
<div class="cols">
<div>
<h2 id="h-hours">영업시간</h2>
<ol class="week">${ORDER.map(d => `<li data-day="${d}"${byDay[d].length ? '' : ' class="off"'}><b>${DAY[d][1]}</b>${byDay[d].length ? byDay[d].map(([o, c]) => `${o}<br>~${c}`).join('<br>') : '휴무'}</li>`).join('')}</ol>
<p class="note">${esc(r.hoursNote)}</p>
</div>
<div>
<h2>찾아오는 길</h2>
<dl class="way">
<div><dt>주소</dt><dd>${esc(fullAddr)}</dd></div>
<div><dt>교통</dt><dd>${esc(r.directions)}</dd></div>
<div><dt>전화</dt><dd><a href="${esc(telHref)}">${esc(r.phone)}</a></dd></div>
</dl>
</div>
</div>
</section>

<section id="about" aria-labelledby="h-about">
<h2 id="h-about">가게 이야기</h2>
<p class="about">${esc(r.description)}</p>
${r.site.storyImage ? `<img class="story" src="${esc(r.site.storyImage)}" alt="${esc(r.name)} 상차림" width="1280" height="1195" loading="lazy" decoding="async">` : ''}
<p class="feats">${r.features.map(esc).join(' · ')}</p>
</section>

<section id="faq" aria-labelledby="h-faq">
<h2 id="h-faq">자주 묻는 질문</h2>
${r.faq.map(f => `<details><summary>${esc(f.q)}${plus}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
</section>

<footer>
<p class="hanja" lang="zh-Hant" aria-hidden="true">${esc(hanja)}</p>
<p>${esc(r.name)}${r.nameEn ? ' · ' + esc(r.nameEn) : ''} · ${esc(fullAddr)} · <a href="${esc(telHref)}">${esc(r.phone)}</a></p>
<p>${[...mapLinks, ...(r.links.instagram ? [['인스타그램', r.links.instagram]] : [])].map(([t, u]) => `<a href="${esc(u)}" rel="noopener">${t}</a>`).join(' · ')}</p>
</footer>
</main>

<script>
// 지금 영업 상태 (서울 시간 기준)
(() => {
  const H = ${JSON.stringify(byDay)}, ORDER = ${JSON.stringify(ORDER)}, KO = ${JSON.stringify(ORDER.map(d => DAY[d][1]))}, LAST = ${JSON.stringify(r.lastOrder || '')};
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const di = ORDER.indexOf(parts.weekday.slice(0, 2)), now = parts.hour + ':' + parts.minute;
  document.querySelector('.week [data-day="' + ORDER[di] + '"]')?.classList.add('today');
  const el = document.getElementById('status'), today = H[ORDER[di]] || [];
  const next = () => { for (let k = 1; k <= 7; k++) { const d = ORDER[(di + k) % 7]; if (H[d].length) return (k === 1 ? '내일' : KO[(di + k) % 7] + '요일') + ' ' + H[d][0][0]; } return ''; };
  let t;
  const cur = today.find(([o, c]) => now >= o && now < c);
  if (cur) { t = '지금 영업 중' + (LAST && now < LAST ? ' · 라스트오더 ' + LAST : ''); el.dataset.open = '1'; }
  else if (!today.length) t = '오늘 휴무 · ' + next() + ' 열어요';
  else if (now < today[0][0]) t = '영업 전 · ' + today[0][0] + ' 열어요';
  else { const later = today.find(([o]) => now < o); t = later ? '브레이크타임 · ' + later[0] + ' 다시 열어요' : '오늘 영업 끝 · ' + next() + ' 열어요'; }
  el.textContent = t;
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
