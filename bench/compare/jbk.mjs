// Runs the corpus through jbk/vlc.js (code.videolan.org/jbk/vlc.js, branch `incoming`) using its
// own vlc.html player page: pick a file in #fpicker_btn, which autoplays onto #canvas.
//
// There is no prebuilt binary in the repo (experimental.* are gitignored; CI artifacts expired
// 2022-11-04). What is runnable today is the project's published demo,
// https://videolabs.io/communication/vlcjs-demo/vlc.html — jbk's vlc.html + lib/ with the
// Videolabs 2024-03-07 experimental.wasm. Mirror it (default --dir):
//   B=https://videolabs.io/communication/vlcjs-demo D=.research/vlcjs-jbk-demo
//   for f in vlc.html vlc.css experimental.js experimental.wasm experimental.worker.js lib/libvlc.js \
//     lib/module-loader.js lib/overlay.js lib/wasm-imports.js assets/gitlab-logo-black-and-white.png \
//     vlc/modules/gui/qt/pixmaps/{play.png,pause.png,play_button.svg,toolbar/volume-muted.png,toolbar/volume-medium.png} \
//     vlc/modules/audio_output/webaudio/audio-worklet-processor.js; do
//     mkdir -p $D/$(dirname $f); curl -sf -o $D/$f $B/$f; done
// A from-source build of the `incoming` branch has the same layout and can be pointed at with
// --dir=<build output> --label=<name>. It builds today (~40 min on an M5 under amd64
// emulation) in its own CI image, with two fixes for bitrot:
//   docker run --platform linux/amd64 registry.videolan.org/vlc-debian-wasm-emscripten:20220505193036
//   git clone -b incoming https://code.videolan.org/jbk/vlc.js vlcjs && cd vlcjs
//   git clone https://code.videolan.org/videolan/vlc.git vlc && cd vlc
//   git checkout 06e361b127e4609e429909756212ed5e30e7d032 && git am -3 ../vlc_patches/aug/* && cd ..
//   # fix 1: emsdk master needs python >= 3.10, the image has 3.9 -> use the emsdk 3.1.18 tag
//   git clone -b 3.1.18 --depth 1 https://github.com/emscripten-core/emsdk.git emsdk
//   (cd emsdk && ./emsdk install 3.1.18 && ./emsdk activate 3.1.18)
//   # fix 2: glslang renamed its default branch
//   sed -i 's/GLSLANG_BRANCH := master/GLSLANG_BRANCH := main/' vlc/contrib/src/glslang/rules.mak
//   bash compile.sh   # then copy out the files listed in .gitlab-ci.yml's artifacts
// bench/compare/jbk-source-build-results.json is that build (.research/vlcjs-jbk-build).
//   node bench/compare/jbk.mjs [--dir=...] [--label=...] [--only=category] [--limit=N] [--video-only] [--shots]
// Writes bench/compare/jbk-results.json (or jbk-<label>-results.json). Silent: Chrome runs muted.
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, args, loadSamples, serve, launch, variance, AUDIO_PROBE, logRow, summarize } from './_common.mjs';

const dir = resolve(root, args.dir ?? '.research/vlcjs-jbk-demo') + '/';
if (!existsSync(`${dir}vlc.html`) || !existsSync(`${dir}experimental.wasm`)) throw new Error(`${dir} has no vlc.html + experimental.wasm; see the header of this file`);
const label = args.label ?? 'published-demo';
const out = args.label ? `jbk-${args.label}` : 'jbk';
const PORT = 5495;
const samples = loadSamples();

const server = await serve(PORT, { '/': dir });
const browser = await launch();
const scratch = await browser.newPage();

const results = [];
for (const s of samples) {
  const p = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  await p.addInitScript(AUDIO_PROBE);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  const t0 = Date.now();
  let ready = false, firstFrameMs = null, maxVar = 0, crashed = false, audio = null;
  p.on('crash', () => { crashed = true; });
  try {
    await p.goto(`http://127.0.0.1:${PORT}/vlc.html`, { timeout: 30000 });
    ready = await p.waitForFunction(() => !!window.media_player, null, { timeout: 30000 }).then(() => true, () => false);
    // vlc.html draws its play button and chapter arrows over the canvas as soon as a file is
    // picked; hide them so the luma check sees only what libvlc rendered.
    await p.addStyleTag({ content: '#p-overlay, #chapter-buttons { visibility: hidden !important; }' });
    const tOpen = Date.now();
    await p.setInputFiles('#fpicker_btn', `${root}/corpus/media/${s.file}`);
    while (Date.now() - tOpen < 6000 && !crashed) {
      await p.waitForTimeout(250);
      const shot = await p.locator('#canvas').screenshot({ timeout: 2000 }).catch(() => null);
      if (!shot) continue;
      const v = await variance(scratch, shot);
      maxVar = Math.max(maxVar, v);
      if (v > 20 && firstFrameMs == null) firstFrameMs = Date.now() - tOpen;
      if (v >= maxVar && args.shots) writeFileSync(`${root}/bench/compare/${out}-${s.id}.png`, shot);
    }
    audio = await p.evaluate(() => window.__audioPeak?.()).catch(() => null);
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
  const row = {
    id: s.id, name: s.name, category: s.category, hasVideo: !!s.video, hasAudio: !!s.audio,
    ready, video: s.video ? maxVar > 20 : null, firstFrameMs, maxVariance: Math.round(maxVar),
    audible: s.audio ? (audio?.peak ?? 0) > 1e-3 : null, audioPeakRms: audio ? +audio.peak.toFixed(4) : null, audioGraphs: audio?.graphs ?? 0,
    crashed, errors: errors.slice(0, 5), wallMs: Date.now() - t0,
  };
  results.push(row);
  logRow(row);
  await p.close().catch(() => {});
}
await browser.close();
server.close();
const summary = summarize(`jbk/vlc.js (${label})`, results);
writeFileSync(`${root}/bench/compare/${out}-results.json`, JSON.stringify({ date: new Date().toISOString(), port: 'jbk/vlc.js', build: label, dir, summary, results }, null, 1));
