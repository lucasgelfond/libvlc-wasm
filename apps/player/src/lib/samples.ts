/**
 * One-click samples for the empty player: files no browser plays by itself,
 * shipped with the app in static/samples/ (see scripts/samples.mjs).
 */
export type Sample = {
  /** For links: /?sample=<id>. */
  id: string;
  /** The file format, short: what the sample menu lists. */
  label: string;
  /** What the gallery card shows: a thumbnail (video, disc) or a tile (audio). */
  kind: "video" | "audio" | "disc";
  /** Files to open together (a DVD folder is several); the first is the one shown. */
  files: string[];
  title: string;
  /** What it is, in plain English. */
  plain: string;
  /** What it is, technically: container and codecs. */
  format: string;
  /** Something to try once it is open. */
  hint?: string;
};

export const SAMPLES: Sample[] = [
  {
    id: "dvd",
    label: "DVD disc image (.iso)",
    kind: "disc",
    files: ["showcase.iso"],
    title: "A DVD, with its menus",
    plain:
      "A disc image of a small DVD: a main menu, a chapter menu, a feature in three chapters with English and Spanish audio and subtitles, and an extra. Click the buttons, or use the arrow keys and Enter.",
    format:
      "DVD-Video ISO 9660 · MPEG-2 video + AC-3 audio (2 languages) · subpicture subtitles and menu buttons",
    hint: "Click a button on the menu",
  },
  {
    id: "bluray",
    label: "Blu-ray disc image (.iso)",
    kind: "disc",
    files: ["bluray.iso"],
    title: "A Blu-ray",
    plain:
      "A disc image of a small, unencrypted Blu-ray: one playlist in three chapters, read by libbluray the way desktop VLC reads a disc.",
    format: "BDMV UDF image · H.264 video + AC-3 audio · chapters",
  },
  {
    id: "c64",
    label: "Commodore 64 music (.sid)",
    kind: "audio",
    files: ["chiptune-tracker-midi/c64-sid-rob-hubbard-commando.sid"],
    title: "Rob Hubbard, Commando (1985)",
    plain:
      "The C64's music was a program for its SID sound chip: this runs that program on an emulated 6510 CPU and SID.",
    format: "PSID file · MOS 6581 SID emulation (libsidplay2)",
  },
  {
    id: "genesis",
    label: "Sega Genesis music (.vgz)",
    kind: "audio",
    files: ["chiptune-tracker-midi/sega-genesis-vgz-gzip-vgm.vgz"],
    title: "Sega Genesis music",
    plain:
      "A log of every write to the Genesis's Yamaha FM chip, replayed through an emulation of it. Gzipped, as these files are passed around.",
    format: "VGM, gzipped (.vgz) · YM2612 + SN76489 emulation (game-music-emu)",
  },
  {
    id: "amiga",
    label: "Amiga module (.mod)",
    kind: "audio",
    files: [
      "chiptune-tracker-midi/axelf-mod-15-sample-soundtracker-no-m-k-.mod",
    ],
    title: "'Axel F' as an Amiga module",
    plain:
      "A song file from the original Amiga Soundtracker (1987): fifteen instrument samples and a score, mixed live.",
    format: "15-sample Soundtracker module (.mod) · libmodplug",
  },
  {
    id: "nes",
    label: "NES music (.nsf)",
    kind: "audio",
    files: ["chiptune-tracker-midi/nes-nsf-tetris-gb-rip.nsf"],
    title: "Tetris, on the NES sound chip",
    plain:
      "NES music as the game's own 6502 code, run against an emulated 2A03 sound chip.",
    format: "NES Sound Format (.nsf) · 2A03 emulation (game-music-emu)",
  },
  {
    id: "realmedia",
    label: "RealMedia (.rm)",
    kind: "video",
    files: ["realmedia/realvideo-3-cook.rm"],
    title: "A RealPlayer video",
    plain:
      "The streaming video format of the late-90s web: what you got from a news site in 2001, before Flash took over.",
    format: "RealMedia (.rm) · RealVideo 3 + Cook audio",
  },
  {
    id: "bink",
    label: "Bink video (.bik)",
    kind: "video",
    files: ["game-and-oddball-video/bink-video.bik"],
    title: "A video game cutscene",
    plain:
      "The format behind thousands of PC and console game cutscenes: Bink, from RAD Game Tools.",
    format: "Bink (.bik) · Bink video",
  },
  {
    id: "tracker",
    label: "Scream Tracker module (.s3m)",
    kind: "audio",
    files: ["chiptune-tracker-midi/sandman-s3m.s3m"],
    title: "A tracker module",
    plain:
      "Demoscene music from the 90s: the song file carries its own instrument samples and a score that VLC plays live.",
    format: "Scream Tracker 3 module (.s3m)",
  },
  {
    id: "snes",
    label: "SNES music (.spc)",
    kind: "audio",
    files: ["chiptune-tracker-midi/snes-spc.spc"],
    title: "Super Nintendo music",
    plain:
      "A snapshot of a SNES sound chip's memory: VLC emulates the chip to play the game's soundtrack.",
    format: "SNES SPC700 dump (.spc), via game-music-emu",
  },
  {
    id: "subtitles",
    label: "Matroska with ASS subtitles (.mkv)",
    kind: "video",
    files: ["subtitles-and-captions/mpeg-4-asp-vorbis-16-ass-ssa-tracks.mkv"],
    title: "Anime fansub, 16 subtitle tracks",
    plain:
      "A Matroska file with styled, positioned karaoke-style subtitles in sixteen languages. Pick one in the Tracks tab.",
    format: "Matroska · MPEG-4 ASP + Vorbis · 16 ASS/SSA tracks (libass)",
    hint: "Tracks → Subtitles",
  },
  {
    id: "wmv",
    label: "Windows Media (.wmv)",
    kind: "video",
    files: ["windows-media/wmv7.wmv"],
    title: "An early-2000s Windows Media clip",
    plain:
      "What Windows Media Player made in 2000: a format browsers never adopted outside Internet Explorer plugins.",
    format: "ASF (.wmv) · WMV7 + WMA",
  },
  {
    id: "truehd",
    label: "Dolby TrueHD (.thd)",
    kind: "audio",
    files: ["rare-and-surround-audio/dolby-truehd-atmos-8ch.thd"],
    title: "Blu-ray surround audio",
    plain:
      "The lossless 8-channel soundtrack format of Blu-ray discs, mixed down to your speakers.",
    format: "Dolby TrueHD with Atmos (.thd), 7.1",
  },
  {
    id: "quake",
    label: "id RoQ video (.roq)",
    kind: "video",
    files: ["game-and-oddball-video/id-roq-quake-3-logo.roq"],
    title: "The Quake III intro",
    plain:
      "id Software's own video format, used for the logo and cutscenes of Quake III Arena (1999).",
    format: "id RoQ (.roq) · RoQ video + RoQ DPCM audio",
  },
  {
    id: "playstation",
    label: "PlayStation STR (.str)",
    kind: "video",
    files: ["game-and-oddball-video/playstation-str-mdec-xa.str"],
    title: "A PlayStation 1 movie",
    plain:
      "A full-motion video straight off an original PlayStation game disc. Desktop VLC cannot play this one.",
    format: "PSX STR · MDEC video + XA ADPCM audio (via patches/0009)",
  },
  {
    id: "flash",
    label: "Flash video (.flv)",
    kind: "video",
    files: ["flash/vp6f-nellymoser.flv"],
    title: "A Flash video",
    plain:
      "A 2000s web video recorded through a Flash webcam app, with the Nellymoser voice codec Flash used for microphones.",
    format: "Flash Video (.flv) · On2 VP6 + Nellymoser",
  },
];

