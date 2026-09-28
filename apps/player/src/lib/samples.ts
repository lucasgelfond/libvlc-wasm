/**
 * One-click samples for the empty player: files no browser plays by itself,
 * shipped with the app in static/samples/. Each is made by a script in
 * scripts/ from our own or freely licensed material; the sources and
 * licences are listed in static/samples/CREDITS.md.
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
    files: ["design-for-dreaming.iso"],
    title: "Design for Dreaming, on DVD",
    plain:
      "A small DVD authored like an archival release of 1950s films: a motion menu over the film with its own soundtrack, scene selection with a still from each chapter, two minutes of the film in three chapters with notes as English and Spanish subtitles, a bonus film and credits. Click the buttons, or use the arrow keys and Enter. Footage: Design for Dreaming (1956, MPO Productions for General Motors) and Living Stereo (1958, Jam Handy for RCA), Prelinger Archives, public domain.",
    format:
      "DVD-Video ISO 9660 · MPEG-2 video + AC-3 audio · 2 subpicture subtitle tracks, menu buttons",
    hint: "Click a button on the menu",
  },
  {
    id: "bluray",
    label: "Blu-ray disc image (.iso)",
    kind: "disc",
    files: ["bluray.iso"],
    title: "A Blu-ray",
    plain:
      "A disc image of an unencrypted Blu-ray: a minute of Big Buck Bunny in three chapters, read by libbluray the way desktop VLC reads a disc. Footage: Big Buck Bunny, (c) 2008 Blender Foundation, www.bigbuckbunny.org (CC BY 3.0).",
    format: "BDMV UDF image · H.264 video + AC-3 audio · chapters",
  },
  {
    id: "playstation",
    label: "PlayStation STR (.str)",
    kind: "video",
    files: ["a-is-for-atom.str"],
    title: "A 1953 cartoon as a PlayStation cutscene",
    plain:
      "30 seconds of film encoded the way PlayStation games stored their cutscenes: pictures for the console's MDEC decoder chip, interleaved with CD-XA audio in raw CD sectors. Browsers cannot play these, and neither can desktop VLC. Footage: A Is for Atom (1953, John Sutherland Productions for General Electric), Prelinger Archives, public domain.",
    format: "PSX STR, 2352-byte sectors · MDEC (BS v2) 320x240 15 fps + XA ADPCM 37.8 kHz stereo",
  },
  {
    id: "wmv",
    label: "Windows Media (.wmv)",
    kind: "video",
    files: ["story-of-television.wmv"],
    title: "A 1956 film as a Windows Media clip",
    plain:
      "What Windows Media Player 7 and 8 made around 2001: a format browsers never played outside Internet Explorer plugins. Footage: The Story of Television (1956, William J. Ganz Co. for RCA), Prelinger Archives, public domain.",
    format: "ASF (.wmv) · Windows Media Video 8 (WMV2) 320x240 + Windows Media Audio 2 (WMA2)",
  },
  {
    id: "c64",
    label: "Commodore 64 music (.sid)",
    kind: "audio",
    files: ["wasm-64.sid"],
    title: "Commodore 64 music",
    plain:
      "C64 music was a program for the machine's SID sound chip: this runs one on an emulated 6510 CPU and SID. A sawtooth bass with drums on the same voice, fast pulse-wave arpeggios through the chip's filter, and a lead with vibrato. Music and player: written for libvlc-wasm (CC0).",
    format: "PSID file · 6502 player + MOS 6581 SID emulation (libsidplay2)",
  },
  {
    id: "genesis",
    label: "Sega Genesis music (.vgm)",
    kind: "audio",
    files: ["wasm-drive.vgm"],
    title: "Sega Genesis music",
    plain:
      "A log of every write to the Genesis's two sound chips, replayed through emulations of them: FM slap bass, brass lead and pads on the Yamaha YM2612, square-wave arpeggios and noise drums on the SN76489. Music: written for libvlc-wasm (CC0).",
    format: "VGM · YM2612 + SN76489 emulation (game-music-emu)",
  },
];

/** What the sample menu offers, in order. */
export const MENU = ["dvd", "bluray", "playstation", "wmv", "c64", "genesis"];

/** The gallery thumbnail, drawn by scripts/thumbs.mjs (none for audio, or where VLC's thumbnailer finds no frame). */
export const thumbOf = (s: Sample) =>
  s.kind === "audio"
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
