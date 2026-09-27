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
	kind: 'video' | 'audio' | 'disc';
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
		id: 'dvd',
		label: 'DVD disc image (.iso)',
		kind: 'disc',
		files: ['gen/t_dvd.iso'],
		title: 'A DVD, with its menu',
		plain: 'A disc image of a small DVD: a menu with two buttons, each playing a title. Click a button, or use the arrow keys and Enter.',
		format: 'DVD-Video ISO 9660 · MPEG-2 video + AC-3 audio · button subpictures',
		hint: 'Click a button on the menu'
	},
	{
		id: 'realmedia',
		label: 'RealMedia (.rm)',
		kind: 'video',
		files: ['realmedia/realvideo-3-cook.rm'],
		title: 'A RealPlayer video',
		plain: 'The streaming video format of the late-90s web: what you got from a news site in 2001, before Flash took over.',
		format: 'RealMedia (.rm) · RealVideo 3 + Cook audio'
	},
	{
		id: 'bink',
		label: 'Bink video (.bik)',
		kind: 'video',
		files: ['game-and-oddball-video/bink-video.bik'],
		title: 'A video game cutscene',
		plain: 'The format behind thousands of PC and console game cutscenes: Bink, from RAD Game Tools.',
		format: 'Bink (.bik) · Bink video'
	},
	{
		id: 'tracker',
		label: 'Scream Tracker module (.s3m)',
		kind: 'audio',
		files: ['chiptune-tracker-midi/sandman-s3m.s3m'],
		title: 'A tracker module',
		plain: 'Demoscene music from the 90s: the song file carries its own instrument samples and a score that VLC plays live.',
		format: 'Scream Tracker 3 module (.s3m)'
	},
	{
		id: 'snes',
		label: 'SNES music (.spc)',
		kind: 'audio',
		files: ['chiptune-tracker-midi/snes-spc.spc'],
		title: 'Super Nintendo music',
		plain: "A snapshot of a SNES sound chip's memory: VLC emulates the chip to play the game's soundtrack.",
		format: 'SNES SPC700 dump (.spc), via game-music-emu'
	},
	{
		id: 'subtitles',
		label: 'Matroska with ASS subtitles (.mkv)',
		kind: 'video',
		files: ['subtitles-and-captions/mpeg-4-asp-vorbis-16-ass-ssa-tracks.mkv'],
		title: 'Anime fansub, 16 subtitle tracks',
		plain: 'A Matroska file with styled, positioned karaoke-style subtitles in sixteen languages. Pick one in the Tracks tab.',
		format: 'Matroska · MPEG-4 ASP + Vorbis · 16 ASS/SSA tracks (libass)',
		hint: 'Tracks → Subtitles'
	},
	{
		id: 'wmv',
		label: 'Windows Media (.wmv)',
		kind: 'video',
		files: ['windows-media/wmv7.wmv'],
		title: 'An early-2000s Windows Media clip',
		plain: 'What Windows Media Player made in 2000: a format browsers never adopted outside Internet Explorer plugins.',
		format: 'ASF (.wmv) · WMV7 + WMA'
	},
	{
		id: 'truehd',
		label: 'Dolby TrueHD (.thd)',
		kind: 'audio',
		files: ['rare-and-surround-audio/dolby-truehd-atmos-8ch.thd'],
		title: 'Blu-ray surround audio',
		plain: 'The lossless 8-channel soundtrack format of Blu-ray discs, mixed down to your speakers.',
		format: 'Dolby TrueHD with Atmos (.thd), 7.1'
	},
	{
		id: 'quake',
		label: 'id RoQ video (.roq)',
		kind: 'video',
		files: ['game-and-oddball-video/id-roq-quake-3-logo.roq'],
		title: 'The Quake III intro',
		plain: "id Software's own video format, used for the logo and cutscenes of Quake III Arena (1999).",
		format: 'id RoQ (.roq) · RoQ video + RoQ DPCM audio'
	},
	{
		id: 'playstation',
		label: 'PlayStation STR (.str)',
		kind: 'video',
		files: ['game-and-oddball-video/playstation-str-mdec-xa.str'],
		title: 'A PlayStation 1 movie',
		plain: 'A full-motion video straight off an original PlayStation game disc. Desktop VLC cannot play this one.',
		format: 'PSX STR · MDEC video + XA ADPCM audio (via patches/0009)'
	},
	{
		id: 'flash',
		label: 'Flash video (.flv)',
		kind: 'video',
		files: ['flash/vp6f-nellymoser.flv'],
		title: 'A Flash video',
		plain: 'A 2000s web video recorded through a Flash webcam app, with the Nellymoser voice codec Flash used for microphones.',
		format: 'Flash Video (.flv) · On2 VP6 + Nellymoser'
	}
];

/** The gallery thumbnail, drawn by scripts/thumbs.mjs (none for audio, or where VLC's thumbnailer finds no frame). */
export const thumbOf = (s: Sample) => (s.kind === 'audio' || s.id === 'quake' ? null : `/samples/thumbs/${s.files[0].split('/').pop()}.jpg`);

/**
 * Fetches a sample's files as Files: the app ships them in /samples/
 * (scripts/samples.mjs); /media/ (the whole corpus) is a dev-server fallback.
 */
export async function loadSample(s: Sample): Promise<File[]> {
	return Promise.all(
		s.files.map(async (path) => {
			const name = path.split('/').pop()!;
			// A missing file comes back as the app's index.html, not a 404.
			const found = (r: Response) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html');
			let r = await fetch(`/samples/${name}`);
			if (!found(r)) r = await fetch(`/media/${path}`);
			if (!found(r)) throw new Error(`${name} is missing: run node scripts/samples.mjs`);
			return new File([await r.blob()], name);
		})
	);
}
