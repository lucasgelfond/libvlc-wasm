<!--
  <VlcPlayer src={file} subtitles={srtFile} bind:player bind:status />

  A canvas driven by libvlc-wasm, with optional built-in controls. `src` is a
  File, File[] (opened together, first one played), Blob, bytes or URL;
  changing it opens the new source. `subtitles` is loaded alongside it (a
  File[] such as [.idx, .sub] is mounted together). `status` mirrors the
  player's state for your own UI; `player` is the full libvlc-wasm Player.
-->
<script>
  import { onDestroy } from 'svelte';
  import { getVLC } from './vlc.js';

  let {
    src = null,
    subtitles = null,
    autoplay = true,
    fit = 'contain',
    controls = true,
    options = [],
    player = $bindable(null),
    status = $bindable({ state: 'idle', time: 0, duration: 0, volume: 1, muted: false, rate: 1, tracks: [], chapters: [] }),
    onerror = (e) => console.error(e),
  } = $props();

  let canvas;
  let box;
  let raf = 0;
  let offs = [];
  let seeking = $state(false);
  let seekValue = $state(0);
  let loadError = $state(null);

  async function ensurePlayer() {
    if (player) return player;
    const vlc = await getVLC();
    const p = await vlc.createPlayer({ canvas, fit });
    const sync = () => {
      status = {
        ...status,
        state: p.state,
        duration: p.duration,
        volume: p.volume,
        muted: p.muted,
        rate: p.rate,
        tracks: p.tracks,
        chapters: p.chapters?.chapters ?? [],
      };
    };
    offs = ['statechange', 'durationchange', 'tracks', 'chapters', 'volumechange', 'ratechange'].map((e) => p.on(e, sync));
    offs.push(p.on('error', (e) => { loadError = e.message; onerror(e); }));
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!seeking) status.time = p.currentTime;
    };
    raf = requestAnimationFrame(tick);
    player = p;
    return p;
  }

  $effect(() => {
    const source = src;
    const subs = subtitles;
    if (!source) return;
    loadError = null;
    ensurePlayer()
      .then((p) => p.open(source, { autoplay, options, subtitles: subs ?? undefined }))
      .catch((e) => { loadError = e.message; onerror(e); });
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    offs.forEach((off) => off());
    player?.destroy();
  });

  const fmt = (s) => {
    if (!Number.isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
  };

  function onKey(e) {
    if (!player || e.target.closest('input, select, textarea')) return;
    const k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); player.togglePause(); }
    else if (k === 'ArrowRight') player.seek(player.currentTime + (e.shiftKey ? 3 : 10));
    else if (k === 'ArrowLeft') player.seek(player.currentTime - (e.shiftKey ? 3 : 10));
    else if (k === 'ArrowUp') { e.preventDefault(); player.volume = Math.min(2, player.volume + 0.05); }
    else if (k === 'ArrowDown') { e.preventDefault(); player.volume = Math.max(0, player.volume - 0.05); }
    else if (k === 'm') player.muted = !player.muted;
    else if (k === 'f') fullscreen();
    else if (k === '.') player.nextFrame();
    else if (k === '[') player.rate = Math.max(0.25, +(player.rate - 0.25).toFixed(2));
    else if (k === ']') player.rate = Math.min(4, +(player.rate + 0.25).toFixed(2));
    else if (k === '=') player.rate = 1;
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else box?.requestFullscreen?.();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="vlc" bind:this={box}>
  <canvas bind:this={canvas} ondblclick={fullscreen} onclick={() => player?.togglePause()}></canvas>

  {#if loadError}
    <div class="overlay error">{loadError}</div>
  {:else if status.state === 'opening'}
    <div class="overlay">opening…</div>
  {/if}

  {#if controls}
    <div class="bar">
      <button onclick={() => player?.togglePause()} aria-label="play/pause" disabled={!player}>
        {#if status.state === 'playing'}<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>{:else}<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z"/></svg>{/if}
      </button>
      <span class="time">{fmt(seeking ? seekValue : status.time)}</span>
      <input
        class="seek" type="range" min="0" step="0.01"
        max={status.duration || 1}
        value={seeking ? seekValue : status.time}
        disabled={!status.duration}
        oninput={(e) => { seeking = true; seekValue = +e.currentTarget.value; }}
        onchange={async (e) => { await player?.seek(+e.currentTarget.value); seeking = false; }}
      />
      <span class="time">{fmt(status.duration)}</span>
      <button onclick={() => player && (player.muted = !player.muted)} aria-label="mute">
        {#if status.muted || status.volume === 0}<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.3 3 2.85-2.85-1.3-1.3L15 10.7l-2.85-2.85-1.3 1.3L13.7 12l-2.85 2.85 1.3 1.3L15 13.3l2.85 2.85 1.3-1.3L16.3 12Z"/></svg>{:else}<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12Zm-2.5-9.23v2.06a7 7 0 0 1 0 14.34v2.06a9 9 0 0 0 0-18.46Z"/></svg>{/if}
      </button>
      <input class="vol" type="range" min="0" max="2" step="0.01" value={status.volume}
        oninput={(e) => player && (player.volume = +e.currentTarget.value)} />
      <button onclick={fullscreen} aria-label="fullscreen"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/></svg></button>
    </div>
  {/if}
</div>

<style>
  .vlc { position: relative; background: #000; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  canvas { width: 100%; flex: 1; min-height: 0; aspect-ratio: 16 / 9; display: block; cursor: pointer; }
  :global(.vlc:fullscreen) canvas { aspect-ratio: auto; }
  .overlay { position: absolute; inset: 0 0 44px; display: grid; place-items: center; color: #ccc; font-size: 14px; pointer-events: none; }
  .overlay.error { color: #ff8a80; padding: 24px; text-align: center; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #111; color: #ddd; font: 12px/1 ui-monospace, monospace; }
  .bar button { background: none; border: 0; color: inherit; font-size: 15px; cursor: pointer; width: 28px; }
  .bar button:disabled { opacity: .4; }
  .seek { flex: 1; accent-color: #ff8800; }
  .vol { width: 80px; accent-color: #ff8800; }
  .time { min-width: 44px; text-align: center; }
</style>
