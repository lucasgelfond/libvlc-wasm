// Builds the committed suite definitions corpus/suites/<name>.json from each
// suite's upstream listing: what the suite is, where it comes from, and the
// exact list of files (path under corpus/suites/<name>/, URL, size, and any
// reference decode info the suite ships). The downloads themselves are done by
// corpus/suites/fetch.mjs and are gitignored; the measuring is
// corpus/compat/suite.mjs.
//
//   node corpus/suites/lists.mjs libvpx        one suite
//   node corpus/suites/lists.mjs               every suite that has a builder
//
// Listings are fetched politely: one request at a time, with a pause between
// directory pages. Upstream listings are cached under corpus/suites/.lists/
// (gitignored); delete a cache file to re-list.
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lists = `${here}/.lists`;
mkdirSync(lists, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'libvlc-wasm compat measurement (one request at a time)' };

async function get(url, { json = false, tries = 4 } = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return json ? r.json() : r.text();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}
async function cached(name, fn) {
  const p = `${lists}/${name}`;
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  const v = await fn();
  writeFileSync(p, JSON.stringify(v));
  return v;
}
const gh = (args) => JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 256 << 20 }));
// A GitHub subtree with blob sizes, pinned to the commit it was listed at.
async function githubTree(repo, dir, ref = 'HEAD') {
  return cached(`${repo.replace('/', '_')}_${dir.replace(/\//g, '_')}.json`, async () => {
    const commit = gh([`repos/${repo}/commits/${ref}`]).sha;
    let sha = gh([`repos/${repo}/git/commits/${commit}`]).tree.sha;
    for (const part of dir.split('/').filter(Boolean)) sha = gh([`repos/${repo}/git/trees/${sha}`]).tree.find((t) => t.path === part).sha;
    const t = gh([`repos/${repo}/git/trees/${sha}?recursive=1`]);
    if (t.truncated) throw new Error(`${repo}/${dir}: tree truncated`);
    return { commit, files: t.tree.filter((x) => x.type === 'blob').map((x) => ({ path: x.path, bytes: x.size })) };
  });
}
const rawGithub = (repo, commit, p) => `https://raw.githubusercontent.com/${repo}/${commit}/${p.split('/').map(encodeURIComponent).join('/')}`;

// Extensions that are never a playback candidate in any of these suites.
const NON_MEDIA = /\.(md5|sha1|sha256|txt|md|html?|xml|json|js|mjs|sjs|py|sh|pl|c|h|cc|toml|yml|yaml|ini|cfg|log|diff|patch|headers?|\^headers\^|nfo|zip|rar|7z|gz|bz2|tgz|exe|dll|so|pdf|doc|url|lnk|db|ds_store|srt|vtt|ass|ssa|sub|idx|smi|ttml|dfxp|m3u8|mpd|ism|isml|manifest|scenario|config|media_info|skipped|png|jpe?g|gif|bmp|svg|ico|webp|yuv|y4m|pem|key|bin|build|README|LICENSE)$|(^|\/)(md5sum|README|LICENSE|meson\.build|\.gitlab-ci\.yml|00-README|HEADER\.txt)$/i;

function write(def) {
  const out = `${here}/${def.name}.json`;
  def.bytes = def.files.reduce((s, f) => s + (f.bytes ?? 0), 0);
  const { files, ...head } = def;
  // One file per line keeps the diff of a re-list readable.
  const body = JSON.stringify(head, null, 1).replace(/\n}$/, '');
  writeFileSync(out, `${body},\n "files": [\n${files.map((f) => `  ${JSON.stringify(f)}`).join(',\n')}\n ]\n}\n`);
  console.log(`${def.name}: ${files.length} files, ${(def.bytes / 1e6).toFixed(1)} MB -> ${relative(process.cwd(), out)}`);
}

const builders = {};

