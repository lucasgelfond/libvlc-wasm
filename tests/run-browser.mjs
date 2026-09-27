// Plays a few files through libvlc-wasm in headless Chromium and prints what
// happened.   node tests/run-browser.mjs [--engine=webkit] [/corpus/media/...]
import { startServer, openHarness } from './lib/browser.mjs';

const args = process.argv.slice(2);
const engine = args.find((a) => a.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
const headed = args.includes('--headed');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) files.push('/corpus/media/gen/t_mpeg2_ac3.ts', '/corpus/media/gen/t_wmv2.wmv');

const { server, url } = await startServer();
const { browser, page, consoleLines } = await openHarness(url, engine, { headless: !headed });
try {
  const ready = await page.evaluate(async () => {
    const v = await window.harness.ensureVLC();
    return { version: v.version, startupMs: v.startupMs };
  });
  console.log(`[${engine}] VLC ${ready.version.version} ready in ${ready.startupMs.toFixed(0)} ms`);
  for (const f of files) {
    const r = await Promise.race([
      page.evaluate((u) => window.harness.playCase({ url: u, seconds: 3 }), f),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out on ${f}`)), 45000)),
    ]);
    console.log(`\n${f}`);
    console.log(`  events   ${r.events.join(' > ')}${r.error ? `  ERROR ${r.error}` : ''}`);
    console.log(`  tracks   ${r.tracks.map((t) => `${t.type}:${t.codec}`).join(' ')}`);
    console.log(`  timing   playing after ${r.timings.openToPlayingMs?.toFixed(0)} ms, first frame ${r.timings.openToFirstFrameMs?.toFixed(0)} ms`);
    console.log(`  video    ${r.video.framesDrawn} frames drawn, ${r.video.distinctFrames} distinct, variance ${r.video.maxVariance}`);
    console.log(`  audio    peak ${r.audio.peak}, ${r.audio.framesPlayed} frames played, audible ${r.audio.audibleFraction}`);
    console.log(`  vlc      decoded v/a ${r.stats.decodedVideo}/${r.stats.decodedAudio}, displayed ${r.stats.displayedPictures}, lost ${r.stats.lostPictures}, late ${r.stats.latePictures}, audio dropped ${r.stats.audioDropped} underruns ${r.stats.audioUnderruns}`);
    if (process.env.LOGS) console.log(r.logs.join('\n'));
  }
} catch (e) {
  console.error('FAILED', e.message);
  process.exitCode = 1;
} finally {
  if (process.env.CONSOLE || process.exitCode) console.log(consoleLines.join('\n'));
  await browser.close();
  await server.close();
}
