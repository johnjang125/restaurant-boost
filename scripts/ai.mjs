// AI 연결 자리 — 아직 연결 안 됨.
// 지금은 대시보드 "글 만들기 → AI로 다듬기" 요청문을 ChatGPT·Claude에 붙여 넣어 쓰면 됩니다.
// 자동화하고 싶을 때 이 함수만 채우면 됩니다. 키는 .env의 AI_API_KEY에 두고 절대 커밋하지 마세요.
//
// 쓰임새 예:
//  - 글 초안 다듬기 (인스타 캡션, 블로그 글)
//  - 리뷰 답글 초안
//  - AI 노출 자동 점검: 대시보드의 질문 목록을 AI에 묻고 답에 가게 이름이 나오는지 세기
//
// 사용: import { generate } from './ai.mjs'; const text = await generate('프롬프트');
try { process.loadEnvFile('.env'); } catch {}

export async function generate(prompt) {
  const { AI_PROVIDER, AI_API_KEY, AI_MODEL } = process.env;
  if (!AI_PROVIDER || !AI_API_KEY) throw new Error('AI가 연결되지 않았습니다. .env에 AI_PROVIDER, AI_API_KEY, AI_MODEL을 넣고 이 함수를 채우세요.');
  // TODO: AI_PROVIDER에 맞춰 API 호출 후 생성된 글(string)을 돌려주기
  throw new Error(`${AI_PROVIDER} 연결 코드가 아직 없습니다 (scripts/ai.mjs).`);
}