/** What the sample menu offers, in order; the rest stay reachable as ?sample=<id>. */
export const MENU = [
  "dvd",
  "bluray",
  "playstation",
  "wmv",
  "snes",
  "c64",
  "genesis",
  "amiga",
  "nes",
  "realmedia",
  "quake",
  "bink",
];

/** The gallery thumbnail, drawn by scripts/thumbs.mjs (none for audio, or where VLC's thumbnailer finds no frame). */
export const thumbOf = (s: Sample) =>
  s.kind === "audio" || s.id === "quake"
    ? null
    : `/samples/thumbs/${s.files[0].split("/").pop()}.jpg`;

/**
 * Fetches a sample's files as Files: the app ships them in /samples/
 * (scripts/samples.mjs); /media/ (the whole corpus) is a dev-server fallback.
 */
export async function loadSample(s: Sample): Promise<File[]> {
  return Promise.all(
    s.files.map(async (path) => {
      const name = path.split("/").pop()!;
      // A missing file comes back as the app's index.html, not a 404.
      const found = (r: Response) =>
        r.ok && !(r.headers.get("content-type") ?? "").includes("text/html");
      // Gallery files ship flat; the generated everyday formats keep their folder (see compat.ts).
      let r = await fetch(
        `/samples/${path.startsWith("everyday/") ? path : name}`,
      );
      if (!found(r)) r = await fetch(`/media/${path}`);
      if (!found(r))
        throw new Error(`${name} is missing: run node scripts/samples.mjs`);
      return new File([await r.blob()], name);
    }),
  );
}
