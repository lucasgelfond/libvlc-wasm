// Type declarations for @libvlc-wasm/core.

export type Source = File | Blob | ArrayBuffer | ArrayBufferView | string | URL;
/** Files that refer to each other by name (e.g. `.idx` + `.sub`) are mounted together; the first is opened. */
export type SourceGroup = Blob[];

export interface VLCOptions {
  /** pthreads started up front (default 20). */
  threads?: number;
  /** FFmpeg threads per decoder (default min(cores, 4)). */
  decoderThreads?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'off';
  /** Extra libvlc_new() arguments, e.g. `['--deinterlace=1']`. */
  args?: string[];
  /** Where libvlc.wasm is served, if not next to libvlc.js. */
  wasmUrl?: string | URL;
  /** Override the worker script; bundlers normally resolve it. */
  workerUrl?: string | URL;
  /** Font files for subtitles; the first is the default face. `false` = none. Default: bundled Noto Sans. */
  fonts?: (string | URL)[] | false;
  /** 'sout' loads the build with VLC's stream output (transcode/remux/record). */
  variant?: 'default' | 'sout';
  /** Load the engine from this libvlc*.js URL instead (self-hosting). */
  moduleUrl?: string | URL;
  /** A General MIDI SoundFont (.sf2); needed to play .mid files. */
  soundfont?: string | URL;
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text' | 'unknown';
  /** VLC fourcc, e.g. "h264", "WMV3", "RV40", "cook". */
  codec: string;
  /** Human-readable codec name, e.g. "RealVideo 9/10 (4.0)". */
  codecName?: string;
  fourcc?: string;
  name?: string | null;
  language?: string | null;
  description?: string | null;
  selected: boolean;
  bitrate?: number;
  profile?: number;
  level?: number;
  width?: number;
  height?: number;
  sarNum?: number;
  sarDen?: number;
  fps?: number;
  orientation?: number;
  projection?: number;
  channels?: number;
  rate?: number;
  encoding?: string | null;
}

export interface MediaInfo {
  status?: number;
  mrl: string;
  /** Seconds. */
  duration?: number;
  meta: Partial<Record<
    'title' | 'artist' | 'genre' | 'copyright' | 'album' | 'trackNumber' | 'description' | 'rating' | 'date'
    | 'setting' | 'url' | 'language' | 'nowPlaying' | 'publisher' | 'encodedBy' | 'artworkUrl' | 'trackId'
    | 'trackTotal' | 'director' | 'season' | 'episode' | 'showName' | 'actors' | 'albumArtist' | 'discNumber'
    | 'discTotal' | 'compilation', string>>;
  tracks: Track[];
  stats?: MediaStats;
}

export interface MediaStats {
  readBytes: number; inputBitrate: number; demuxReadBytes: number; demuxBitrate: number;
  demuxCorrupted: number; demuxDiscontinuity: number; decodedVideo: number; decodedAudio: number;
  displayedPictures: number; latePictures: number; lostPictures: number;
  playedAudioBuffers: number; lostAudioBuffers: number;
}

export interface PlayerStats extends Partial<MediaStats> {
  state: number; time: number; length: number; position: number; rate: number; volume: number;
  muted: boolean; seekable: boolean; pausable: boolean; chapter: number; title: number;
  audioDropped: number; audioUnderruns: number; framesDisplayed: number;
  /** Frames the page actually uploaded and drew. */
  framesDrawn: number;
  audioFramesPlayed: number;
}

export type PlayerState = 'idle' | 'opening' | 'playing' | 'paused' | 'stopped' | 'stopping' | 'error';

export interface Chapters {
  titles: { name: string | null; duration: number; menu: boolean }[];
  chapters: { name: string | null; time: number; duration: number }[];
}

