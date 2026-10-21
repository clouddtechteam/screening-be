import { chromium } from 'playwright';

let browserInstance = null;

export async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  try {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,800'
      ]
    });
    return browserInstance;
  } catch (err) {
    console.warn('Playwright launch warning:', err.message);
    throw err;
  }
}

export async function createCaptureContext() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  return context;
}
