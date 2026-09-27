// Exercises every Player / VLC API with real assertions, in a headless browser
// (silent). node tests/features.mjs [--engine=webkit]
import { startServer, openHarness } from './lib/browser.mjs';

const engine = process.argv.find((a) => a.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
const { server, url } = await startServer();
const { browser, page, consoleLines } = await openHarness(url, engine);
const show = (r) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(52)} ${String(r.ms).padStart(5)} ms  ${r.detail}`);
page.on('console', (m) => { if (m.text().startsWith('@@')) show(JSON.parse(m.text().slice(2))); });

const results = await page.evaluate(async () => {
  const G = '/corpus/media/gen/';
  const vlc = await window.harness.ensureVLC();
  const canvas = document.getElementById('c');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const file = async (name) => new File([await (await fetch(G + name)).blob()], name);
  const out = [];
  async function test(name, fn) {
    const t0 = performance.now();
    let r;
    try {
      const detail = await Promise.race([fn(), sleep(15000).then(() => { throw new Error('timed out after 15 s'); })]);
      r = { name, ok: true, ms: Math.round(performance.now() - t0), detail: detail ?? '' };
    } catch (e) {
      r = { name, ok: false, ms: Math.round(performance.now() - t0), detail: String(e?.message ?? e) };
    }
    out.push(r);
    console.log(`@@${JSON.stringify(r)}`);
  }
  const assert = (c, msg) => { if (!c) throw new Error(msg); };
  // Silent audio: route every player through a muted gain node.
  const ctx = new AudioContext();
  const mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination);
  const newPlayer = () => vlc.createPlayer({ canvas, audioContext: ctx, audioDestination: mute });
  const waitFor = async (cond, ms = 5000, what = 'condition') => {
    const end = performance.now() + ms;
    while (!(await cond())) { if (performance.now() > end) throw new Error(`timed out waiting for ${what}`); await sleep(50); }
  };

  await test('probe: container, tracks, duration', async () => {
    const info = await vlc.probe(await file('t_h264_opus_ass.mkv'));
    assert(Math.abs(info.duration - 5) < 0.2, `duration ${info.duration}`);
    const types = info.tracks.map((t) => t.type).sort().join(',');
    assert(types === 'audio,text,video', types);
    return `${info.duration.toFixed(2)} s, ${info.tracks.map((t) => t.codec.trim()).join('+')}`;
  });

  await test('thumbnail: JPEG of requested width', async () => {
    const { blob, width, height } = await vlc.thumbnail(await file('t_mpeg2_ac3.ts'), { time: 2, width: 160 });
    assert(blob.type === 'image/jpeg' && blob.size > 1000, `blob ${blob.size}`);
    assert(width === 160 && height === 90, `${width}x${height}`);
    const bmp = await createImageBitmap(blob);
    return `${bmp.width}x${bmp.height}, ${blob.size} B`;
  });

  await test('equalizer presets', async () => {
    const { presets, bands } = await vlc.equalizerPresets();
    assert(presets.length >= 15 && bands.length === 10, `${presets.length} presets, ${bands.length} bands`);
    return `${presets.length} presets, bands ${bands[0]}–${bands[9]} Hz`;
  });

  const p = await newPlayer();
  await test('open + play: first frame and state', async () => {
    await p.open(await file('t_chapters.mkv'));
    await waitFor(() => p.state === 'playing' && p.renderer.framesDrawn > 0, 5000, 'first frame');
    return `playing, ${p.renderer.framesDrawn} frames`;
  });

  await test('pause freezes the clock, play resumes it', async () => {
    await p.pause();
    await waitFor(() => p.state === 'paused', 2000, 'paused');
    const t = p.currentTime; await sleep(500);
    assert(Math.abs(p.currentTime - t) < 0.05, `moved ${p.currentTime - t}`);
    await p.play();
    await waitFor(() => p.state === 'playing', 2000, 'playing');
    await sleep(500);
    assert(p.currentTime > t + 0.3, 'did not resume');
    return `held at ${t.toFixed(2)} s`;
  });

  await test('seek lands where asked (precise)', async () => {
    await p.seek(3.5);
    await sleep(600);
    const t = p.currentTime;
    assert(t > 3.4 && t < 4.4, `at ${t}`);
    return `seek 3.5 → ${t.toFixed(2)} s`;
  });

  await test('chapters: listed and jumpable', async () => {
    await waitFor(() => p.chapters.chapters.length === 3, 3000, 'chapters');
    const names = p.chapters.chapters.map((c) => c.name).join(',');
    assert(names === 'Opening,Middle,End', names);
    await p.setChapter(1);
    await sleep(500);
    assert(p.currentTime >= 1.9 && p.currentTime < 3.2, `at ${p.currentTime}`);
    return `${names}; jumped to ${p.currentTime.toFixed(2)} s`;
  });

  await test('rate 2x doubles clock speed', async () => {
    await p.seek(0.5); await sleep(300);
    p.rate = 2;
    await waitFor(() => p.rate === 2, 2000, 'ratechange');
    const t0 = p._time, w0 = performance.now();
    await sleep(1200);
    const speed = (p._time - t0) / ((performance.now() - w0) / 1000);
    p.rate = 1;
    assert(speed > 1.6 && speed < 2.4, `speed ${speed.toFixed(2)}`);
    return `measured ${speed.toFixed(2)}x`;
  });

  await test('AB loop keeps time inside [1, 2]', async () => {
    await p.seek(1); await sleep(200);
    await p.setABLoop(1, 2);
    const seen = [];
    for (let k = 0; k < 25; k++) { await sleep(100); seen.push(p._time); }
    await p.setABLoop(null);
    const max = Math.max(...seen), min = Math.min(...seen.slice(5));
    assert(max < 2.4 && min >= 0.9, `range ${min.toFixed(2)}–${max.toFixed(2)}`);
    // It must actually play through the loop, and wrap back at least once.
    const wrapped = seen.some((t, k) => k && t < seen[k - 1] - 0.5);
    assert(max > 1.6 && wrapped, `did not loop: range ${min.toFixed(2)}–${max.toFixed(2)}`);
    return `stayed in ${min.toFixed(2)}–${max.toFixed(2)} s for 2.5 s`;
  });

  await test('volume and mute round-trip through VLC', async () => {
    const got = p.once('volumechange');
    p.volume = 0.5;
    const v = await got;
    assert(Math.abs(v.volume - 0.5) < 0.02, JSON.stringify(v));
    p.muted = true; await sleep(200);
    assert(p.muted, 'mute');
    p.muted = false; p.volume = 1;
    return 'ok';
  });

  await test('audio level meter reports sound', async () => {
    await waitFor(() => p.audioLevel.peak > 0.01, 2000, 'level');
    return `peak ${p.audioLevel.peak.toFixed(3)}`;
  });

  await test('frame stepping forward and back', async () => {
    await p.pause(); await sleep(300);
    const before = p.renderer.framesDrawn;
    await p.nextFrame(); await sleep(300);
    await p.nextFrame(); await sleep(300);
    const after = p.renderer.framesDrawn;
    assert(after > before, `drawn ${before}→${after}`);
    await p.previousFrame(); await sleep(400);
    return `+${after - before} frames drawn stepping forward`;
  });

  await test('marquee overlay changes the picture', async () => {
    await p.play(); await sleep(300); await p.pause(); await sleep(300);
    const snapA = await p.snapshot();
    await p.setMarquee({ text: 'libvlc-wasm', size: 48, color: 0xff8800, position: 4 });
    await p.nextFrame(); await sleep(500);
    const snapB = await p.snapshot();
    await p.setMarquee(null);
    assert(snapA.size !== snapB.size, 'identical snapshots');
    return `snapshot ${snapA.size} → ${snapB.size} B`;
  });

  await test('video filters: deinterlace, adjust, aspect, crop, equalizer', async () => {
    await p.setDeinterlace(true, 'yadif');
    await p.setAdjust({ brightness: 1.2, saturation: 0 });
    await p.setAspectRatio('4:3');
    await p.setCrop({ ratio: [16, 9] });
    await p.setEqualizer('Rock');
    await p.setStereoMode('mono');
    await p.setSubtitleScale(1.5);
    await p.play(); await sleep(600);
    const drawn = p.renderer.framesDrawn;
    await sleep(400);
    assert(p.renderer.framesDrawn > drawn, 'stalled with filters on');
    await p.setAdjust(null); await p.setDeinterlace(false); await p.setAspectRatio(null); await p.setCrop(null);
    await p.setEqualizer(null); await p.setStereoMode('stereo');
    return 'still playing with all filters on';
  });

  await test('stats: counters are live', async () => {
    const s = await p.stats();
    assert(s.framesDisplayed > 10 && s.audioFramesPlayed > 1000, JSON.stringify(s).slice(0, 200));
    return `${s.framesDisplayed} frames shown, ${s.audioFramesPlayed} audio frames, ${s.demuxReadBytes} B demuxed`;
  });

  await test('tracks: select and disable', async () => {
    await p.open(await file('t_h264_opus_ass.mkv'));
    await waitFor(() => p.tracks.length === 3, 3000, 'tracks');
    const sub = p.tracks.find((t) => t.type === 'text');
    await p.selectTrack(sub);
    await waitFor(() => p.tracks.find((t) => t.type === 'text')?.selected, 2000, 'sub selected');
    await p.disableTrack('text');
    await waitFor(() => !p.tracks.find((t) => t.type === 'text')?.selected, 2000, 'sub disabled');
    await p.setSubtitleDelay(0.5); await p.setAudioDelay(-0.1);
    return p.tracks.map((t) => `${t.type}:${t.codecName}`).join(', ');
  });

  await test('external subtitles and VobSub pair', async () => {
    const idx = new File([await (await fetch('/corpus/media/subtitles-and-captions/vobsub.idx')).blob()], 'vobsub.idx');
    const sub = new File([await (await fetch('/corpus/media/subtitles-and-captions/vobsub.sub')).blob()], 'vobsub.sub');
    await p.addSubtitles([idx, sub]);
    await waitFor(() => p.tracks.filter((t) => t.type === 'text').length > 1, 3000, 'vobsub tracks');
    return `${p.tracks.filter((t) => t.type === 'text').length} subtitle tracks`;
  });

  await test('programs of a transport stream', async () => {
    await p.open(await file('t_mpeg2_ac3.ts'));
    await waitFor(async () => (await p.programs()).length > 0, 3000, 'programs');
    const progs = await p.programs();
    await p.selectProgram(progs[0].id);
    return progs.map((x) => `${x.id}:${x.name}${x.selected ? '*' : ''}`).join(', ');
  });

  await test('recording the stream as-is', async () => {
    if (!vlc.features.sout) {
      const err = await p.startRecording().then(() => null, (e) => e.message);
      assert(/sout/.test(err ?? ''), 'expected a clear sout error');
      return 'this build has no sout: rejects with a clear error (as intended)';
    }
    await p.open(await file('t_mpeg2_ac3.ts'));
    await waitFor(() => p.state === 'playing', 3000, 'playing');
    await p.startRecording();
    await sleep(1500);
    const rec = await p.stopRecording();
    assert(rec.size > 50000, `recorded ${rec.size} B`);
    const info = await vlc.probe(rec);
    assert(info.tracks.length >= 1, 'recording has no tracks');
    return `${rec.name}: ${rec.size} B, ${info.tracks.map((t) => t.codec.trim()).join('+')}`;
  });

  await test('gapless queue: next media starts without stopping', async () => {
    const states = [];
    const off = p.on('statechange', (s) => states.push(s));
    let changed = false;
    const off2 = p.on('mediachange', () => { changed = true; });
    await p.open(await file('t_3frames.mkv'));
    await p.queue(await file('t_wmv2.wmv'));
    await waitFor(() => changed && p.tracks.some((t) => t.codec === 'WMV2'), 6000, 'second media');
    off(); off2();
    assert(!states.includes('stopped'), `states ${states.join('>')}`);
    return `states ${states.join(' > ')}`;
  });

  await test('bytes and Blob sources', async () => {
    const buf = await (await fetch(G + 't_wmv2.wmv')).arrayBuffer();
    await p.open(buf, { name: 'x.wmv' });
    await waitFor(() => p.state === 'playing', 3000, 'playing from bytes');
    await p.open(new Blob([buf]));
    await waitFor(() => p.state === 'playing', 3000, 'playing from blob');
    return 'ArrayBuffer and Blob both play';
  });

  await test('http(s) URL source (ranged reads)', async () => {
    await p.open(new URL(G + 't_mpeg2_ac3.ts', location.href).href);
    const before = p.renderer.framesDrawn;
    await waitFor(() => p.tracks.some((t) => t.codec === 'mpgv') && p.renderer.framesDrawn > before + 5, 6000, 'frames from the URL');
    return `${p.renderer.framesDrawn - before} new frames, ${p.tracks.map((t) => t.codec.trim()).join('+')}`;
  });

  await test('two players at once', async () => {
    const c2 = document.createElement('canvas');
    document.body.append(c2);
    const p2 = await vlc.createPlayer({ canvas: c2, audio: false });
    await p.open(await file('t_mpeg2_ac3.ts'));
    await p2.open(await file('t_h264_opus_ass.mkv'));
    await sleep(1500);
    const a = p.renderer.framesDrawn, b = p2.renderer.framesDrawn;
    await p2.destroy(); c2.remove();
    assert(a > 5 && b > 5, `${a} / ${b}`);
    return `${a} and ${b} frames drawn concurrently`;
  });

  await test('stop and destroy', async () => {
    await p.stop();
    await waitFor(() => p.state === 'stopped', 3000, 'stopped');
    await p.destroy();
    return 'ok';
  });
  await ctx.close();
  return out;
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n[${engine}] ${results.length - failed}/${results.length} passed`);
if (failed && process.env.CONSOLE) console.log(consoleLines.slice(-30).join('\n'));
await browser.close();
await server.close();
process.exitCode = failed ? 1 : 0;
