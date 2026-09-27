# Corpus results

Generated 2026-09-27T06:25:43.429Z by `node tests/verify-corpus.mjs`. Native = the browser's own
`<video>`/`<audio>` reached `loadeddata`. libvlc-wasm = played in headless Chromium with frames that have
content (pixel variance) and/or audible output (RMS through an AnalyserNode).

| sample | category | native chromium | libvlc-wasm | first frame | notes |
|---|---|---|---|---|---|
| Dolby TrueHD Atmos (8ch) | rare-and-surround-audio | no | ❌ FAIL |  | no audio |
