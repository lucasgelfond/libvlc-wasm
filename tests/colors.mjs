// Colour accuracy per pixel layout. Each clip in bench/media/colors is four
// flat quadrants of known RGB, encoded as a different layout/range/matrix; the
// canvas must show those colours (within YUV round-trip error) at each centre.
//   node tests/colors.mjs [--channel=chrome] [--engine=webkit]
import { startServer, openHarness } from './lib/browser.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const EXPECT = [[200, 40, 40], [40, 180, 60], [50, 60, 200], [128, 128, 128]];
const CASES = [
  ['i420.mpg', 'I420 4:2:0, limited, BT.709 (MPEG-2)'],
  ['j422.avi', 'I422 4:2:2, full range, BT.601 (MJPEG)'],
  ['i444.mkv', 'I444 4:4:4, limited, BT.709 (H.264 High 4:4:4)'],
  ['i0al.mkv', '10-bit 4:2:0, limited, BT.709 (HEVC Main 10)'],
  ['h264.mkv', '4:2:0 BT.709 via WebCodecs when available (NV12)'],
];
const TOLERANCE = 8;

const { server, url } = await startServer();
const { browser, page } = await openHarness(url, arg('engine') ?? 'chromium', { channel: arg('channel') });
let failed = 0;
for (const [clip, what] of CASES) {
  const r = await page.evaluate(async (u) => {
    const vlc = await window.harness.ensureVLC();
    const canvas = document.getElementById('c');
    const p = await vlc.createPlayer({ canvas, audio: false });
    const logs = [];
    const off = vlc.on('log', (l) => logs.push(l.message));
    await vlc.setLogLevel('debug');
    await p.open(new File([await (await fetch(u)).blob()], u.split('/').pop()));
    const t0 = performance.now();
    while (!(p.renderer?.framesDrawn > 2) && performance.now() - t0 < 5000) await new Promise((res) => setTimeout(res, 20));
    await p.pause();
    await new Promise((res) => setTimeout(res, 200));
    p.renderer.draw();
    const W = canvas.width, H = canvas.height;
    const c2 = new OffscreenCanvas(W, H);
    c2.getContext('2d').drawImage(canvas, 0, 0);
    const d = c2.getContext('2d').getImageData(0, 0, W, H).data;
    // Picture box inside the (letterboxed) canvas, 16:9 content.
    const pw = Math.min(W, (H * 16) / 9), ph = (pw * 9) / 16, ox = (W - pw) / 2, oy = (H - ph) / 2;
    const at = (fx, fy) => {
      const acc = [0, 0, 0];
      let n = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = Math.round(ox + fx * pw) + dx, y = Math.round(oy + fy * ph) + dy;
        const i = (y * W + x) * 4;
        acc[0] += d[i]; acc[1] += d[i + 1]; acc[2] += d[i + 2]; n++;
      }
      return acc.map((v) => Math.round(v / n));
    };
    const code = p.renderer.code;
    await vlc.setLogLevel('warn');
    off();
    await p.destroy();
    return {
      quads: [at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)],
      code,
      decoder: (logs.find((l) => /using video decoder module/.test(l)) ?? '').replace(/.*module "(.*)"/, '$1'),
    };
  }, `/bench/media/colors/${clip}`);
  const err = Math.max(...r.quads.flatMap((q, i) => q.map((v, k) => Math.abs(v - EXPECT[i][k]))));
  const layout = ['I420', 'I422', 'I444', 'NV12', 'I420-10', 'RGBX', 'BGRX'][r.code & 0xff] ?? '?';
  const desc = `${layout}${r.code & 0x100 ? ' full' : ''} ${['601', '709', '2020'][(r.code >> 12) & 0xf]}`;
  const ok = err <= TOLERANCE;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what.padEnd(50)} drawn as ${desc.padEnd(16)} via ${r.decoder.padEnd(9)} max error ${err}/255${ok ? '' : `  got ${JSON.stringify(r.quads)}`}`);
}
await browser.close();
await server.close();
process.exitCode = failed ? 1 : 0;
