// 홈페이지 품질 자동 점검
// 사용: npm run check              site/를 띄워 휴대폰·컴퓨터 화면으로 점검 + 기준 화면과 비교
//       npm run check:update       지금 화면을 새 기준으로 저장 (디자인을 일부러 바꾼 뒤)
//       node scripts/check.mjs --no-visual   화면 비교 없이 점검만 (GitHub Actions용)
// 문제(✗)가 하나라도 있으면 종료 코드 1 → 배포가 멈춤. 주의(!)는 알리기만 함.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { launch, VIEWPORTS } from './lib/browser.mjs';

const UPDATE = process.argv.includes('--update');
const VISUAL = !process.argv.includes('--no-visual');
const SITE = 'site', OUT = 'check-out', BASE = 'checks/baseline';
// 화면 비교를 늘 같은 조건으로: 월요일 낮 12시(한국 시간) 고정
const FIXED_TIME = new Date('2026-11-16T03:00:00Z');
const r = JSON.parse(readFileSync('restaurant.json', 'utf8'));

const fails = [], warns = [], oks = [];
const fail = m => fails.push(m), warn = m => warns.push(m), ok = m => oks.push(m);

// ── 1. 파일 점검 (브라우저 없이) ──
if (!existsSync(join(SITE, 'index.html'))) { console.error('site/index.html이 없습니다. 먼저 node build.mjs'); process.exit(1); }
for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'data/restaurant.json']) existsSync(join(SITE, f)) ? ok(`${f} 있음`) : fail(`${f} 없음`);
const robots = readFileSync(join(SITE, 'robots.txt'), 'utf8');
/Disallow:\s*\/\s*$/m.test(robots) ? fail('robots.txt가 사이트 전체를 막고 있음') : ok('robots.txt 검색 허용');
/Sitemap:\s*https?:\/\//.test(robots) ? ok('robots.txt에 사이트맵 주소') : warn('robots.txt에 Sitemap 줄이 없음');
for (const f of ['images']) {
  // 사진이 너무 크면 휴대폰에서 느림
  const dir = join(SITE, f);
  for (const name of (await import('node:fs')).readdirSync(dir)) {
    const kb = statSync(join(dir, name)).size / 1024;
    if (kb > 400) warn(`사진 ${f}/${name} ${Math.round(kb)}KB (400KB 넘음)`);
  }
}

// ── 2. 로컬 서버 ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/])+/, '');
  if (p.includes('..')) { res.writeHead(400).end(); return; }
  let file = join(SITE, p);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

