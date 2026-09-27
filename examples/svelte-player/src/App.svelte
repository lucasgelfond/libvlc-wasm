<script>
  // The smallest useful libvlc-wasm app in Svelte: pick or drop a file, and
  // <VlcPlayer> plays it. The full demo, with playlists, effects and DVD menus,
  // is apps/player.
  import VlcPlayer from './lib/VlcPlayer.svelte';

  let src = $state(null);
  let player = $state(null);
  let status = $state({ state: 'idle', time: 0, duration: 0, tracks: [], chapters: [] });
  let dragging = $state(false);
</script>

<svelte:window
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={(e) => { if (!e.relatedTarget) dragging = false; }}
  ondrop={(e) => { e.preventDefault(); dragging = false; src = e.dataTransfer.files[0] ?? src; }}
/>

<main class:dragging>
  <label class="pick">
    Choose a file
    <input type="file" onchange={(e) => (src = e.currentTarget.files[0] ?? src)} />
  </label>
  <VlcPlayer {src} bind:player bind:status />
  {#if !src}<p class="hint">…or drop one anywhere. RealMedia, WMV, AVI, VOB, MKV, trackers: VLC plays it here.</p>{/if}
</main>

<style>
  main { max-width: 960px; margin: 0 auto; padding: 24px 16px; display: grid; gap: 12px; }
  main.dragging { outline: 2px dashed #ff8800; outline-offset: 8px; border-radius: 12px; }
  .pick { justify-self: start; background: #ff8800; color: #111; padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  .pick input { display: none; }
  .hint { margin: 0; color: #999; font-size: 14px; }
</style>
