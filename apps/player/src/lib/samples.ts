/**
 * One-click samples for the empty player: files no browser plays by itself,
 * served from the test corpus at /media/ (see vite.config.ts).
 */
export type Sample = {
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
		files: ['gen/t_dvd.iso'],
		title: 'A DVD, with its menu',
		plain: 'A disc image of a small DVD: a menu with two buttons, each playing a title. Click a button, or use the arrow keys and Enter.',
		format: 'DVD-Video ISO 9660 · MPEG-2 video + AC-3 audio · button subpictures',
		hint: 'Click a button on the menu'
	},
	{
		files: ['realmedia/realvideo-3-cook.rm'],
		title: 'A RealPlayer video',
		plain: 'The streaming video format of the late-90s web: what you got from a news site in 2001, before Flash took over.',
		format: 'RealMedia (.rm) · RealVideo 3 + Cook audio'
	},
	{
		files: ['game-and-oddball-video/bink-video.bik'],
		title: 'A video game cutscene',
		plain: 'The format behind thousands of PC and console game cutscenes: Bink, from RAD Game Tools.',
		format: 'Bink (.bik) · Bink video'
	},
	{
		files: ['chiptune-tracker-midi/sandman-s3m.s3m'],
		title: 'A tracker module',
		plain: 'Demoscene music from the 90s: the song file carries its own instrument samples and a score that VLC plays live.',
		format: 'Scream Tracker 3 module (.s3m)'
	},
	{
		files: ['chiptune-tracker-midi/snes-spc.spc'],
		title: 'Super Nintendo music',
		plain: "A snapshot of a SNES sound chip's memory: VLC emulates the chip to play the game's soundtrack.",
		format: 'SNES SPC700 dump (.spc), via game-music-emu'
	},
	{
		files: ['subtitles-and-captions/mpeg-4-asp-vorbis-16-ass-ssa-tracks.mkv'],
		title: 'Anime fansub, 16 subtitle tracks',
		plain: 'A Matroska file with styled, positioned karaoke-style subtitles in sixteen languages. Pick them in Settings → Subtitles.',
		format: 'Matroska · MPEG-4 ASP + Vorbis · 16 ASS/SSA tracks (libass)',
		hint: 'Settings → Subtitles'
	},
	{
		files: ['windows-media/wmv7.wmv'],
		title: 'An early-2000s Windows Media clip',
		plain: 'What Windows Media Player made in 2000: a format browsers never adopted outside Internet Explorer plugins.',
		format: 'ASF (.wmv) · WMV7 + WMA'
	},
	{
		files: ['rare-and-surround-audio/dolby-truehd-atmos-8ch.thd'],
		title: 'Blu-ray surround audio',
		plain: 'The lossless 8-channel soundtrack format of Blu-ray discs, mixed down to your speakers.',
		format: 'Dolby TrueHD with Atmos (.thd), 7.1'
	},
	{
		files: ['game-and-oddball-video/id-roq-quake-3-logo.roq'],
		title: 'The Quake III intro',
		plain: "id Software's own video format, used for the logo and cutscenes of Quake III Arena (1999).",
		format: 'id RoQ (.roq) · RoQ video + RoQ DPCM audio'
	},
	{
		files: ['game-and-oddball-video/playstation-str-mdec-xa.str'],
		title: 'A PlayStation 1 movie',
		plain: 'A full-motion video straight off an original PlayStation game disc. Desktop VLC cannot play this one.',
		format: 'PSX STR · MDEC video + XA ADPCM audio (via patches/0009)'
	},
	{
		files: ['flash/vp6f-nellymoser.flv'],
		title: 'A Flash video',
		plain: 'A 2000s web video recorded through a Flash webcam app, with the Nellymoser voice codec Flash used for microphones.',
		format: 'Flash Video (.flv) · On2 VP6 + Nellymoser'
	}
];

/** Fetches a sample's files from /media/ as Files. */
export async function loadSample(s: Sample): Promise<File[]> {
	return Promise.all(
		s.files.map(async (path) => {
			const r = await fetch(`/media/${path}`);
			if (!r.ok) throw new Error(`${path}: HTTP ${r.status} (run node corpus/fetch.mjs)`);
			return new File([await r.blob()], path.split('/').pop()!);
		})
	);
}
