/**
 * The benchmark results the /benchmarks page renders, straight from the JSON
 * the scripts write: bench/results/results.json (bench/run.mjs),
 * bench/wasi/results.json (bench/wasi/run.mjs), bench/compare/*-results.json and
 * ports-matrix.json (the other web VLC ports), bench/compare/packages.json.
 */
import speed from "../../../../bench/results/results.json";
import wasi from "../../../../bench/wasi/results.json";
import packagesJson from "../../../../bench/compare/packages.json";

type Run = { fps: number; frames: number; firstFrameMs?: number };
type SpeedResult = {
  clip: string;
  runs: Record<string, Partial<Record<string, Run>>>;
};
export type Speed = {
  date: string;
  machine: { cpu: string; cores: number; memGB: number; os: string };
  browser: string;
  size: Record<string, { raw: number; gzip: number; brotli: number }>;
  startup: { cold: { readyMs: number }[]; warm: { readyMs: number }[] };
  showdown: {
    vlcFirstFrameMs: number;
    ffmpegLoadMs: number;
    ffmpegWasm_first10s_Ms: number;
    ffmpegWasm_whole_Ms: number;
  };
  results: SpeedResult[];
};
export const SPEED = speed as unknown as Speed;

export const SPEED_TOOLS: [key: string, label: string][] = [
  ["ffmpegNative", "FFmpeg (native)"],
  ["vlcNative", "VLC desktop (native)"],
  ["libvlcWasm", "libvlc-wasm, software"],
  ["libvlcWebCodecs", "libvlc-wasm + WebCodecs"],
  ["ffmpegWasm", "ffmpeg.wasm"],
];

const CODEC: Record<string, string> = {
	av1: 'AV1', h264: 'H.264', hevc: 'HEVC', hevc10: 'HEVC 10-bit', vp9: 'VP9', mjpeg: 'Motion JPEG', mpeg2: 'MPEG-2',
	mpeg4asp: 'MPEG-4 ASP', msmpeg4: 'MS-MPEG4 (DivX 3)', vp8: 'VP8', prores: 'ProRes', dv: 'DV', yuv444: 'H.264 4:4:4'
};
/** "mpeg2_1280x720.mpg" -> "MPEG-2, 720p"; 1080p, the default, is not named. */
export const codecOf = (clip: string) => {
	const [name, size = ''] = clip.replace(/\.[^.]+$/, '').split('_');
	const label = CODEC[name] ?? name;
	const h = /(\d+)x(\d+)/.exec(size)?.[2] ?? /(\d+)p/.exec(size)?.[1];
	return h && h !== '1080' ? `${label}, ${h}p` : label;
};

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

type WasiRow = {
  runtime: string;
  label: string;
  variant: string;
  clips: Record<string, { median_fps: number; slowdown: number } | undefined>;
};
export const WASI = wasi as unknown as {
  meta: { date: string; host: string; versions: Record<string, string> };
  clips: { short: string; codec: string; file: string }[];
  results: WasiRow[];
};

export type Package = {
  name: string;
  version?: string;
  url: string;
  what: string;
  playsInPage: string;
  formats: string;
  subtitles: string;
  size: string;
};
export const PACKAGES = (packagesJson as { packages: Package[] }).packages;

/** The other web VLC ports, measured on the curated corpus. */
type PortSummary = {
  videoShown?: string;
  audible?: string;
  medianFirstFrameMs?: number;
  crashed?: number;
};
type PortFile = {
  port?: string;
  engine?: string;
  build?: string;
  summary?: PortSummary;
  date?: string;
  results?: unknown[];
};
const portFiles = import.meta.glob<PortFile>(
  "../../../../bench/compare/*-results.json",
  { eager: true, import: "default" },
);
export const PORTS = Object.entries(portFiles)
  .map(([path, d]) => ({
    key: path.split("/").pop()!.replace("-results.json", ""),
    ...d,
  }))
  .filter((d) => d.summary)
  .sort((a, b) => (a.port ?? a.key).localeCompare(b.port ?? b.key));

/** Present once the ports × browsers run has written it. */
const matrixFiles = import.meta.glob(
  "../../../../bench/compare/ports-matrix.json",
  { eager: true, import: "default" },
);
export const PORTS_MATRIX = Object.values(matrixFiles)[0] as
  | {
      tools: { key: string; label: string; notes?: string; url?: string }[];
      engines: string[];
      samples: {
        id: string;
        results: Record<string, Record<string, { plays: boolean }>>;
      }[];
    }
  | undefined;