export interface PlayerEvents {
  statechange: PlayerState;
  opening: undefined; playing: undefined; paused: undefined; stopped: undefined; stopping: undefined;
  ended: undefined;
  error: Error;
  timeupdate: number;
  durationchange: number;
  tracks: Track[];
  chapters: Chapters;
  chapterchange: { title: number; chapter: number; name: string | null };
  buffering: number;
  ratechange: number;
  volumechange: { volume: number; muted: boolean };
  audiolevel: { peak: number; rms: number };
  capabilities: { seekable: boolean; pausable: boolean };
  meta: undefined; parsed: undefined; mediachange: undefined; vout: number; destroy: undefined;
  recording: { recording: boolean; path: string | null };
  programs: undefined;
  framestep: number;
}

declare class Emitter<E> {
  on<K extends keyof E>(type: K, fn: (detail: E[K]) => void): () => void;
  off<K extends keyof E>(type: K, fn: (detail: E[K]) => void): void;
  once<K extends keyof E>(type: K): Promise<E[K]>;
}

export interface OpenOptions {
  /** Default true. */
  autoplay?: boolean;
  /** Seconds. */
  startTime?: number;
  subtitles?: Source | SourceGroup;
  /** VLC media options, e.g. `[':sub-track=0', ':no-audio']`. */
  options?: string[];
  /** File name to give bytes, so VLC can use the extension. */
  name?: string;
}

export declare class Player extends Emitter<PlayerEvents> {
  readonly id: number;
  readonly state: PlayerState;
  /** Seconds; 0 until known. */
  readonly duration: number;
  readonly tracks: Track[];
  readonly chapters: Chapters;
  readonly seekable: boolean;
  readonly paused: boolean;
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly audioContext?: AudioContext;
  /** Latest output level over the last ~100 ms. */
  readonly audioLevel: { peak: number; rms: number };
  /** Seconds, interpolated between VLC's updates. Setting it seeks. */
  currentTime: number;
  /** Playback rate (VLC time-stretches audio). */
  rate: number;
  /** 0..2 (above 1 is VLC's boost). */
  volume: number;
  muted: boolean;

  attach(canvas: HTMLCanvasElement | OffscreenCanvas, opts?: { fit?: 'contain' | 'cover' | 'fill' }): void;
  open(source: Source | SourceGroup, opts?: OpenOptions): Promise<this>;
  play(): Promise<void>;
  pause(): Promise<unknown>;
  togglePause(): Promise<unknown>;
  stop(): Promise<unknown>;
  seek(seconds: number, opts?: { fast?: boolean }): Promise<unknown>;
  seekToPosition(pos: number, opts?: { fast?: boolean }): Promise<unknown>;
  nextFrame(): Promise<unknown>;
  selectTrack(track: string | Track): Promise<unknown>;
  disableTrack(type: 'audio' | 'video' | 'text'): Promise<unknown>;
  addSubtitles(source: Source | SourceGroup, opts?: { select?: boolean }): Promise<void>;
  addAudioTrack(source: Source, opts?: { select?: boolean }): Promise<void>;
  setSubtitleDelay(seconds: number): Promise<unknown>;
  setAudioDelay(seconds: number): Promise<unknown>;
  setChapter(index: number): Promise<unknown>;
  setTitle(index: number): Promise<unknown>;
  setAspectRatio(ratio: string | null): Promise<unknown>;
  setDeinterlace(enabled: boolean | 'auto', mode?: string): Promise<unknown>;
  setAdjust(values: { brightness?: number; contrast?: number; saturation?: number; hue?: number; gamma?: number } | null): Promise<unknown>;
  setEqualizer(preset: string | number | null, opts?: { preamp?: number }): Promise<unknown>;
  /** Plays `source` right after the current media ends, with no gap. `null` clears. */
  queue(source: Source | SourceGroup | null, opts?: { name?: string }): Promise<unknown>;
  /** Loops between two times (seconds); `null` stops looping. */
  setABLoop(a: number | null, b?: number): Promise<unknown>;
  programs(): Promise<{ id: number; name: string | null; selected: boolean; scrambled: boolean }[]>;
  selectProgram(id: number): Promise<unknown>;
  previousFrame(): Promise<unknown>;
  navigate(action: 'activate' | 'up' | 'down' | 'left' | 'right' | 'popup'): Promise<unknown>;
  setTeletext(page: number, opts?: { transparent?: boolean }): Promise<unknown>;
  setMarquee(m: { text: string; color?: number; opacity?: number; position?: number; size?: number;
    timeout?: number; x?: number; y?: number; refresh?: number } | null): Promise<unknown>;
  setLogo(l: { image: Blob | File | string; x?: number; y?: number; opacity?: number; position?: number } | null): Promise<unknown>;
  setStereoMode(mode: 'stereo' | 'reverse' | 'left' | 'right' | 'dolby' | 'mono'): Promise<unknown>;
  setSubtitleScale(scale: number): Promise<unknown>;
  setCrop(c: { ratio: [number, number] } | { window: [number, number, number, number] } |
    { border: [number, number, number, number] } | null): Promise<unknown>;
  /** Needs a build with sout (`vlc.features.sout`). */
  startRecording(): Promise<void>;
  stopRecording(): Promise<File>;
  info(): Promise<MediaInfo | null>;
  stats(): Promise<PlayerStats>;
  snapshot(type?: string, quality?: number): Promise<Blob>;
  destroy(): Promise<void>;
}