// ── 3. 화면 점검 ──
mkdirSync(OUT, { recursive: true });
const browser = await launch();
for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ ...vp, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  const consoleErrors = [], badRequests = [];
  page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('requestfailed', q => q.url().startsWith(origin) && badRequests.push(`${q.url().replace(origin, '')} (${q.failure()?.errorText})`));
  page.on('response', s => s.url().startsWith(origin) && s.status() >= 400 && badRequests.push(`${s.url().replace(origin, '')} (${s.status()})`));

  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  // 늦게 뜨는 사진(옆으로 넘기는 줄 포함)까지 모두 불러오기
  await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { scrollTo({ top: y, behavior: "instant" }); await new Promise(r => setTimeout(r, 60)); } scrollTo({ top: 0, behavior: "instant" }); });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  const m = await page.evaluate(() => {
    const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const alpha = c => { const p = c.match(/[\d.]+/g); return p.length > 3 ? +p[3] : 1; };
    const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (alpha(c) > .5) return c; } return getComputedStyle(document.body).backgroundColor; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

    const lowContrast = [], tiny = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = getComputedStyle(el), size = parseFloat(s.fontSize), big = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      const cr = ratio(s.color, bgOf(el));
      if (cr < (big ? 3 : 4.5)) lowContrast.push(`"${el.textContent.trim().slice(0, 20)}" ${cr.toFixed(2)}:1`);
      if (size < 12) tiny.push(`"${el.textContent.trim().slice(0, 20)}" ${size}px`);
    }
    const smallTargets = [...document.querySelectorAll('a[href], button, summary')].filter(vis).filter(a => {
      const b = a.getBoundingClientRect(); const inline = getComputedStyle(a).display === 'inline' && a.closest('p,li,dd');
      return !inline && (b.height < 44 || b.width < 44);
    }).map(a => `"${a.textContent.trim().slice(0, 16)}" ${Math.round(a.getBoundingClientRect().width)}×${Math.round(a.getBoundingClientRect().height)}`);
    const brokenImgs = [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src'));
    const noAlt = [...document.images].filter(i => !i.hasAttribute('alt')).map(i => i.getAttribute('src'));
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => { try { return [JSON.parse(s.textContent)].flat().flatMap(x => x['@graph'] || [x]); } catch { return [null]; } });
    return {
      overflow: document.documentElement.scrollWidth - innerWidth, innerWidth,
      h1: document.querySelectorAll('h1').length,
      title: document.title, desc: document.querySelector('meta[name=description]')?.content || '',
      canonical: document.querySelector('link[rel=canonical]')?.href || '', ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
      lang: document.documentElement.lang, lowContrast, tiny, smallTargets, brokenImgs, noAlt, ld,
      bodyText: document.body.innerText,
    };
  });

  const tag = vpName === 'mobile' ? '휴대폰' : '컴퓨터';
  m.overflow > 1 ? fail(`${tag}: 화면이 옆으로 ${m.overflow}px 넘침`) : ok(`${tag}: 가로 넘침 없음`);
  // 내용이 넓으면 휴대폰 브라우저가 페이지 전체를 축소해 버림 (넘침 검사에 안 잡힘)
  m.innerWidth !== vp.viewport.width ? fail(`${tag}: 페이지가 ${m.innerWidth}px 폭으로 축소됨 (화면 ${vp.viewport.width}px보다 넓은 요소가 있음)`) : ok(`${tag}: 축소 없음`);
  consoleErrors.length ? fail(`${tag}: 스크립트 오류 ${consoleErrors.length}건 — ${consoleErrors[0].slice(0, 120)}`) : ok(`${tag}: 스크립트 오류 없음`);
  badRequests.length ? fail(`${tag}: 불러오지 못한 파일 ${badRequests.join(', ')}`) : ok(`${tag}: 모든 파일 불러옴`);
  m.brokenImgs.length ? fail(`${tag}: 깨진 사진 ${m.brokenImgs.join(', ')}`) : ok(`${tag}: 깨진 사진 없음`);
  if (m.lowContrast.length) warn(`${tag}: 글자 대비 부족 ${m.lowContrast.length}곳 — ${m.lowContrast.slice(0, 3).join(' / ')}`);
  if (m.tiny.length) warn(`${tag}: 12px보다 작은 글자 ${m.tiny.length}곳 — ${m.tiny.slice(0, 3).join(' / ')}`);
  if (vpName === 'mobile') m.smallTargets.length ? warn(`휴대폰: 누르기 작은 버튼·링크 ${m.smallTargets.length}개 (44px 미만) — ${m.smallTargets.slice(0, 4).join(' / ')}`) : ok('휴대폰: 버튼 크기 충분');

  if (vpName === 'desktop') {
    // 검색·AI용 정보
    m.h1 === 1 ? ok('h1 하나') : fail(`h1이 ${m.h1}개 (하나여야 함)`);
    m.lang === 'ko' ? ok('lang="ko"') : warn(`lang="${m.lang}"`);
    m.title.length >= 10 && m.title.length <= 60 ? ok(`제목 ${m.title.length}자`) : warn(`제목 길이 ${m.title.length}자 (10~60자 권장)`);
    m.desc.length >= 50 && m.desc.length <= 160 ? ok(`설명문 ${m.desc.length}자`) : warn(`설명문 길이 ${m.desc.length}자 (50~160자 권장)`);
    m.canonical ? ok('canonical 있음') : fail('canonical 없음');
    m.ogImage ? ok('og:image 있음') : warn('og:image 없음 (카톡·SNS 공유 미리보기 사진)');
    m.noAlt.length ? fail(`alt 없는 사진 ${m.noAlt.join(', ')}`) : ok('모든 사진에 alt');
    if (m.ld.includes(null)) fail('JSON-LD가 깨짐');
    const rest = m.ld.find(x => x && [x['@type']].flat().includes('Restaurant'));
    if (!rest) fail('Restaurant 구조화 데이터 없음');
    else {
      const need = { name: rest.name, address: rest.address?.streetAddress, telephone: rest.telephone, geo: rest.geo?.latitude, openingHoursSpecification: rest.openingHoursSpecification?.length, servesCuisine: rest.servesCuisine, hasMenu: rest.hasMenu, image: rest.image, priceRange: rest.priceRange };
      const missing = Object.entries(need).filter(([, v]) => !v || (Array.isArray(v) && !v.length)).map(([k]) => k);
      missing.length ? warn(`Restaurant 정보 빠짐: ${missing.join(', ')}`) : ok('Restaurant 구조화 데이터 필수 항목 다 있음');
      rest.telephone && rest.telephone.replace(/\D/g, '') !== r.phone.replace(/\D/g, '') && fail(`JSON-LD 전화번호(${rest.telephone})가 restaurant.json(${r.phone})과 다름`);
    }
    m.ld.some(x => x && [x['@type']].flat().includes('FAQPage')) ? ok('FAQ 구조화 데이터') : warn('FAQPage 구조화 데이터 없음');
    // 화면 글과 restaurant.json이 맞는지 (가격·전화)
    const text = m.bodyText.replace(/\s+/g, ' ');
    if (!text.includes(r.phone)) fail(`화면에 전화번호 ${r.phone}가 없음`);
    const missingPrice = r.menu.flatMap(s => s.items).filter(i => i.price && !text.includes(i.price.toLocaleString('ko-KR'))).map(i => i.name);
    missingPrice.length ? fail(`화면에 가격이 안 보이는 메뉴: ${missingPrice.join(', ')}`) : ok('메뉴 가격 모두 화면에 있음');
  }

  // ── 4. 화면 비교 ──
  if (VISUAL) {
    // 매주 바뀌는 리뷰 영역은 가리고 비교
    const mask = [page.locator('#reviews')];
    for (const [shot, full] of [['first', false], ['full', true]]) {
      const name = `${vpName}-${shot}.png`, cur = join(OUT, name), base = join(BASE, name);
      await page.screenshot({ path: cur, fullPage: full, mask, animations: 'disabled' });
      if (UPDATE || !existsSync(base)) { mkdirSync(BASE, { recursive: true }); writeFileSync(base, readFileSync(cur)); ok(`${tag} ${shot === 'first' ? '첫 화면' : '전체'}: 기준 저장`); continue; }
      const diff = await compare(page, readFileSync(base), readFileSync(cur), join(OUT, `${vpName}-${shot}-diff.png`));
      const label = `${tag} ${shot === 'first' ? '첫 화면' : '전체'}`;
      if (diff.sizeChanged) warn(`${label}: 길이가 바뀜 (${diff.sizeChanged}) — ${OUT}/${vpName}-${shot}-diff.png 확인`);
      else if (diff.share > 0.005) warn(`${label}: 기준과 ${(diff.share * 100).toFixed(1)}% 다름 — ${OUT}/${vpName}-${shot}-diff.png 확인`);
      else ok(`${label}: 기준과 같음`);
    }
  }
  await ctx.close();
}
await browser.close();
server.close();

