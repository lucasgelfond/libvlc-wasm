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
// Runs in every page (and frame) before its own scripts. WebKit has no mute
// switch at all, so silence is enforced here for every engine: whatever is
// connected to the speakers goes through a zero gain instead (analysers
// upstream still see the signal), and media elements are always muted.
const SILENCE = () => {
  const connect = AudioNode.prototype.connect;
  const silent = new WeakMap();
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode) {
      let g = silent.get(dest.context);
      if (!g) {
        g = dest.context.createGain();
        g.gain.value = 0;
        connect.call(g, dest);
        silent.set(dest.context, g);
      }
      return connect.call(this, g, ...rest);
    }
    return connect.call(this, dest, ...rest);
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { this.muted = true; this.volume = 0; return play.apply(this, a); };
  Object.defineProperty(HTMLMediaElement.prototype, 'muted', { get() { return true; }, set() {}, configurable: true });
};

/** A browser that never makes a sound: every test and benchmark launches through here. */
export async function launchMuted(engine = 'chromium', opts = {}) {
  const launch = { headless: opts.headless ?? true };
  if (engine === 'chromium') {
    launch.args = ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-features=SharedArrayBuffer'];
    if (opts.channel) launch.channel = opts.channel;
  }
  if (engine === 'firefox') launch.firefoxUserPrefs = { 'media.volume_scale': '0.0' };
  const browser = await ENGINES[engine].launch(launch);
  // Every context (and the default one newPage() makes) gets the silencer.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (o) => {
    const ctx = await newContext(o);
    await ctx.addInitScript(SILENCE);
    return ctx;
  };
  browser.newPage = async (o) => {
    const ctx = await browser.newContext(o);
    const page = await ctx.newPage();
    page.on('close', () => ctx.close().catch(() => {}));
    return page;
  };
  return browser;
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