// ---------------------------------------------------------------------------
// libvpx: the decode test vectors libvpx's own test/test_vectors.cc runs, each
// with a per-frame .md5 of the decoded output.
builders.libvpx = async () => {
  const src = await cached('libvpx-test_vectors.json', async () => ({ cc: await get('https://raw.githubusercontent.com/webmproject/libvpx/main/test/test_vectors.cc') }));
  const names = [...new Set([...src.cc.matchAll(/"(vp[0-9]{2}-[^"]+\.(?:ivf|webm|mkv))"/g)].map((m) => m[1]))].sort();
  const objects = await cached('libvpx-gcs.json', async () => {
    const all = [];
    let token = '';
    do {
      const j = await get(`https://storage.googleapis.com/storage/v1/b/downloads.webmproject.org/o?prefix=test_data/libvpx/&maxResults=1000&fields=items(name,size,md5Hash),nextPageToken${token ? `&pageToken=${token}` : ''}`, { json: true });
      all.push(...(j.items ?? []).map((i) => ({ name: i.name.split('/').pop(), size: +i.size })));
      token = j.nextPageToken ?? '';
    } while (token);
    return all;
  });
  const size = Object.fromEntries(objects.map((o) => [o.name, o.size]));
  const base = 'https://storage.googleapis.com/downloads.webmproject.org/test_data/libvpx';
  const files = [];
  for (const n of names) {
    // vp90-2-02-size-08x08.webm -> vp90-2-02-size; vp80-00-comprehensive-001.ivf -> vp80-00-comprehensive
    const folder = /^(vp\d\d-\d+(?:-\d+)?-[a-z0-9_]+?)(?:[-_.]|$)/i.exec(n)?.[1] ?? n.slice(0, 4);
    files.push({ path: `${n.slice(0, 4)}/${n}`, url: `${base}/${n}`, bytes: size[n], folder, expect: { md5: `${n}.md5` } });
    files.push({ path: `${n.slice(0, 4)}/${n}.md5`, url: `${base}/${n}.md5`, bytes: size[`${n}.md5`], reference: true });
  }
  return {
    name: 'libvpx', title: 'libvpx VP8/VP9 decoder test vectors',
    description: 'The VP8 and VP9 conformance/decode test vectors libvpx runs in test/test_vectors.cc (vp80 = VP8; vp90 = VP9 profile 0; vp91/92/93 = profiles 1-3: 4:4:4, 10/12-bit). Each ships a .md5 with the MD5 of every decoded frame.',
    homepage: 'https://chromium.googlesource.com/webm/libvpx/+/refs/heads/main/test/test_vectors.cc',
    source: `${base}/`, license: 'BSD-3-Clause (WebM project test data)',
    fetched: 'names from libvpx test/test_vectors.cc (main), sizes from the GCS bucket listing; every file downloaded from the bucket.',
    subset: 'all of them (small: about 30 MB).',
    files,
  };
};

// ---------------------------------------------------------------------------
// libaom: the av1-1-b8-* / av1-1-b10-* decode test vectors (test/test_vectors.cc),
// each with a .md5 of the decoded output. The rest of the bucket is encoder
// input (raw YUV, GBs) and fuzzer corpora, which are not playback tests.
builders.libaom = async () => {
  const objects = await cached('aom-gcs.json', async () => (await get('https://storage.googleapis.com/storage/v1/b/aom-test-data/o?maxResults=1000&fields=items(name,size)', { json: true })).items.map((i) => ({ name: i.name, size: +i.size })));
  const size = Object.fromEntries(objects.map((o) => [o.name, o.size]));
  const base = 'https://storage.googleapis.com/aom-test-data';
  const files = [];
  for (const n of Object.keys(size).filter((x) => /^av1-1-b(8|10)-.*\.(ivf|webm|mkv|obu|annexb)$/.test(x)).sort()) {
    const folder = /^(av1-1-b\d+-\d+-[a-z0-9]+)/i.exec(n)?.[1] ?? 'other';
    files.push({ path: n, url: `${base}/${n}`, bytes: size[n], folder, ...(size[`${n}.md5`] != null ? { expect: { md5: `${n}.md5` } } : {}) });
    if (size[`${n}.md5`] != null) files.push({ path: `${n}.md5`, url: `${base}/${n}.md5`, bytes: size[`${n}.md5`], reference: true });
  }
  return {
    name: 'libaom', title: 'libaom AV1 decoder test vectors',
    description: 'The AV1 decode test vectors libaom runs (av1-1-b8-* 8-bit and av1-1-b10-* 10-bit: sizes, quantizers, intra-only, film grain, SVC, annexb/section5 OBU streams), each with a .md5 of the decoded output.',
    homepage: 'https://aomedia.googlesource.com/aom/+/refs/heads/main/test/test_vectors.cc',
    source: `${base}/`, license: 'BSD-2-Clause + AOM patent license (AOMedia test data)',
    fetched: 'the aom-test-data GCS bucket listing, filtered to av1-1-b8-*/av1-1-b10-* bitstreams and their .md5.',
    subset: 'all AV1 decode vectors (about 7 MB); skipped: raw YUV/Y4M encoder inputs (~3.8 GB), fuzzer seed corpora and the invalid-* crash repros. The Argon conformance suite (AOM CWG) is not included: it is ~10 GB of streams behind a separate licence.',
    files,
  };
};

// ---------------------------------------------------------------------------
// dav1d-test-data: the bitstreams dav1d's `meson test` decodes and verifies by
// MD5. oss-fuzz/ (sanitizer crash repros) is left out.
builders.dav1d = async () => {
  const commit = (await get('https://code.videolan.org/api/v4/projects/videolan%2Fdav1d-test-data/repository/branches/master', { json: true })).commit.id;
  const dir = `${here}/dav1d`;
  const files = [];
  const parts = ['8-bit', '10-bit', '12-bit', 'multi-bit'];
  for (const p of parts) {
    const tgz = `${lists}/dav1d-${p}.tar.gz`;
    if (!existsSync(tgz)) {
      // The archive endpoint only answers for a branch name, not a commit id.
      const r = await fetch(`https://code.videolan.org/videolan/dav1d-test-data/-/archive/master/dav1d-test-data-master.tar.gz?path=${p}`, { headers: UA });
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !buf.length) throw new Error(`dav1d ${p}: HTTP ${r.status}, ${buf.length} bytes`);
      writeFileSync(tgz, buf);
    }
    mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['xzf', tgz, '-C', dir, '--strip-components=1']);
  }
  // Expected MD5s: meson.build lines like ['name', files('x.ivf'), '0123...'].
  const md5 = {};
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  for (const f of walk(dir).filter((x) => x.endsWith('meson.build'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/files\('([^']+)'\)\s*,\s*'([0-9a-f]{32})'/g)) md5[relative(dir, resolve(dirname(f), m[1]))] = m[2];
  }
  for (const f of walk(dir).sort()) {
    const rel = relative(dir, f);
    if (NON_MEDIA.test(rel) || /\/argon\//.test(rel)) continue;
    const folder = rel.split('/').slice(0, 2).join('/');
    files.push({ path: rel, url: `https://code.videolan.org/videolan/dav1d-test-data/-/raw/${commit}/${rel}`, bytes: statSync(f).size, folder, ...(md5[rel] ? { expect: { md5: md5[rel] } } : {}) });
  }
  return {
    name: 'dav1d', title: 'dav1d test data (AV1)',
    description: 'The AV1 bitstreams dav1d decodes in its test suite (8/10/12-bit: conformance data, features, film grain, quantizer and size sweeps, resize, S-frames, SVC, issue repros), with the MD5 of the decoded output from meson.build where given.',
    homepage: 'https://code.videolan.org/videolan/dav1d-test-data', source: `https://code.videolan.org/videolan/dav1d-test-data/-/tree/${commit}`,
    license: 'BSD-2-Clause (dav1d test data; some streams from the AOM test vectors)',
    fetched: `GitLab archive tarballs of 8-bit/, 10-bit/, 12-bit/, multi-bit/ from master (then ${commit}), extracted into corpus/suites/dav1d/.`,
    subset: 'everything except oss-fuzz/ (sanitizer crash repros, not playable media) and the argon/ entries (pointers into the separately licensed Argon suite).',
    files,
  };
};

// ---------------------------------------------------------------------------
// Web Platform Tests: the media the HTML media element, MSE and WebCodecs
// tests play. Small, and exactly what browsers are held to.
builders.wpt = async () => {
  const repo = 'web-platform-tests/wpt';
  const files = [];
  let commit;
  for (const d of ['media', 'media-source', 'webcodecs']) {
    const t = await githubTree(repo, d);
    commit ??= t.commit;
    for (const f of t.files) {
      const rel = `${d}/${f.path}`;
      if (NON_MEDIA.test(rel)) continue;
      if (!/\.(webm|mp4|m4a|m4v|mp3|ogg|oga|ogv|opus|wav|flac|mkv|ivf|aac|adts|mov|ts|3gp)$/i.test(rel)) continue;
      files.push({ path: rel, url: rawGithub(repo, t.commit, rel), bytes: f.bytes, folder: d });
    }
  }
  return {
    name: 'wpt', title: 'Web Platform Tests media files',
    description: 'The media files the web-platform-tests suites for <video>/<audio> (media/), Media Source Extensions (media-source/) and WebCodecs (webcodecs/) use. Small clips browsers are expected to play.',
    homepage: 'https://github.com/web-platform-tests/wpt/tree/master/media', source: `https://github.com/${repo}/tree/${commit}`,
    license: 'BSD-3-Clause (web-platform-tests); media under their own free licences',
    fetched: `GitHub tree listing of media/, media-source/, webcodecs/ at ${commit}; raw.githubusercontent.com per file.`,
    subset: 'every audio/video file in those three folders (images, captions and manifests left out).',
    files,
  };
};

// ---------------------------------------------------------------------------
// Firefox's own media mochitests (dom/media/test): the clips Gecko's media
// stack is regression-tested against, many of them deliberately odd.
builders.gecko = async () => {
  const repo = 'mozilla-firefox/firefox';
  const t = await githubTree(repo, 'dom/media/test');
  const files = [];
  for (const f of t.files) {
    if (/^(dash|hls)\//.test(f.path)) continue; // manifests + segments: need a streaming server
    if (NON_MEDIA.test(f.path) || f.path.includes('^headers^')) continue;
    if (!/\.(webm|mp4|m4a|m4v|m4s|mp3|ogg|oga|ogv|opus|wav|flac|mkv|ivf|aac|adts|mov|ts|3gp|avi|wma|wmv|mpg|amr|caf)$/i.test(f.path)) continue;
    // Bare fMP4 fragments (no init segment) are only playable through MSE.
    if (/\.m4s$/i.test(f.path)) continue;
    const ext = f.path.split('.').pop().toLowerCase();
    files.push({ path: f.path, url: rawGithub(repo, t.commit, `dom/media/test/${f.path}`), bytes: f.bytes, folder: f.path.includes('/') ? f.path.split('/')[0] : ext });
  }
  return {
    name: 'gecko', title: 'Firefox media mochitest files (dom/media/test)',
    description: "The clips Firefox's media stack is tested with: its <video>/<audio> mochitests, including deliberately broken, truncated, odd-channel and unusual-container files. Grouped by extension.",
    homepage: 'https://searchfox.org/mozilla-central/source/dom/media/test', source: `https://github.com/${repo}/tree/${t.commit}/dom/media/test`,
    license: 'MPL-2.0 test tree; clips under their own free licences',
    fetched: `GitHub tree listing of dom/media/test at ${t.commit}; raw.githubusercontent.com per file.`,
    subset: 'every audio/video file, including crashtests/ and reftest/; left out: dash/ and hls/ (manifest + segment trees), bare .m4s fragments (MSE-only, no init segment) and ^headers^ files.',
    files,
  };
};

// ---------------------------------------------------------------------------
// Chromium's media/test/data: what Chrome's media pipeline tests decode.
builders.chromium = async () => {
  const repo = 'chromium/chromium';
  const t = await githubTree(repo, 'media/test/data');
  const files = [];
  for (const f of t.files) {
    if (NON_MEDIA.test(f.path)) continue;
    if (!/\.(webm|mp4|m4a|m4v|mp3|ogg|oga|ogv|opus|wav|flac|mkv|ivf|aac|adts|mov|ts|3gp|avi|h264|264|hevc|265|vvc|266|av1|obu|ac3|eac3|ec3|ac4|mpg|mp2|amr|caf|dts)$/i.test(f.path)) continue;
    const ext = f.path.split('.').pop().toLowerCase();
    files.push({ path: f.path, url: rawGithub(repo, t.commit, `media/test/data/${f.path}`), bytes: f.bytes, folder: f.path.includes('/') ? f.path.split('/')[0] : ext });
  }
  return {
    name: 'chromium', title: 'Chromium media test data (media/test/data)',
    description: "The files Chromium's media pipeline unit and browser tests decode: containers, codecs, raw elementary streams (h264/hevc/vvc/av1/ivf), odd sample rates, encrypted and broken files. Grouped by extension or subfolder.",
    homepage: 'https://source.chromium.org/chromium/chromium/src/+/main:media/test/data/', source: `https://github.com/${repo}/tree/${t.commit}/media/test/data`,
    license: 'BSD-3-Clause (Chromium); clips under their own free licences (see media/test/data/README.md)',
    fetched: `GitHub tree listing of media/test/data (the chromium/chromium mirror) at ${t.commit}; raw.githubusercontent.com per file.`,
    subset: 'every audio/video file (images, YUV/raw frame dumps, JSON/HTML and manifests left out).',
    files,
  };
};

// ---------------------------------------------------------------------------
// IETF CELLAR: the FLAC and Matroska conformance files.
builders['flac-test-files'] = async () => {
  const repo = 'ietf-wg-cellar/flac-test-files';
  const t = await githubTree(repo, '');
  const files = t.files.filter((f) => /\.flac$/i.test(f.path)).map((f) => ({ path: f.path, url: rawGithub(repo, t.commit, f.path), bytes: f.bytes }));
  return {
    name: 'flac-test-files', title: 'IETF CELLAR FLAC decoder test files',
    description: 'The FLAC conformance files of the IETF CELLAR working group: subset/ (streamable-subset files every decoder must play), uncommon/ (legal but unusual: odd sample rates, bit depths, block sizes, channel counts), faulty/ (invalid; a decoder should reject or recover).',
    homepage: 'https://github.com/ietf-wg-cellar/flac-test-files', source: `https://github.com/${repo}/tree/${t.commit}`,
    license: 'CC0 / public domain (see LICENSE.txt in the repo)',
    fetched: `GitHub tree listing at ${t.commit}; raw.githubusercontent.com per file.`, subset: 'all of them (about 310 MB).',
    files,
  };
};
builders['matroska-test-files'] = async () => {
  const repo = 'ietf-wg-cellar/matroska-test-files';
  const t = await githubTree(repo, '');
  const files = t.files.filter((f) => /\.mkv$/i.test(f.path)).map((f) => ({ path: f.path, url: rawGithub(repo, t.commit, f.path), bytes: f.bytes, folder: 'test_files' }));
  return {
    name: 'matroska-test-files', title: 'Matroska test suite (IETF CELLAR)',
    description: 'The eight official Matroska test files: basic, non-default timecodes, header stripping, live (no cues), multiple audio/subtitle tracks, EBML void/junk, lacing variants, and an audio-less/damaged file.',
    homepage: 'https://github.com/ietf-wg-cellar/matroska-test-files', source: `https://github.com/${repo}/tree/${t.commit}`,
    license: 'see the repo (test clips from Elephants Dream / Big Buck Bunny, CC-BY)',
    fetched: `GitHub tree listing at ${t.commit}; raw.githubusercontent.com per file.`, subset: 'all 8 files (about 185 MB).',
    files,
  };
};

// ---------------------------------------------------------------------------
// GStreamer: the media gst-integration-testsuites validates playback,
// seeking and track switching with (gstreamer.freedesktop.org/data/media/
// gst-integration-testsuite/defaults), plus the small/ and medium/ sample dirs.
async function apacheWalk(url, rel = '', out = [], pause = 250) {
  await sleep(pause);
  const html = await get(url);
  for (const m of html.matchAll(/<a href="([^"?#]+)">[^<]*<\/a>(?:<\/td><td[^>]*>|\s+)(\d{4}-\d\d-\d\d \d\d:\d\d|\d\d-\w{3}-\d{4} \d\d:\d\d)\s*(?:<\/td><td[^>]*>|\s+)\s*([\d.]+[KMG]?|-)/g)) {
    const [, href, , sz] = m;
    if (href.startsWith('/') || href.startsWith('..') || /^[a-z]+:/i.test(href)) continue;
    const name = decodeURIComponent(href);
    if (href.endsWith('/')) await apacheWalk(url + href, rel + name, out, pause);
    else out.push({ path: rel + name, url: url + href, bytes: sizeOf(sz) });
  }
  return out;
}
function sizeOf(s) {
  if (s === '-') return null;
  const m = /^([\d.]+)([KMG]?)$/.exec(s);
  return Math.round(+m[1] * ({ '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2]]));
}
builders.gstreamer = async () => {
  const base = 'https://gstreamer.freedesktop.org/data/media/';
  const all = await cached('gstreamer.json', async () => [
    ...(await apacheWalk(`${base}gst-integration-testsuite/defaults/`, 'defaults/')),
    ...(await apacheWalk(`${base}small/`, 'small/')),
    ...(await apacheWalk(`${base}medium/`, 'medium/')),
  ]);
  const files = all.filter((f) => !NON_MEDIA.test(f.path) && !/_reference_frames\/|imagesequences\/|\/bipbop\/|exMPD_|online-streams|\.rnd$|\.mp4\.\d+$/.test(f.path)
    && !/redirect\.mp4$/.test(f.path))
    .map((f) => ({ ...f, folder: f.path.startsWith('defaults/') ? f.path.split('/').slice(0, 2).join('/') : f.path.split('/')[0] }));
  return {
    name: 'gstreamer', title: 'GStreamer integration test-suite media',
    description: "The media GStreamer's gst-validate integration test suite plays, seeks and switches tracks in (defaults/: avi, flac, flv, h265, matroska, mp4/mov, mpeg-ps/ts, mxf, ogg, webm, asf), plus the older small/ and medium/ sample directories next to it.",
    homepage: 'https://gitlab.freedesktop.org/gstreamer/gstreamer/-/tree/main/subprojects/gst-integration-testsuites', source: base,
    license: 'mixed free sample media (Blender open movies, samples.mplayerhq.hu/multimedia.cx samples, GStreamer-generated clips)',
    fetched: 'Apache directory listings of gst-integration-testsuite/defaults/, small/ and medium/ (crawled one page at a time), files downloaded from there.',
    subset: 'every playable file; left out: per-frame reference PNGs and image sequences, HLS/DASH segment trees (bipbop, exMPD_BIP_TC1: need a streaming server), subtitles, scenarios, .media_info, redirect.mp4 and the noise file.',
    files,
  };
};

// ---------------------------------------------------------------------------
// VLC/Libav/MPlayer samples archive (streams.videolan.org/samples): the bug-
// report pile. 54 GB, and the README asks that anything over 1 GB be fetched at
// 50 kB/s, so this is a principled subset under 1 GB:
//  - V-codecs/, A-codecs/, game-formats/ are one subfolder per codec/format:
//    one file from each subfolder.
//  - every other top-level folder: up to 5 files, taken round-robin over its
//    subfolders so they differ.
//  - within a folder, candidates are media files of 16 kB-8 MB; the one whose
//    size is closest to 512 kB (log scale) wins: big enough to be a real clip,
//    small enough to be polite.
//  - archive/ (the upload inbox, indexed several ways): one file per
//    archive/container/<format>/.
//  - left out: fate-suite/ (that is FFmpeg FATE, measured separately),
//    drivers32/ (Windows codec DLLs), adaptive/ and playlists/ (need a
//    streaming server), RAR volumes/, JPEG-seq/ PNG-seq/ yuv/ raw-video/ (image
//    sequences and headerless raw frames), and non-media extensions.
builders['vlc-samples'] = async () => {
  const base = 'https://streams.videolan.org/samples/';
  const listing = await cached('vlc-samples-allsamples.json', async () => (await get(`${base}allsamples.txt`)).split('\n').filter((l) => l.startsWith('./')).map((l) => l.slice(2)));
  const EXCLUDE = new Set(['fate-suite', 'drivers32', 'adaptive', 'playlists', 'RAR volumes', 'JPEG-seq', 'PNG-seq', 'yuv', 'raw-video']);
  const PER_SUB = new Set(['V-codecs', 'A-codecs', 'game-formats']);
  const dirs = new Set();
  for (const p of listing) { const s = p.split('/'); for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join('/')); }
  // archive/ is the upload inbox shown under several views (all/, audio/, container/, ...);
  // only its container/<format>/ view is used, one file per container.
  const cand = listing.filter((p) => !dirs.has(p) && p.includes('/') && !EXCLUDE.has(p.split('/')[0]) && !NON_MEDIA.test(p) && !/\/\.|(^|\/)(\.htaccess|Thumbs\.db)$/i.test(p)
    && (!p.startsWith('archive/') || /^archive\/container\/[^/]+\/[^/]+$/.test(p)));
  // Sizes come from the directory listings of the folders that hold candidates.
  const sizes = await cached('vlc-samples-sizes.json', () => ({}));
  const needDirs = [...new Set(cand.map((p) => p.slice(0, p.lastIndexOf('/'))))].filter((d) => !(d in (sizes._dirs ?? {})));
  sizes._dirs ??= {};
  let n = 0;
  for (const d of needDirs) {
    await sleep(250);
    try {
      const html = await get(`${base}${d.split('/').map(encodeURIComponent).join('/')}/`);
      for (const m of html.matchAll(/<a href="([^"]+)">[^<]*<\/a>\s+\S+ \S+\s+(\d+|-)/g)) if (m[2] !== '-') sizes[`${d}/${decodeURIComponent(m[1])}`] = +m[2];
      sizes._dirs[d] = 1;
    } catch (e) { console.log(`  ${d}: ${e.message}`); }
    if (++n % 100 === 0) { console.log(`  listed ${n}/${needDirs.length} directories`); writeFileSync(`${lists}/vlc-samples-sizes.json`, JSON.stringify(sizes)); }
  }
  writeFileSync(`${lists}/vlc-samples-sizes.json`, JSON.stringify(sizes));
  const score = (p) => Math.abs(Math.log((sizes[p] ?? 1) / (512 * 1024)));
  const MAX = 8 * 1024 * 1024;
  const ok = (p) => sizes[p] >= 16 * 1024 && sizes[p] <= MAX;
  const groups = {};
  for (const p of cand) {
    const s = p.split('/');
    const top = s[0];
    const key = top === 'archive' ? `archive/container/${s[2]}` : PER_SUB.has(top) && s.length > 2 ? `${top}/${s[1]}` : top;
    (groups[key] ??= []).push(p);
  }
  const files = [];
  for (const [key, list] of Object.entries(groups).sort()) {
    const top = key.split('/')[0];
    const want = PER_SUB.has(top) || top === 'archive' ? 1 : 5;
    let pool = list.filter(ok);
    if (!pool.length) pool = list.filter((p) => sizes[p] > 0 && sizes[p] <= MAX);
    // Round-robin over subfolders (the level below `key`), best score first in each.
    const bySub = {};
    for (const p of pool.sort((a, b) => score(a) - score(b) || a.localeCompare(b))) {
      const rest = p.slice(key.length + 1);
      (bySub[rest.includes('/') ? rest.split('/')[0] : ''] ??= []).push(p);
    }
    const queues = Object.values(bySub).sort((a, b) => score(a[0]) - score(b[0]));
    const picked = [];
    while (picked.length < want && queues.some((q) => q.length)) for (const q of queues) if (q.length && picked.length < want) picked.push(q.shift());
    for (const p of picked) files.push({ path: p, url: base + p.split('/').map(encodeURIComponent).join('/'), bytes: sizes[p], folder: top });
  }
  return {
    fetchRate: '2M',
    name: 'vlc-samples', title: 'VLC samples archive (streams.videolan.org/samples), subset',
    description: 'The VideoLAN / Libav / MPlayer samples collection: the bug-report pile of real-world files in every container and codec VLC has had to deal with, many of them broken or odd on purpose.',
    homepage: 'https://streams.videolan.org/samples/', source: `${base}allsamples.txt`,
    license: 'no stated licence: samples collected from bug reports for testing; free to download for testing (00-README)',
    fetched: 'the file list is allsamples.txt; sizes from each folder\'s directory listing (one request at a time); files downloaded one at a time.',
    subset: 'the archive is 54 GB and its README asks that bulk fetches over 1 GB be rate-limited, so: one file per codec/format subfolder of V-codecs/, A-codecs/ and game-formats/, and up to 5 files (round-robin over subfolders) from every other top-level folder, and one per archive/container/<format>/ (archive/ is the upload inbox, shown under several views); each the 16 kB-8 MB media file whose size is closest to 512 kB. Left out: fate-suite/ (FFmpeg FATE, measured separately), drivers32/ (codec DLLs), adaptive/ and playlists/ (need a streaming server), RAR volumes/, JPEG-seq/, PNG-seq/, yuv/, raw-video/ (image sequences and headerless frames).',
    files,
  };
};

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const name of want.length ? want : Object.keys(builders)) {
  if (!builders[name]) { console.log(`no builder for ${name}`); continue; }
  write(await builders[name]());
}