// 브라우저 캔버스로 두 PNG를 비교 (추가 라이브러리 없이)
async function compare(page, a, b, diffPath) {
  const res = await page.evaluate(async ([a, b]) => {
    const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const px = img => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const pa = px(ia), pb = px(ib), out = new OffscreenCanvas(w, h), ox = out.getContext('2d'), od = ox.createImageData(w, h);
    let changed = 0;
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
      if (d > 40) { changed++; od.data.set([255, 0, 60, 255], i); } else { const g = (pb[i] + pb[i + 1] + pb[i + 2]) / 3 * .35; od.data.set([g, g, g, 255], i); }
    }
    ox.putImageData(od, 0, 0);
    const blob = await out.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { share: changed / (w * h), sizeChanged: ia.height !== ib.height ? `${ia.height}px → ${ib.height}px` : '', png: btoa(s) };
  }, [a.toString('base64'), b.toString('base64')]);
  writeFileSync(diffPath, Buffer.from(res.png, 'base64'));
  return res;
}

// ── 결과 ──
console.log(`\n홈페이지 점검: 통과 ${oks.length} · 주의 ${warns.length} · 문제 ${fails.length}\n`);
for (const m of fails) console.log('✗ ' + m);
for (const m of warns) console.log('! ' + m);
if (process.argv.includes('--verbose')) for (const m of oks) console.log('✓ ' + m);
process.exit(fails.length ? 1 : 0);
