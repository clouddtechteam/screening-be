import { chromium } from 'playwright';
import fs from 'fs';

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

let browserInstance = null;

export async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  // Check if executable exists before trying to launch
  try {
    const execPath = chromium.executablePath();
    if (!fs.existsSync(execPath)) {
      throw new Error(`Browser binary not found at ${execPath}. Using verified official local list database.`);
    }
  } catch (err) {
    throw err;
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
        '--no-first-run',
        '--no-zygote',
        '--window-size=1280,800'
      ]
    });
    return browserInstance;
  } catch (err) {
    console.warn('Playwright launch notice:', err.message);
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
