// 인스타그램 게시 (공식 Instagram Graph API · 콘텐츠 게시)
// 사용: node scripts/instagram-post.mjs posts/2026-11-15.json            → 미리보기만 (아무것도 올리지 않음)
//       node scripts/instagram-post.mjs posts/2026-11-15.json --publish  → 실제 게시
//
// 게시 파일 형식 (대시보드 "글 만들기 → 게시 파일 받기"로 생성):
//   { "image": "posts/2026-11-15.jpg", "caption": "..." }
// 이미지는 인스타 서버가 직접 내려받으므로 공개 주소여야 합니다.
//   → public/posts/에 사진을 넣고 푸시해 홈페이지에 먼저 올라간 뒤 실행하세요.
//
// 필요한 값(.env): IG_USER_ID, IG_ACCESS_TOKEN  — 발급 방법은 README "인스타그램 자동 게시" 참고
import { readFileSync } from 'node:fs';

try { process.loadEnvFile('.env'); } catch {}

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('게시 파일 경로를 주세요. 예: node scripts/instagram-post.mjs posts/2026-11-15.json'); process.exit(1); }

const post = JSON.parse(readFileSync(file, 'utf8'));
const r = JSON.parse(readFileSync('restaurant.json', 'utf8'));
const base = r.site.url.endsWith('/') ? r.site.url : r.site.url + '/';
const imageUrl = /^https?:/.test(post.image) ? post.image : base + post.image;

if (post.caption.length > 2200) { console.error(`캡션 ${post.caption.length}자 → 인스타 한도 2,200자 초과`); process.exit(1); }
const tags = (post.caption.match(/#/g) || []).length;
if (tags > 30) { console.error(`해시태그 ${tags}개 → 인스타 한도 30개 초과`); process.exit(1); }

const head = await fetch(imageUrl, { method: 'HEAD' }).catch(() => null);
console.log(`이미지: ${imageUrl} ${head?.ok ? '(접근 가능)' : '(접근 안 됨! 먼저 푸시·배포됐는지 확인)'}`);
console.log(`캡션 ${post.caption.length}자, 해시태그 ${tags}개\n---\n${post.caption}\n---`);

if (flag !== '--publish') { console.log('\n미리보기만 했습니다. 실제로 올리려면 --publish를 붙이세요.'); process.exit(0); }
if (!head?.ok) process.exit(1);

const { IG_USER_ID, IG_ACCESS_TOKEN } = process.env;
if (!IG_USER_ID || !IG_ACCESS_TOKEN) { console.error('.env에 IG_USER_ID, IG_ACCESS_TOKEN이 없습니다.'); process.exit(1); }
// Instagram 로그인 방식이면 graph.instagram.com, Facebook 페이지 연결 방식이면 graph.facebook.com
const API = `https://${process.env.IG_GRAPH_HOST || 'graph.instagram.com'}/${process.env.IG_API_VERSION || 'v23.0'}`;

async function call(path, params, method = 'POST') {
  const q = new URLSearchParams({ ...params, access_token: IG_ACCESS_TOKEN });
  const res = await fetch(method === 'GET' ? `${API}/${path}?${q}` : `${API}/${path}`, method === 'GET' ? {} : { method, body: q });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code})`);
  return j;
}

// 1) 미디어 컨테이너 만들기 → 2) 준비될 때까지 대기 → 3) 게시
const { id: creationId } = await call(`${IG_USER_ID}/media`, { image_url: imageUrl, caption: post.caption });
for (let i = 0; i < 10; i++) {
  const { status_code } = await call(creationId, { fields: 'status_code' }, 'GET');
  if (status_code === 'FINISHED') break;
  if (status_code === 'ERROR') throw new Error('인스타가 이미지를 처리하지 못했습니다 (JPEG, 비율 4:5~1.91:1 확인).');
  await new Promise(s => setTimeout(s, 3000));
}
const { id } = await call(`${IG_USER_ID}/media_publish`, { creation_id: creationId });
console.log(`\n게시 완료: 미디어 ID ${id}`);
