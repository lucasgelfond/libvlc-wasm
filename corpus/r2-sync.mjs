// Keeps the test media in the R2 bucket libvlc-wasm-media, so a fresh machine
// (or CI) gets every corpus file from one place instead of dozens of hosts:
//   node corpus/r2-sync.mjs push [dirs...]   upload corpus/media, corpus/fate, corpus/suites
//   node corpus/r2-sync.mjs pull [dirs...]   download what is missing locally
// Keys mirror the paths under corpus/ ("media/realmedia/x.rm", "fate/h264/y.mp4").
// Uses wrangler's R2 commands, so it needs `npx wrangler login` with R2 access.
// Pushed files are remembered in corpus/.r2-state.json (size + mtime) and skipped.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { root } from '../tests/lib/browser.mjs';

const run = promisify(execFile);
const BUCKET = 'libvlc-wasm-media';
const [mode = 'push', ...dirsArg] = process.argv.slice(2);
const dirs = dirsArg.length ? dirsArg : ['media', 'fate', 'suites'];
const corpus = join(root, 'corpus');
const statePath = join(corpus, '.r2-state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state));

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
      if (++done % 100 === 0) { console.log(`  ${done}/${items.length}`); save(); }
    }
  }));
}
const wrangler = (args) => run('npx', ['wrangler', 'r2', 'object', ...args, '--remote'], { cwd: root, maxBuffer: 1 << 26 });

if (mode === 'push') {
  const files = dirs.flatMap((d) => walk(join(corpus, d)));
  const todo = files.filter((f) => {
    const st = statSync(f), key = relative(corpus, f);
    return state[key]?.size !== st.size || state[key]?.mtime !== st.mtimeMs;
  });
  console.log(`push: ${todo.length} of ${files.length} files to upload`);
  let failed = 0;
  await pool(todo, 8, async (f) => {
    const key = relative(corpus, f), st = statSync(f);
    try {
      await wrangler(['put', `${BUCKET}/${key}`, '--file', f]);
      state[key] = { size: st.size, mtime: st.mtimeMs };
    } catch (e) {
      failed++;
      console.warn(`  ${key}: ${String(e.stderr || e.message).split('\n').find((l) => /ERROR|error/.test(l)) ?? 'failed'}`);
    }
  });
  save();
  console.log(`push: done, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
} else if (mode === 'pull') {
  // The state file lists what the bucket holds (it is committed alongside the
  // manifest by whoever pushes); fetch whatever is missing here.
  const keys = Object.keys(state).filter((k) => dirs.some((d) => k.startsWith(`${d}/`)) && !existsSync(join(corpus, k)));
  console.log(`pull: ${keys.length} files missing locally`);
  await pool(keys, 8, async (key) => {
    mkdirSync(dirname(join(corpus, key)), { recursive: true });
    await wrangler(['get', `${BUCKET}/${key}`, '--file', join(corpus, key)]);
  });
  console.log('pull: done');
} else {
  console.error('usage: node corpus/r2-sync.mjs push|pull [media fate suites]');
  process.exitCode = 2;
}
