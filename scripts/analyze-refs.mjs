// 레퍼런스 식당 사이트 구조 분석
// 사용: npm run refs            (refs.json의 사이트 전부 + 강설옥)
//       npm run refs -- cote    (이름에 cote가 들어간 것만)
// 결과: refs-out/report.md, refs-out/report.json, refs-out/<이름>-mobile.jpg / -desktop.jpg
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { launch, VIEWPORTS } from './lib/browser.mjs';

const refs = JSON.parse(readFileSync('scripts/refs.json', 'utf8'));
const filter = process.argv[2];
const list = filter ? refs.filter(r => r.name.toLowerCase().includes(filter.toLowerCase())) : refs;
mkdirSync('refs-out', { recursive: true });

// 페이지 안에서 실행: 화면 구성·글꼴·제목 구조·검색용 데이터 측정
function inspect() {
  const vw = innerWidth, vh = innerHeight;
  const vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0 && r.width > 0 && r.height > 0; };
  const inFold = r => r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
  const area = r => Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));

  // 첫 화면에서 사진·영상이 차지하는 비율 (가장 큰 것 기준)
  const media = [...document.querySelectorAll('img,video,picture,canvas,[style*="background-image"]')].filter(vis);
  const bgEls = [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).backgroundImage.includes('url(') && vis(e));
  const foldMedia = [...new Set([...media, ...bgEls])].map(e => area(e.getBoundingClientRect())).filter(a => a > 0);
  const biggestMedia = foldMedia.length ? Math.max(...foldMedia) / (vw * vh) : 0;

  // 첫 화면 글자 수
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let foldText = 0, n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (!t || !n.parentElement || !vis(n.parentElement)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    if (inFold(range.getBoundingClientRect())) foldText += t.length;
  }

  const font = el => el ? { family: getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: parseFloat(getComputedStyle(el).fontSize), weight: getComputedStyle(el).fontWeight } : null;
  const firstHeading = [...document.querySelectorAll('h1,h2')].find(vis);
  const bodyP = [...document.querySelectorAll('p,li')].find(e => vis(e) && e.textContent.trim().length > 30);

  // 배경색 (넓게 칠해진 순)
  const bgs = {};
  for (const e of [document.body, ...document.querySelectorAll('body *')]) {
    const c = getComputedStyle(e).backgroundColor; if (!c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || !vis(e)) continue;
    const r = e.getBoundingClientRect(); bgs[c] = (bgs[c] || 0) + r.width * Math.min(r.height, 5000);
  }
  const palette = Object.entries(bgs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);

  const links = [...document.querySelectorAll('a[href]')].filter(vis);
  const navLinks = [...document.querySelectorAll('header a[href], nav a[href]')].filter(vis).map(a => a.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const cta = re => links.some(a => re.test(a.href + ' ' + a.textContent) && inFold(a.getBoundingClientRect()));

  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => {
    try { const j = JSON.parse(s.textContent); return [j].flat().flatMap(x => x['@graph'] || [x]).map(x => [x['@type']].flat().join('/')); } catch { return ['(깨짐)']; }
  });

  return {
    title: document.title,
    lang: document.documentElement.lang || '',
    description: document.querySelector('meta[name="description"]')?.content || '',
    ogImage: !!document.querySelector('meta[property="og:image"]'),
    jsonLd: ld,
    screens: +(document.documentElement.scrollHeight / vh).toFixed(1),
    sections: document.querySelectorAll('section, main > div, article').length,
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).slice(0, 14).map(h => h.tagName + ' ' + h.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)),
    h1Count: document.querySelectorAll('h1').length,
    nav: [...new Set(navLinks)].slice(0, 12),
    images: document.querySelectorAll('img').length,
    imagesNoAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length,
    video: document.querySelectorAll('video').length > 0,
    fold: {
      mediaShare: +biggestMedia.toFixed(2),
      textChars: foldText,
      callVisible: cta(/^tel:|전화|call/i),
      mapVisible: cta(/map|지도|길찾기|directions|location|오시는/i),
      reserveVisible: cta(/reserv|예약|resy|opentable|tock|catchtable|캐치테이블|booking/i),
    },
    headingFont: font(firstHeading),
    bodyFont: font(bodyP),
    palette,
  };
}

