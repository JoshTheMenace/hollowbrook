// Exit-coded browser harness: vite dev server (in-process) + system Chrome
// (headless, via puppeteer-core). Exists so gates can measure in the JUDGING
// space — rendered pixels — while staying in-tree, scriptable, and
// driver-independent (B2 review r2; nightbloom TRAPS: a gate whose result
// depends on how the game is driven is a flaky gate).

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// withPage('/celbridge.html', async (page) => {...}) — boots everything,
// waits for the module to settle, hands you the puppeteer page, tears down.
export async function withPage(pagePath, fn, { readyExpr = 'true', timeout = 30000 } = {}) {
  const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const port = server.httpServer.address().port;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    // the play gate's draw-call step renders 5 x 45 s of frames inside ONE
    // evaluate; puppeteer's default 180 s protocol timeout killed it on the
    // composed town (integration) — a gate must not fail on its own clock
    protocolTimeout: 900000,
    args: ['--use-angle=metal', '--enable-gpu', '--window-size=1280,800'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on('pageerror', (e) => console.error('[page error]', e.message));
    await page.goto(`http://127.0.0.1:${port}${pagePath}`, { waitUntil: 'networkidle0', timeout });
    await page.waitForFunction(readyExpr, { timeout });
    return await fn(page);
  } finally {
    await browser.close();
    await server.close();
  }
}
