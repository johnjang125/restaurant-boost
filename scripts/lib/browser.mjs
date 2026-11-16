// 시스템에 깔린 Edge/Chrome을 씀 (브라우저를 따로 내려받지 않음)
import { chromium } from 'playwright-core';

export async function launch() {
  const channels = process.env.BROWSER_CHANNEL ? [process.env.BROWSER_CHANNEL] : ['msedge', 'chrome'];
  for (const channel of channels) {
    try { return await chromium.launch({ channel }); } catch { /* 다음 후보 */ }
  }
  throw new Error('Edge나 Chrome을 찾지 못했습니다. BROWSER_CHANNEL=chrome 처럼 지정해 보세요.');
}

export const VIEWPORTS = {
  mobile: {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