const browser = await launch();
const results = [];
for (const ref of list) {
  const row = { name: ref.name, url: ref.url, note: ref.note };
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ ...vp, locale: 'ko-KR' });
    const page = await ctx.newPage();
    let bytes = 0, requests = 0;
    page.on('response', async res => { requests++; const l = +(res.headers()['content-length'] || 0); bytes += l; });
    const t0 = Date.now();
    try {
      await page.goto(ref.url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(2500); // 첫 화면 애니메이션·지연 로딩 대기
      const loadMs = Date.now() - t0;
      await page.screenshot({ path: `refs-out/${ref.name}-${vpName}.jpg`, type: 'jpeg', quality: 70 });
      row[vpName] = { ...(await page.evaluate(inspect)), loadMs, requests, kb: Math.round(bytes / 1024) };
      console.log(`✓ ${ref.name} ${vpName}`);
    } catch (e) {
      row[vpName] = { error: String(e.message).split('\n')[0] };
      console.log(`✗ ${ref.name} ${vpName}: ${row[vpName].error}`);
    }
    await ctx.close();
  }
  results.push(row);
}
await browser.close();
writeFileSync('refs-out/report.json', JSON.stringify(results, null, 2));

// 사람이 읽는 표
const pct = v => v == null ? '-' : Math.round(v * 100) + '%';
const yn = v => v ? '○' : '·';
const lines = [
  '# 레퍼런스 사이트 구조 분석', '', `${new Date().toISOString().slice(0, 10)} 측정. 첫 화면 = 스크롤 없이 보이는 부분.`, '',
  '## 휴대폰 첫 화면', '',
  '| 사이트 | 사진 비중 | 글자 수 | 전화 | 지도 | 예약 | 페이지 길이(화면) | 제목 글꼴 | 본문 글꼴 |',
  '|---|---|---|---|---|---|---|---|---|',
  ...results.map(r => { const m = r.mobile || {}; return m.error ? `| ${r.name} | 오류: ${m.error} |||||||| ` :
    `| ${r.name} | ${pct(m.fold.mediaShare)} | ${m.fold.textChars} | ${yn(m.fold.callVisible)} | ${yn(m.fold.mapVisible)} | ${yn(m.fold.reserveVisible)} | ${m.screens} | ${m.headingFont ? `${m.headingFont.family} ${m.headingFont.size}px` : '-'} | ${m.bodyFont ? `${m.bodyFont.family} ${m.bodyFont.size}px` : '-'} |`; }),
  '', '## 컴퓨터 첫 화면', '',
  '| 사이트 | 사진 비중 | 글자 수 | 메뉴(내비) | 영상 | 요청 수 | 전송량(KB) | 로딩(ms) |',
  '|---|---|---|---|---|---|---|---|',
  ...results.map(r => { const d = r.desktop || {}; return d.error ? `| ${r.name} | 오류 ||||||| ` :
    `| ${r.name} | ${pct(d.fold.mediaShare)} | ${d.fold.textChars} | ${d.nav.join(' · ').slice(0, 70) || '-'} | ${yn(d.video)} | ${d.requests} | ${d.kb} | ${d.loadMs} |`; }),
  '', '## 검색·AI용 정보', '',
  '| 사이트 | 언어 | 설명문 | og:image | 구조화 데이터(JSON-LD) | h1 개수 | alt 없는 사진 |',
  '|---|---|---|---|---|---|---|',
  ...results.map(r => { const d = r.desktop || {}; return d.error ? `| ${r.name} | 오류 |||||| ` :
    `| ${r.name} | ${d.lang || '-'} | ${d.description ? '○' : '·'} | ${yn(d.ogImage)} | ${d.jsonLd.join(', ') || '없음'} | ${d.h1Count} | ${d.imagesNoAlt}/${d.images} |`; }),
  '', '## 제목 구조', '',
  ...results.flatMap(r => [`### ${r.name}`, r.note ? `_${r.note}_` : '', '', ...((r.desktop?.headings) || ['(없음)']).map(h => `- ${h}`), '']),
];
writeFileSync('refs-out/report.md', lines.join('\n'));
console.log('\nrefs-out/report.md 저장');
