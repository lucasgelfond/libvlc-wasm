// The stream-output build of libvlc-wasm, for createVLC({ engine }):
//   import { createVLC } from 'libvlc-wasm';
//   import sout from 'libvlc-wasm-sout';
//   const vlc = await createVLC({ engine: sout });
//   const webm = await vlc.transcode(file, { to: 'webm' });
// Both URLs are written as `new URL(..., import.meta.url)` so bundlers (Vite,
// webpack 5, esbuild with a URL plugin) emit the files next to your app.
export default {
  name: 'sout',
  moduleUrl: new URL('./wasm/libvlc-sout.js', import.meta.url).href,
  wasmUrl: new URL('./wasm/libvlc-sout.wasm', import.meta.url).href,
};
