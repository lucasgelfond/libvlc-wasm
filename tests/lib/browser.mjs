// Shared by the browser tests and benchmarks: a cross-origin isolated Vite
// server over the repo, and a Playwright page on the harness.
import { createServer } from 'vite';
import { chromium, webkit, firefox } from 'playwright';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function startServer() {
  const server = await createServer({ root, configFile: `${root}/vite.config.js`, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls.local[0].replace(/\/$/, '');
  return { server, url };
}

const ENGINES = { chromium, webkit, firefox };

/**
 * @param {'chromium'|'webkit'|'firefox'} engine
 * @param {{ headless?: boolean, channel?: string }} opts channel 'chrome' uses installed Chrome
 */
/** A browser that never makes a sound: every test and benchmark launches through here. */
export function launchMuted(engine = 'chromium', opts = {}) {
  const launch = { headless: opts.headless ?? true };
  if (engine === 'chromium') {
    launch.args = ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-features=SharedArrayBuffer'];
    if (opts.channel) launch.channel = opts.channel;
  }
  if (engine === 'firefox') launch.firefoxUserPrefs = { 'media.volume_scale': '0.0' };
  return ENGINES[engine].launch(launch);
}

export async function openHarness(baseUrl, engine = 'chromium', opts = {}) {
  const browser = await launchMuted(engine, opts);
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await page.goto(`${baseUrl}/tests/browser/`);
  await page.waitForFunction(() => window.harnessReady === true, null, { timeout: 30000 });
  return { browser, page, consoleLines };
}
