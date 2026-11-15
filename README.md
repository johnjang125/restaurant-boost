# restaurant-boost

식당 하나를 네이버·구글·카카오 지도, 인스타그램, AI 검색(ChatGPT·Perplexity·Gemini)에 더 잘 노출시키기 위한 기본 틀.

`restaurant.json` 한 파일만 고치면 아래가 모두 만들어집니다.

| 만들어지는 것 | 무엇에 좋은가 |
|---|---|
| 홈페이지 `site/index.html` | 네이버·구글 검색 (SEO) |
| 구조화 데이터 (Restaurant·Menu·FAQPage JSON-LD) | 구글 지도·검색 결과, AI 답변 (AEO) |
| `llms.txt`, AI 크롤러 허용 `robots.txt` | AI 검색이 가게 정보를 정확히 인용 (GEO) |
| `sitemap.xml` | 네이버 서치어드바이저·구글 서치콘솔 제출용 |
| 대시보드 `/admin/` | 점검 점수, 플랫폼 할 일, 인스타·블로그 글 초안, AI 노출 기록 |
| `scripts/instagram-post.mjs` | 인스타그램 공식 API로 게시 |

## 가장 쉬운 사용법 (설치 없이)

1. github.com에서 `restaurant.json`을 열고 연필 아이콘으로 가게 정보를 고친 뒤 **Commit changes**.
2. 1~2분 뒤 홈페이지가 자동으로 다시 만들어집니다 (Actions 탭에서 확인).
3. 홈페이지: `https://<계정>.github.io/restaurant-boost/` · 대시보드: 같은 주소 뒤에 `admin/`

## 내 컴퓨터에서 쓰기

Node.js 20 이상이 필요합니다.

```bash
node build.mjs
```

빌드하면 `site/`가 만들어지고, 빠진 정보가 있으면 "점검 필요"로 알려 줍니다.

## 처음 할 일 (순서대로)

1. `restaurant.json`을 실제 가게 정보로 채우기. **상호·주소·전화는 네이버 플레이스와 글자 하나까지 똑같이.**
2. 네이버 서치어드바이저, 구글 서치콘솔에 홈페이지 등록 → 소유 확인 코드를 `site.naverVerification`, `site.googleVerification`에 넣기 → `sitemap.xml` 제출.
3. 대시보드 "플랫폼 할 일" 탭을 위에서부터 체크.
4. 1200×630 대표 사진을 `public/`에 넣고 `site.ogImage`에 주소 넣기.

## 인스타그램 자동 게시

공식 Instagram Graph API(콘텐츠 게시)를 씁니다. 비공식 라이브러리나 자동 좋아요·팔로우·DM은 계정 정지 위험이 있어 넣지 않았습니다.

1. 인스타 계정을 비즈니스(또는 크리에이터) 계정으로 전환.
2. developers.facebook.com에서 앱을 만들고 **Instagram API with Instagram Login** 추가 → 권한 `instagram_business_basic`, `instagram_business_content_publish`.
3. 토큰 발급 후 `.env.example`을 `.env`로 복사해 `IG_USER_ID`, `IG_ACCESS_TOKEN` 채우기. (`.env`는 깃허브에 올라가지 않습니다. 토큰은 60일마다 갱신 필요.)
4. 올릴 사진(JPEG)을 `public/posts/`에 넣고 푸시 → 홈페이지에 올라갈 때까지 대기.
5. 대시보드 "글 만들기"에서 캡션을 만들고 **게시 파일 받기** → `posts/`에 저장 (사진 파일명과 맞추기).
6. 미리보기 후 게시:

```bash
node scripts/instagram-post.mjs posts/2026-11-15.json
```

```bash
node scripts/instagram-post.mjs posts/2026-11-15.json --publish
```

## 손님 후기 (네이버)

홈페이지 "손님 후기"는 매주 월요일 아침 자동으로 새로 만들어집니다 (GitHub Actions).

- **방문자 리뷰** — `scripts/fetch-place-reviews.mjs`가 네이버 플레이스 공개 페이지에서 리뷰 수, 키워드 순위, 최근 리뷰 몇 개의 첫 줄(80자까지)을 가져옵니다. 닉네임은 가리고, 전체 리뷰는 네이버 링크로 보냅니다.
  - 네이버가 허락한 방법(API)이 아니라서 네이버 약관에 어긋나고, 네이버 화면이 바뀌면 멈출 수 있습니다. 실패하면 마지막으로 저장된 `data/reviews.json`을 그대로 씁니다.
  - 리뷰 글은 쓴 사람의 저작물입니다. 전문을 옮기지 말고, 리뷰 작성자가 삭제를 요청하면 바로 빼 주세요.
  - 손으로 새로 고치려면 `node scripts/fetch-place-reviews.mjs` 실행 후 `data/reviews.json`을 커밋.
- **블로그 후기** — `scripts/fetch-blog.mjs`가 네이버 공식 검색 API로 블로그 글 제목·작성자·날짜·링크를 가져옵니다. developers.naver.com에서 "검색" API를 등록하고, 저장소 Settings → Secrets and variables → Actions에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 넣으면 켜집니다.

## AI 연결

지금은 대시보드 "AI로 다듬기" 요청문을 ChatGPT·Claude에 붙여 넣는 방식이라 설정이 필요 없습니다. 자동화하려면 `scripts/ai.mjs`의 `generate()`를 채우세요.

## 일부러 안 넣은 것

- **네이버 블로그 자동 게시**: 네이버가 블로그 글쓰기 API를 닫았습니다. 대시보드 초안을 복사해 직접 올리세요.
- **네이버 플레이스·카카오맵 정보 수정**: 공개 API가 없어 사장님이 직접 관리 화면에서 고칩니다.
- **구글 비즈니스 프로필 API**: 별도 승인이 필요해 체크리스트로만 넣었습니다.
- **가짜 리뷰·리뷰 조작**: 플랫폼 정책 위반이고 적발되면 노출이 오히려 떨어집니다.

## 구조

```
restaurant.json         가게 정보 (유일한 원본)
build.mjs               restaurant.json → site/
dashboard/index.html    대시보드 (site/admin/으로 복사됨, 검색 제외)
public/                 사진 등 그대로 복사될 파일 (public/posts/ = 인스타용 사진)
scripts/                인스타 게시, AI 연결 자리
.github/workflows/      푸시하면 GitHub Pages로 자동 배포
```
