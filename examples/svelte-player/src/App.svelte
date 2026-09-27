<script>
  import VlcPlayer from './lib/VlcPlayer.svelte';
  import { getVLC } from './lib/vlc.js';

  const SUBS = /\.(srt|ass|ssa|vtt|sub|idx|smi|sami|usf|ttml|dfxp|txt|mpl|jss|rt|pjs|psb|scc|stl)$/i;

  let src = $state(null);
  let player = $state(null);
  let status = $state({ state: 'idle', time: 0, duration: 0, tracks: [], chapters: [] });
  let playlist = $state([]); // { name, files, thumb, info }
  let current = $state(-1);
  let tab = $state('tracks');
  let engine = $state(null);
  let stats = $state(null);
  let presets = $state([]);
  let dragging = $state(false);

  getVLC().then(async (vlc) => {
    engine = { version: vlc.version.version, startupMs: Math.round(vlc.startupMs) };
    presets = (await vlc.equalizerPresets()).presets;
  }).catch((e) => { engine = { error: e.message }; });

  /** Groups dropped files into playable items; subtitle files ride along with a video of the same name. */
  function addFiles(list) {
    const files = [...list];
    const subs = files.filter((f) => SUBS.test(f.name));
    const media = files.filter((f) => !SUBS.test(f.name));
    const stem = (n) => n.replace(/\.[^.]+$/, '').toLowerCase();
    const items = media.map((f) => ({ name: f.name, file: f, subs: subs.filter((s) => stem(s.name).startsWith(stem(f.name))) }));
    // Subtitles dropped alone attach to whatever is playing.
    if (!media.length && subs.length && player) {
      const idx = subs.find((s) => /\.idx$/i.test(s.name));
      player.addSubtitles(idx ? [idx, ...subs.filter((s) => s !== idx)] : subs[0]);
      return;
    }
    const start = playlist.length;
    playlist = [...playlist, ...items.map((i) => ({ ...i, thumb: null, info: null }))];
    if (current < 0) play(start);
    items.forEach((_, k) => describe(start + k));
  }

  async function describe(i) {
    const vlc = await getVLC();
    const item = playlist[i];
    try {
      item.info = await vlc.probe(item.file);
    } catch (e) {
      item.info = { error: e.message };
    }
    if (item.info?.tracks?.some((t) => t.type === 'video')) {
      try {
        const { blob } = await vlc.thumbnail(item.file, { position: 0.2, width: 320 });
        item.thumb = URL.createObjectURL(blob);
      } catch { /* no frame to show; the card keeps its placeholder */ }
    }
    playlist[i] = { ...item };
  }

  let subtitles = $state(null);

  function play(i) {
    current = i;
    const it = playlist[i];
    const idx = it.subs.find((s) => /\.idx$/i.test(s.name));
    // .idx names its .sub, so the pair is mounted together.
    subtitles = idx ? [idx, ...it.subs.filter((s) => s !== idx)] : it.subs[0] ?? null;
    src = it.file;
  }

  $effect(() => {
    if (!player) return;
    const off = player.on('ended', () => { if (current + 1 < playlist.length) play(current + 1); });
    const t = setInterval(async () => { if (tab === 'stats' && player) stats = await player.stats(); }, 1000);
    return () => { off(); clearInterval(t); };
  });

  const byType = (type) => status.tracks.filter((t) => t.type === type);
  const label = (t) => [t.name || t.description || t.language || t.id, t.codecName ?? t.codec].filter(Boolean).join(' · ');
  const selectedId = (type) => byType(type).find((t) => t.selected)?.id ?? '';
  function pickTrack(type, id) { id ? player.selectTrack(id) : player.disableTrack(type); }

  let adjust = $state({ brightness: 1, contrast: 1, saturation: 1, hue: 0, gamma: 1 });
  let adjusting = $state(false);
  function applyAdjust() { player?.setAdjust(adjusting ? adjust : null); }

  async function snapshot() {
    const blob = await player.snapshot();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${playlist[current]?.name ?? 'frame'}-${status.time.toFixed(2)}.png`;
    a.click();
  }
</script>

<svelte:window
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={(e) => { if (!e.relatedTarget) dragging = false; }}
  ondrop={(e) => { e.preventDefault(); dragging = false; addFiles(e.dataTransfer.files); }}
/>

<main class:dragging>
  <header>
    <h1><span class="cone">▲</span> libvlc-wasm</h1>
    <p>VLC 4's engine in your browser. Drop RealMedia, WMV, DivX AVI, VOBs, FLV, Bink, trackers, chiptunes, MKV with ASS subs…</p>
    <label class="open">
      Open files
      <input type="file" multiple onchange={(e) => addFiles(e.currentTarget.files)} />
    </label>
    <span class="engine">
      {#if engine?.error}<b class="err">{engine.error}</b>
      {:else if engine}libvlc {engine.version} · ready in {engine.startupMs} ms
      {:else}loading VLC…{/if}
    </span>
  </header>

  <section class="stage">
    <div class="left">
      <VlcPlayer {src} {subtitles} bind:player bind:status />
      {#if !src}
        <div class="empty">Drop media anywhere, or use <b>Open files</b>. Nothing is uploaded — VLC runs on this page.</div>
      {/if}
    </div>

    <aside>
      <nav>
        {#each ['tracks', 'effects', 'info', 'stats', 'keys'] as t}
          <button class:on={tab === t} onclick={() => (tab = t)}>{t}</button>
        {/each}
      </nav>

      {#if tab === 'tracks'}
        {#each [['video', 'Video'], ['audio', 'Audio'], ['text', 'Subtitles']] as [type, name]}
          <label>{name}
            <select value={selectedId(type)} onchange={(e) => pickTrack(type, e.currentTarget.value)} disabled={!byType(type).length}>
              <option value="">{byType(type).length ? 'off' : 'none'}</option>
              {#each byType(type) as t}<option value={t.id}>{label(t)}</option>{/each}
            </select>
          </label>
        {/each}
        <label class="file">Add subtitles…
          <input type="file" multiple onchange={(e) => addFiles(e.currentTarget.files)} />
        </label>
        {#if status.chapters.length}
          <h3>Chapters</h3>
          <ol class="chapters">
            {#each status.chapters as c, i}
              <li><button onclick={() => player.setChapter(i)}>{c.name || `Chapter ${i + 1}`} <small>{Math.floor(c.time / 60)}:{String(Math.floor(c.time % 60)).padStart(2, '0')}</small></button></li>
            {/each}
          </ol>
        {/if}
        <div class="row">
          <button onclick={() => player?.nextFrame()} disabled={!player}>Next frame</button>
          <button onclick={snapshot} disabled={!player}>Snapshot</button>
        </div>
        <label>Speed {status.rate?.toFixed(2)}×
          <input type="range" min="0.25" max="4" step="0.25" value={status.rate} oninput={(e) => (player.rate = +e.currentTarget.value)} />
        </label>
      {:else if tab === 'effects'}
        <label>Equalizer
          <select onchange={(e) => player?.setEqualizer(e.currentTarget.value === '' ? null : +e.currentTarget.value)}>
            <option value="">off</option>
            {#each presets as p, i}<option value={i}>{p}</option>{/each}
          </select>
        </label>
        <label>Deinterlace
          <select onchange={(e) => { const v = e.currentTarget.value; player?.setDeinterlace(v === 'off' ? false : v === 'auto' ? 'auto' : true, v); }}>
            {#each ['auto', 'off', 'yadif', 'yadif2x', 'blend', 'bob', 'linear', 'x', 'phosphor', 'ivtc'] as m}<option>{m}</option>{/each}
          </select>
        </label>
        <label>Aspect ratio
          <select onchange={(e) => player?.setAspectRatio(e.currentTarget.value || null)}>
            {#each ['', '16:9', '4:3', '1:1', '16:10', '2.21:1', '2.35:1', '5:4'] as a}<option value={a}>{a || 'source'}</option>{/each}
          </select>
        </label>
        <label class="check"><input type="checkbox" bind:checked={adjusting} onchange={applyAdjust} /> Picture adjustments</label>
        {#each Object.entries({ brightness: [0, 2], contrast: [0, 2], saturation: [0, 3], hue: [-180, 180], gamma: [0.01, 10] }) as [k, [min, max]]}
          <label class="slider">{k}
            <input type="range" {min} {max} step="0.01" bind:value={adjust[k]} oninput={applyAdjust} disabled={!adjusting} />
          </label>
        {/each}
        <label>Subtitle delay (s)
          <input type="number" step="0.1" value="0" onchange={(e) => player?.setSubtitleDelay(+e.currentTarget.value)} />
        </label>
        <label>Audio delay (s)
          <input type="number" step="0.05" value="0" onchange={(e) => player?.setAudioDelay(+e.currentTarget.value)} />
        </label>
      {:else if tab === 'info'}
        {@const info = playlist[current]?.info}
        {#if info?.error}<p class="err">{info.error}</p>
        {:else if info}
          <dl>
            {#if info.duration}<dt>duration</dt><dd>{info.duration.toFixed(2)} s</dd>{/if}
            {#each Object.entries(info.meta ?? {}) as [k, v]}<dt>{k}</dt><dd>{v}</dd>{/each}
          </dl>
          {#each info.tracks as t}
            <div class="track">
              <b>{t.type}</b> {t.codecName ?? t.codec}
              {#if t.width}· {t.width}×{t.height}{/if}{#if t.fps}· {t.fps.toFixed(3)} fps{/if}
              {#if t.rate}· {t.rate} Hz · {t.channels} ch{/if}{#if t.language}· {t.language}{/if}
            </div>
          {/each}
        {:else}<p>Nothing opened.</p>{/if}
      {:else if tab === 'stats'}
        {#if stats}
          <dl>
            {#each Object.entries(stats) as [k, v]}
              {#if typeof v === 'number'}<dt>{k}</dt><dd>{Number.isInteger(v) ? v : v.toFixed(3)}</dd>{/if}
            {/each}
          </dl>
        {:else}<p>Collecting…</p>{/if}
      {:else}
        <dl class="keys">
          <dt>space / k</dt><dd>play / pause</dd><dt>← →</dt><dd>seek 10 s (shift: 3 s)</dd>
          <dt>↑ ↓</dt><dd>volume</dd><dt>m</dt><dd>mute</dd><dt>f / dbl-click</dt><dd>fullscreen</dd>
          <dt>.</dt><dd>next frame</dd><dt>[ ] =</dt><dd>speed down / up / reset</dd>
        </dl>
      {/if}
    </aside>
  </section>

  {#if playlist.length}
    <ol class="playlist">
      {#each playlist as item, i}
        <li class:on={i === current}>
          <button onclick={() => play(i)}>
            {#if item.thumb}<img src={item.thumb} alt="" />{:else}<span class="ph">{item.info?.tracks?.some((t) => t.type === 'video') ? '…' : '♪'}</span>{/if}
            <span class="name">{item.name}</span>
            <small>{item.info?.tracks?.map((t) => t.codec?.trim()).join(' + ') ?? (item.info?.error ? 'unreadable' : 'probing…')}</small>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</main>

<style>
  main { max-width: 1280px; margin: 0 auto; padding: 16px; }
  main.dragging { outline: 3px dashed #ff8800; outline-offset: -8px; border-radius: 12px; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-bottom: 16px; }
  header h1 { margin: 0; font-size: 22px; }
  header p { margin: 0; color: var(--muted); flex: 1 1 320px; font-size: 13px; }
  .cone { color: #ff8800; }
  .open { background: #ff8800; color: #111; padding: 7px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  .open input, .file input { display: none; }
  .engine { font: 12px ui-monospace, monospace; color: var(--muted); }
  .stage { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; }
  .left { position: relative; }
  .empty { position: absolute; inset: 0 0 44px; display: grid; place-items: center; text-align: center; padding: 24px; color: #aaa; pointer-events: none; }
  aside { background: var(--panel); border-radius: 10px; padding: 12px; font-size: 13px; display: flex; flex-direction: column; gap: 10px; max-height: 70vh; overflow: auto; }
  nav { display: flex; gap: 4px; flex-wrap: wrap; }
  nav button { flex: 1; background: transparent; border: 1px solid var(--line); color: inherit; padding: 5px; border-radius: 6px; cursor: pointer; text-transform: capitalize; }
  nav button.on { background: #ff8800; color: #111; border-color: #ff8800; }
  label { display: flex; flex-direction: column; gap: 4px; }
  label.check { flex-direction: row; align-items: center; }
  label.slider { text-transform: capitalize; }
  label.file { cursor: pointer; color: #ff8800; }
  select, input[type=number] { background: var(--bg); color: inherit; border: 1px solid var(--line); border-radius: 6px; padding: 5px; }
  .row { display: flex; gap: 6px; }
  .row button, .chapters button { flex: 1; background: var(--bg); color: inherit; border: 1px solid var(--line); border-radius: 6px; padding: 6px; cursor: pointer; }
  .chapters { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
  .chapters button { width: 100%; text-align: left; display: flex; justify-content: space-between; }
  h3 { margin: 4px 0 0; font-size: 13px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; word-break: break-word; font-family: ui-monospace, monospace; font-size: 12px; }
  .track { padding: 6px 0; border-top: 1px solid var(--line); }
  .err { color: #ff8a80; }
  .playlist { list-style: none; padding: 0; margin: 16px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  .playlist button { width: 100%; background: var(--panel); border: 2px solid transparent; color: inherit; border-radius: 8px; padding: 6px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; text-align: left; }
  .playlist li.on button { border-color: #ff8800; }
  .playlist img, .ph { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 4px; background: #000; display: grid; place-items: center; font-size: 22px; color: #666; }
  .name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: var(--muted); font-size: 11px; }
  @media (max-width: 860px) { .stage { grid-template-columns: 1fr; } aside { max-height: none; } }
</style>
