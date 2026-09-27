# libvlc-wasm-sout

The stream-output build of [`libvlc-wasm`](../core): VLC's transcoder, muxers and
recording, in a separate 33 MB wasm (9.7 MB brotli) so apps that only play media never
download it.

```js
import { createVLC } from 'libvlc-wasm';
import sout from 'libvlc-wasm-sout';

const vlc = await createVLC({ engine: sout });
const webm = await vlc.transcode(file, { to: 'webm' });   // VP8 + Opus
const mp4 = await vlc.transcode(mkv, { to: 'mp4', remux: true });
```

It plays everything the default engine plays, so an app that needs both can load just this one.
GPL-2.0-or-later, like the core package.
