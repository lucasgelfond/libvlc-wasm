import type { Player, Source, SourceGroup, VLC, VLCOptions } from './index.js';

/**
 * <vlc-player>: a drop-in for <video>. Attributes: src, controls, autoplay, muted,
 * volume, fit. Events: play, playing, pause, ended, error, timeupdate,
 * durationchange, loadedmetadata, volumechange, ratechange, loadstart.
 */
export declare class VlcPlayerElement extends HTMLElement {
  /** The full libvlc-wasm Player, once created. */
  readonly player: Player | null;
  /** Resolves with the Player once the engine is up. */
  readonly ready: Promise<Player>;
  src: string | Source | SourceGroup;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  readonly autoplay: boolean;
  play(): Promise<void>;
  pause(): Promise<unknown>;
  stop(): Promise<unknown>;
}

/** The engine every <vlc-player> on the page shares (created on first use). */
export declare function sharedVLC(opts?: VLCOptions): Promise<VLC>;

declare global {
  interface HTMLElementTagNameMap {
    'vlc-player': VlcPlayerElement;
  }
}
