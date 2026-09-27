// The stream-output build: transcode(), remux and recording, each checked by
// probing what came out (and, where the browser can, decoding it natively).
// Silent: nothing here opens an audio output.
//   node tests/sout.mjs [--engine=webkit]
import { startServer, openHarness } from './lib/browser.mjs';

const engine = process.argv.find((a) => a.startsWith('--engine='))?.split('=')[1] ?? 'chromium';
const { server, url } = await startServer();
const { browser, page, consoleLines } = await openHarness(url, engine);
const show = (r) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(52)} ${String(r.ms).padStart(6)} ms  ${r.detail}`);
page.on('console', (m) => { if (m.text().startsWith('@@')) show(JSON.parse(m.text().slice(2))); });

const results = await page.evaluate(async () => {
  const sout = (await import('/packages/sout/index.js')).default;
  const vlc = await window.harness.ensureVLC({ engine: sout });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const file = async (path) => new File([await (await fetch(`/corpus/media/${path}`)).blob()], path.split('/').pop());
  const out = [];
  async function test(name, fn) {
    const t0 = performance.now();
    let r;
    try {
      const detail = await Promise.race([fn(), sleep(60000).then(() => { throw new Error('timed out after 60 s'); })]);
      r = { name, ok: true, ms: Math.round(performance.now() - t0), detail: detail ?? '' };
    } catch (e) {
      r = { name, ok: false, ms: Math.round(performance.now() - t0), detail: String(e?.message ?? e) };
    }
    out.push(r);
    console.log(`@@${JSON.stringify(r)}`);
  }
  const assert = (c, msg) => { if (!c) throw new Error(msg); };
  const codecs = (info) => info.tracks.map((t) => `${t.type[0]}:${t.codec.trim()}`).sort().join(' ');
  /** Can this browser's own <video> decode it? (null when it does not claim the type) */
  const nativePlays = (f) => new Promise((resolve) => {
    const v = document.createElement('video');
    if (!v.canPlayType(f.type)) return resolve(null);
    v.muted = true;
    v.src = URL.createObjectURL(f);
    const done = (ok) => { URL.revokeObjectURL(v.src); resolve(ok); };
    v.onloadeddata = () => done(true);
    v.onerror = () => done(false);
    setTimeout(() => done(false), 5000);
  });

  await test('features.sout is reported', async () => {
    assert(vlc.features.sout === true, JSON.stringify(vlc.features));
    return JSON.stringify(vlc.features);
  });

  const cases = [
    // A cut of a longer file: its header claims 2 hours, so no duration check.
    ['realmedia/realvideo-4-cook-rmvb.rmvb', { to: 'webm' }, ['v:VP80', 'a:Opus'], { truncated: true }],
    ['gen/t_wmv2.wmv', { to: 'mp4' }, ['v:h264', 'a:mp4a']],
    ['gen/t_wmv2.wmv', { to: 'mp4', video: 'mp4v' }, ['v:mp4v', 'a:mp4a']],
    ['gen/t_xvid_mp3.avi', { to: 'mkv', video: 'hevc', width: 320 }, ['v:hevc', 'a:Opus']],
    ['gen/t_h264_opus_ass.mkv', { to: 'webm', width: 320 }, ['v:VP80', 'a:Opus']],
    ['gen/t_xvid_mp3.avi', { to: 'ogg' }, ['a:Opus']],
    ['gen/t_mpeg2_ac3.ts', { to: 'wav' }, ['a:']],
    ['gen/t_wmv2.wmv', { to: 'mp3', video: false }, ['a:mp3']],
    ['gen/t_h264_opus_ass.mkv', { to: 'mp4', remux: true }, ['v:h264', 'a:Opus']],
  ];
  for (const [src, opts, want, { truncated } = {}] of cases) {
    await test(`transcode ${src.split('/').pop()} → ${opts.to}${opts.remux ? ' (remux)' : ''}`, async () => {
      const input = await file(src);
      const inInfo = await vlc.probe(input);
      let last = 0;
      const f = await vlc.transcode(input, { ...opts, onProgress: (p) => { last = p; } });
      assert(f instanceof File && f.size > 1000, `output ${f?.size} B`);
      assert(last === 1, `last progress ${last}`);
      const info = await vlc.probe(f);
      const got = codecs(info);
      for (const w of want) assert(got.includes(w), `wanted ${w}, got ${got}`);
      assert(truncated || Math.abs(info.duration - inInfo.duration) < Math.max(0.5, inInfo.duration * 0.05),
        `duration ${info.duration?.toFixed(2)} vs source ${inInfo.duration?.toFixed(2)}`);
      const native = await nativePlays(f);
      return `${(f.size / 1024).toFixed(0)} KiB ${f.type}, ${got}, ${info.duration.toFixed(2)} s` +
        (native === null ? '' : `, browser decodes it: ${native}`);
    });
  }

  await test('an encoder VLC lacks is an error, not a missing stream', async () => {
    const err = await vlc.transcode(await file('gen/t_wmv2.wmv'), { to: 'mkv', video: 'WMV3' }).then(() => null, (e) => e);
    assert(err && /could not encode video as "WMV3"/.test(err.message), `got ${err?.message ?? 'a file'}`);
    return err.message;
  });

  await test('recording while playing', async () => {
    const p = await vlc.createPlayer({ audio: false });
    try {
      await p.open(await file('gen/t_h264_opus_ass.mkv'));
      await p.once('playing');
      await p.startRecording();
      await sleep(1500);
      const rec = await p.stopRecording();
      assert(rec instanceof File && rec.size > 1000, `recording ${rec?.size} B`);
      const info = await vlc.probe(rec);
      assert(info.tracks.some((t) => t.type === 'video'), codecs(info));
      return `${rec.name}, ${(rec.size / 1024).toFixed(0)} KiB, ${codecs(info)}, ${info.duration?.toFixed(2)} s`;
    } finally {
      await p.destroy();
    }
  });

  return out;
});

const failed = results.filter((r) => !r.ok);
if (failed.length) console.log(consoleLines.filter((l) => /error|warn/i.test(l)).slice(-30).join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} passed (${engine})`);
await browser.close();
await server.close();
process.exitCode = failed.length ? 1 : 0;
