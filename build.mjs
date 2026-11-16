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
    award: r.awards?.length ? r.awards.map(a => a.title) : undefined,
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
const dayRange = ds => ds.length > 2 && ds.every((d, i) => i === 0 || ORDER.indexOf(d) === ORDER.indexOf(ds[i - 1]) + 1)
  ? `${DAY[ds[0]][1]}–${DAY[ds.at(-1)][1]}` : ds.map(d => DAY[d][1]).join('·');
const schedule = Object.values(ORDER.reduce((m, d) => {
  const k = JSON.stringify(byDay[d]); (m[k] ||= { days: [], times: byDay[d] }).days.push(d); return m;
}, {})).map(g => ({ days: g.days, label: dayRange(g.days), text: g.times.length ? g.times.map(([o, c]) => `${o}–${c}`).join(' · ') : '휴무', off: !g.times.length }));
const hanja = r.nameHanja || r.name;
const dishes = r.menu.flatMap(s => s.items).filter(i => i.photo);
const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const reviews = readJson('data/reviews.json');
const blog = readJson('data/blog.json');
const kwMax = Math.max(1, ...(reviews?.keywords || []).map(k => k.count));
const telHref = 'tel:' + r.phone.replace(/[^0-9+]/g, '');
// 24절기 (양력 기준 대략 날짜, 하루 정도 어긋날 수 있음)
const TERMS = [[1,5,'소한','小寒'],[1,20,'대한','大寒'],[2,4,'입춘','立春'],[2,19,'우수','雨水'],[3,5,'경칩','驚蟄'],[3,20,'춘분','春分'],[4,5,'청명','淸明'],[4,20,'곡우','穀雨'],[5,5,'입하','立夏'],[5,21,'소만','小滿'],[6,6,'망종','芒種'],[6,21,'하지','夏至'],[7,7,'소서','小暑'],[7,22,'대서','大暑'],[8,7,'입추','立秋'],[8,23,'처서','處暑'],[9,7,'백로','白露'],[9,23,'추분','秋分'],[10,8,'한로','寒露'],[10,23,'상강','霜降'],[11,7,'입동','立冬'],[11,22,'소설','小雪'],[12,7,'대설','大雪'],[12,21,'동지','冬至']];
const termOf = (m, d) => [...TERMS].reverse().find(([tm, td]) => m > tm || (m === tm && d >= td)) || TERMS.at(-1);
const seoulNow = new Date(Date.now() + 9 * 3600e3);
const term = termOf(seoulNow.getUTCMonth() + 1, seoulNow.getUTCDate());
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
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0d0806"/><circle cx="32" cy="32" r="23" fill="#f0eadf"/></svg>')}">
<meta property="og:type" content="restaurant">
<meta property="og:title" content="${esc(r.seo.title)}">
<meta property="og:description" content="${esc(r.seo.description)}">
<meta property="og:url" content="${esc(base)}">
<meta property="og:locale" content="ko_KR">
${r.site.ogImage ? `<meta property="og:image" content="${esc(r.site.ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<link rel="preload" as="image" href="images/bowl.webp" fetchpriority="high">
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
html{scrollbar-color:var(--glaze) var(--onggi);scroll-padding-top:64px}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}

.top{position:sticky;top:0;z-index:20;background:rgba(28,20,15,.92);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-bottom:1px solid var(--rule)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);min-height:52px}
.top .logo{font-family:var(--brush);font-size:26px;line-height:1;text-decoration:none;display:inline-flex;align-items:center;min-height:44px;transition:opacity .3s var(--ease)}
.top.hide-logo .logo{opacity:0;pointer-events:none}
.top ul{list-style:none;margin:0;padding:0;display:flex}
.top ul a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 var(--s2);font-size:15px;font-weight:600;text-decoration:none;color:var(--on-onggi-soft);white-space:nowrap}
.top ul a:hover{color:var(--on-onggi)}
@media (min-width:900px){.top ul a{padding:0 var(--s4);font-size:16px}}
body{margin:0;background:var(--onggi) url(images/grain.jpg) 0 0/320px auto;color:var(--on-onggi);font:17px/1.7 var(--sans);word-break:keep-all;-webkit-font-smoothing:antialiased}
::selection{background:var(--seal);color:var(--on-seal)}
a{color:inherit;text-underline-offset:.22em;text-decoration-thickness:1px}
:focus-visible{outline:2px solid var(--broth);outline-offset:3px;border-radius:4px}
.wrap{max-width:1120px;margin:0 auto;padding:0 var(--s4)}

/* 첫 화면: 매장 설렁탕 한 그릇을 위에서 본 사진 + 세로 붓글씨 상호 */
.hero{display:grid;gap:var(--s6);padding:var(--s7) 0 var(--s8);align-items:center}
.plate{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:var(--s2)}
.hanja{font-family:var(--brush);line-height:1;margin:0}
.plate .hanja{writing-mode:vertical-rl;font-size:clamp(56px,16vw,96px);letter-spacing:.06em;color:var(--on-onggi)}
.bowl{display:block;width:100%;height:auto;filter:drop-shadow(0 22px 30px rgba(0,0,0,.6))}
.season{margin:0;display:flex;align-items:center;gap:var(--s3);font-family:var(--batang);font-size:15px;color:var(--on-onggi-soft);letter-spacing:.08em}
.season::before{content:"";width:28px;height:1px;background:var(--on-onggi-soft)}
.season b{color:var(--on-onggi);font-weight:700}
h1{font-family:var(--batang);font-weight:700;font-size:clamp(28px,7vw,36px);margin:0;letter-spacing:.2em}
.kind{margin:0;font-size:15px;color:var(--on-onggi-soft)}
.status{margin:0;font-size:15px;font-weight:600;display:inline-flex;align-items:center;gap:var(--s2)}
.status::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--on-onggi-soft)}
.status[data-open="1"]::before{background:#57b979;box-shadow:0 0 0 3px rgba(87,185,121,.22)}
.name{display:grid;gap:var(--s2);justify-items:inherit}

.go{display:grid;gap:var(--s4);justify-items:center;text-align:center}
@media (max-width:899px){
  .hero{padding-top:var(--s4);grid-template-columns:minmax(0,1fr)}
  .plate{display:block;position:relative;margin-right:calc(var(--s4) * -1);overflow-x:clip}
  .plate .bowl{width:122vw;max-width:none;margin-left:12vw}
  .plate .hanja{position:absolute;left:0;top:var(--s2);z-index:1;font-size:clamp(52px,15vw,84px);text-shadow:0 2px 12px rgba(0,0,0,.7)}
}
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
.call{display:inline-flex;align-items:center;min-height:44px;font-weight:700;font-size:18px;font-variant-numeric:tabular-nums;text-decoration:underline;text-decoration-color:var(--glaze);text-underline-offset:.3em}
.ico{width:16px;height:16px;flex:none}

@media (min-width:900px){
  .hero{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);min-height:88vh;padding:var(--s8) 0}
  .plate{width:min(100%,82vh,640px)}
  .plate .hanja{font-size:clamp(88px,8vw,120px)}
  .go{justify-items:start;text-align:left;padding-left:var(--s5)}
  .tagline{font-size:clamp(30px,3vw,40px)}
}

/* 그릇 줄: 흰 상 위에 놓인 대표 그릇들 */
.dishes{list-style:none;margin:0 calc(var(--s4) * -1) var(--s7);padding:0 var(--s4) var(--s2);display:grid;grid-auto-flow:column;grid-auto-columns:68%;gap:var(--s3);overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.dishes::-webkit-scrollbar{display:none}
.dishes li{scroll-snap-align:start}
.dishes img{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:cover;border-radius:10px;background:var(--broth)}
.dishes p{margin:var(--s3) 0 0;display:flex;flex-direction:column;gap:2px;font-weight:600;line-height:1.4}
.dishes span{font-variant-numeric:tabular-nums;color:var(--on-onggi-soft);font-weight:500}
@media (min-width:900px){.dishes{grid-auto-flow:row;grid-template-columns:repeat(${Math.max(dishes.length,1)},minmax(0,1fr));margin:0 0 var(--s7);padding:0;overflow:visible}}
.story{display:block;width:100%;height:auto;border-radius:10px;margin:var(--s6) 0 0}

/* 수상 */
.award{display:grid;grid-template-columns:104px 1fr;gap:var(--s4);align-items:center;margin:var(--s6) 0 0;padding:var(--s4) 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.award img{width:104px;height:104px;object-fit:cover;border-radius:6px;display:block}
.award figcaption{font-family:var(--batang);font-weight:700;font-size:18px;line-height:1.5}

/* 손님 후기 */
.kw{list-style:none;margin:0 0 var(--s6);padding:0;display:grid;gap:var(--s3)}
.kw li{display:grid;grid-template-columns:8.5em 1fr 2.6em;align-items:center;gap:var(--s3);font-size:16px}
.kw i{display:block;height:10px;border-radius:5px;background:var(--broth)}
.kw b{text-align:right;font-variant-numeric:tabular-nums}
.quotes{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}
.quotes li{padding:var(--s4) 0;border-bottom:1px solid var(--rule)}
.quotes blockquote{margin:0;font-family:var(--batang);font-size:17px;line-height:1.7}
.quotes p{margin:var(--s2) 0 0;font-size:14px;color:var(--on-onggi-soft)}
@media (min-width:900px){.quotes{display:grid;grid-template-columns:1fr 1fr;column-gap:var(--s7)}}
.more{display:inline-flex;align-items:center;min-height:44px;margin-top:var(--s4);font-weight:700;color:var(--on-onggi)}
.blog{list-style:none;margin:0;padding:0}
.blog li{padding:var(--s3) 0;border-bottom:1px solid var(--rule)}
.blog a{font-weight:700}
.blog p{margin:2px 0 0;font-size:14px;color:var(--on-onggi-soft)}
.fine{font-size:14px;color:var(--on-onggi-soft);margin:var(--s3) 0 0}

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

.sched{margin:0;padding:0;display:grid;border-top:1px solid var(--rule)}
.sched div{display:grid;grid-template-columns:4.2em 1fr;gap:var(--s3);align-items:baseline;padding:var(--s3) var(--s3);border-bottom:1px solid var(--rule);font-size:18px}
.sched dt{font-family:var(--batang);font-weight:700}
.sched dd{margin:0;font-variant-numeric:tabular-nums}
.sched .off dd{color:#ec7a62;font-weight:600}
.sched .today{background:var(--broth);color:var(--ink);border-radius:8px;border-bottom-color:transparent}
.sched .today.off dd{color:#b0321c}
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

.dock{position:fixed;left:0;right:0;bottom:0;z-index:10;display:grid;grid-template-columns:1.4fr 1fr;gap:var(--s2);padding:var(--s2) var(--s3) calc(var(--s2) + env(safe-area-inset-bottom));background:rgba(28,20,15,.94);border-top:1px solid var(--rule);transform:translateY(110%);transition:transform .35s var(--ease)}
.dock.on{transform:none}
.dock a{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:999px;font-weight:700;text-decoration:none;border:1.5px solid var(--broth);color:var(--on-onggi)}
.dock a:first-child{background:var(--broth);color:var(--ink)}
@media (min-width:900px){.dock{display:none}}
footer{margin-top:var(--s9);padding:var(--s7) 0 calc(var(--s8) + 72px);border-top:1px solid var(--rule);display:grid;gap:var(--s3)}
footer .hanja{color:var(--on-onggi);font-size:56px}
footer p{margin:0;color:var(--on-onggi-soft);font-size:15px}
footer a{color:var(--on-onggi)}
</style>
</head>
<body>
<nav class="top hide-logo" aria-label="바로가기"><div class="wrap">
<a class="logo" href="#" lang="zh-Hant" aria-label="${esc(r.name)} 맨 위로">${esc(hanja)}</a>
<ul><li><a href="#menu">메뉴</a></li><li><a href="#hours">영업시간</a></li><li><a href="#way">오시는 길</a></li>${reviews ? '<li><a href="#reviews">후기</a></li>' : ''}</ul>
</div></nav>
<main class="wrap">

<header class="hero">
<div class="plate">
<p class="hanja" lang="zh-Hant" aria-hidden="true">${esc(hanja)}</p>
<img class="bowl" src="images/bowl.webp" alt="${esc(r.name)} 설렁탕 한 그릇을 위에서 본 모습" width="939" height="908" fetchpriority="high" decoding="async">
</div>

<div class="go">
<div class="name">
<p class="season" id="season"><span>절기</span><b>${term[2]}</b><span lang="zh-Hant">${term[3]}</span></p>
<h1>${esc(r.name)}</h1>
<p class="kind">${esc(r.servesCuisine.slice(1, 3).join("·"))} 전문점</p>
<p class="status" id="status">${esc(hoursText.join(' / '))}</p>
</div>
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
<dl class="sched">${schedule.map(s => `<div data-days="${s.days.join(' ')}"${s.off ? ' class="off"' : ''}><dt>${esc(s.label)}</dt><dd>${esc(s.text)}</dd></div>`).join('')}</dl>
<p class="note">${r.lastOrder ? `라스트오더 ${esc(r.lastOrder)}` : esc(r.hoursNote)}</p>
</div>
<div id="way">
<h2>찾아오는 길</h2>
<dl class="way">
<div><dt>주소</dt><dd>${esc(fullAddr)}</dd></div>
<div><dt>교통</dt><dd>${esc(r.directions)}</dd></div>
<div><dt>전화</dt><dd><a href="${esc(telHref)}">${esc(r.phone)}</a></dd></div>
</dl>
</div>
</div>
</section>

${reviews ? `<section id="reviews" aria-labelledby="h-rev">
<h2 id="h-rev">손님 후기</h2>
${reviews.keywords?.length ? `<ul class="kw" aria-label="네이버 방문자 리뷰 키워드">${reviews.keywords.map(k => `<li><span>${esc(k.name)}</span><i style="width:${Math.round(k.count / kwMax * 100)}%"></i><b>${k.count}</b></li>`).join('')}</ul>` : ''}
<ul class="quotes">${(reviews.reviews || []).map(q => `<li><blockquote>${esc(q.excerpt)}</blockquote><p>${esc(q.author)} · ${esc(q.visited)} 방문</p></li>`).join('')}</ul>
<a class="more" href="${esc(r.links.naverPlace)}" rel="noopener">네이버 방문자 리뷰${reviews.total ? ` ${reviews.total}개` : ''} 전체 보기</a>
<p class="fine">네이버 플레이스 방문자 리뷰에서 일부만 옮겼습니다 (${esc(reviews.updated)} 기준).</p>
${blog?.posts?.length ? `<h3>블로그 후기</h3><ul class="blog">${blog.posts.slice(0, 6).map(p => `<li><a href="${esc(p.link)}" rel="noopener nofollow">${esc(p.title)}</a><p>${esc(p.blogger)} · ${esc(String(p.date).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3'))}</p></li>`).join('')}</ul>` : ''}
</section>` : ''}

<section id="about" aria-labelledby="h-about">
<h2 id="h-about">가게 이야기</h2>
<p class="about">${esc(r.description)}</p>
${(r.awards || []).map(a => `<figure class="award">${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.title)} 인증서" width="800" height="800" loading="lazy" decoding="async">` : ''}<figcaption>${esc(a.title)}</figcaption></figure>`).join('')}
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
<nav class="dock" aria-label="빠른 길찾기"><a href="${esc(mapLinks[0][1])}" rel="noopener">길찾기</a><a href="${esc(telHref)}">전화</a></nav>
</main>

<script>
// 지금 영업 상태 (서울 시간 기준)
(() => {
  const H = ${JSON.stringify(byDay)}, ORDER = ${JSON.stringify(ORDER)}, KO = ${JSON.stringify(ORDER.map(d => DAY[d][1]))}, LAST = ${JSON.stringify(r.lastOrder || '')};
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const di = ORDER.indexOf(parts.weekday.slice(0, 2)), now = parts.hour + ':' + parts.minute;
  document.querySelector('.sched [data-days~="' + ORDER[di] + '"]')?.classList.add('today');
  // 길찾기 버튼이 화면 위로 지나가면 아래 고정 막대 표시
  // 큰 붓글씨 상호가 화면에서 사라지면 위 막대에 작은 상호 표시
  const top = document.querySelector('.top'), big = document.querySelector('.plate .hanja');
  if (top && big && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => top.classList.toggle('hide-logo', e.isIntersecting)).observe(big);
  else top?.classList.remove('hide-logo');
  const dock = document.querySelector('.dock'), maps = document.querySelector('.maps');
  if (dock && maps && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => dock.classList.toggle('on', e.intersectionRatio < .5), { threshold: [0, .5, 1] }).observe(maps);
  const el = document.getElementById('status'), today = H[ORDER[di]] || [];
  const next = () => { for (let k = 1; k <= 7; k++) { const d = ORDER[(di + k) % 7]; if (H[d].length) return KO[(di + k) % 7] + '요일 ' + H[d][0][0] + ' 영업'; } return ''; };
  let t;
  const cur = today.find(([o, c]) => now >= o && now < c);
  if (cur) { t = '영업 중' + (LAST && now < LAST ? ' · 라스트오더 ' + LAST : ''); el.dataset.open = '1'; }
  else if (!today.length) t = '오늘 휴무 · ' + next();
  else if (now < today[0][0]) t = today[0][0] + ' 영업 시작';
  else { const later = today.find(([o]) => now < o), prev = today.filter(([, c]) => c <= now).at(-1); t = later ? '브레이크타임 ' + prev[1] + '–' + later[0] : '영업 종료 · ' + next(); }
  el.textContent = t;
  const TERMS = ${JSON.stringify(TERMS)}, m = +new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(new Date()), d = +new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', day: 'numeric' }).format(new Date());
  const tm = [...TERMS].reverse().find(([a, b]) => m > a || (m === a && d >= b)) || TERMS.at(-1), se = document.getElementById('season');
  if (se) { se.children[1].textContent = tm[2]; se.children[2].textContent = tm[3]; }
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
${(r.awards || []).map(a => `- 수상: ${a.title}`).join('\n')}

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