export interface VLCEvents {
  log: { level: 'debug' | 'info' | 'warn' | 'error'; message: string };
  error: ErrorEvent;
}

export declare class VLC extends Emitter<VLCEvents> {
  readonly version: { version: string; compiler: string; changeset: string };
  /** What this build can do; `sout` = transcoding, remuxing, recording. */
  readonly features: { sout: boolean };
  /** createVLC() to ready, in milliseconds. */
  readonly startupMs: number;
  createPlayer(opts?: {
    canvas?: HTMLCanvasElement | OffscreenCanvas;
    fit?: 'contain' | 'cover' | 'fill';
    /** false plays silently without an AudioContext. */
    audio?: boolean;
    audioContext?: AudioContext;
    audioDestination?: AudioNode;
    /** Hold a screen wake lock while playing (default true). */
    keepAwake?: boolean;
  }): Promise<Player>;
  /** Container, tracks and metadata, without playing. */
  probe(source: Source | SourceGroup): Promise<MediaInfo>;
  /** One decoded frame as a JPEG. */
  thumbnail(source: Source | SourceGroup, opts?: {
    time?: number; position?: number; width?: number; height?: number; crop?: boolean; fast?: boolean;
  }): Promise<{ blob: Blob; width: number; height: number }>;
  equalizerPresets(): Promise<{ presets: string[]; bands: number[] }>;
  /**
   * Converts media with VLC's stream output (needs `variant: 'sout'`).
   * Defaults: webm/mkv VP8 + Opus, mp4 MPEG-4 Part 2 + AAC, ogg Opus,
   * ts MPEG-2 + MP2, wav PCM. WebM is the one every browser plays back.
   */
  transcode(source: Source | SourceGroup, opts?: {
    /** Container; default 'webm'. */
    to?: 'webm' | 'mkv' | 'mp4' | 'ogg' | 'ts' | 'wav' | 'mp3';
    /** Copy the streams as they are into the new container (no re-encoding). */
    remux?: boolean;
    /** VLC fourcc of the video encoder ('VP80', 'mp4v', 'mp2v'…), or false to drop video. Throws if there is no such encoder. */
    video?: string | false;
    /** VLC fourcc of the audio encoder ('opus', 'vorb', 'mp4a', 'mp3', 'flac', 's16l'…), or false to drop audio. */
    audio?: string | false;
    /** kbit/s; default 2000. */
    videoBitrate?: number;
    /** kbit/s; default 128. */
    audioBitrate?: number;
    /** Scale to this width (height follows the aspect ratio unless given). */
    width?: number;
    height?: number;
    /** Base name of the output file. */
    name?: string;
    /** 0..1, about 4 times a second, and 1 when the file is ready. */
    onProgress?: (fraction: number) => void;
  }): Promise<File>;
  setLogLevel(level: VLCOptions['logLevel']): Promise<unknown>;
  destroy(): Promise<void>;
}

export declare function createVLC(opts?: VLCOptions): Promise<VLC>;
