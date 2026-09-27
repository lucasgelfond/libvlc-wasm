// Minimal WASI preview1 host for Node (node:wasi) and Bun (its node:wasi shim).
// Usage: node wasi-host.mjs <module.wasm> <host dir to preopen as /media> <guest path>
// Compilation (WebAssembly.compile) happens before _start, so it is outside the
// decode loop that decode.c times itself.
import { readFileSync } from 'node:fs';
import { WASI } from 'node:wasi';

const [wasmPath, hostDir, ...args] = process.argv.slice(2);
const wasi = new WASI({
  version: 'preview1',
  args: ['decode', ...args],
  env: {},
  preopens: { '/media': hostDir },
  returnOnExit: true,
});
const mod = await WebAssembly.compile(readFileSync(wasmPath));
const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
const code = wasi.start(inst);
process.exitCode = code ?? 0;
