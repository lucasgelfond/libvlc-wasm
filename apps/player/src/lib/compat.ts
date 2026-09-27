/**
 * The format compatibility matrix (corpus/compat/compat.json, measured by
 * corpus/compat/build.mjs) with a plain-English line per file, shaped for the
 * "What can it play?" page.
 */
import compat from '../../../../corpus/compat/compat.json';
import plain from '../../../../corpus/plain-english.json';
import formatsJson from '../../../../corpus/formats.json';

/** id -> [short name, Wikipedia article]. */
const FORMATS = formatsJson as unknown as Record<string, [string, string]>;

export type Verdict = 'yes' | 'partial' | 'no' | 'untested';
export type Cell = { verdict: Verdict; note: string };

type Decode = { video: boolean | null; audio: boolean | null; note?: string } | null | undefined;

export type Row = {
	id: string;
	name: string;
	/** Short format name, linked to its Wikipedia article. */
	short: string;
	wiki: string;
	category: string;
	plain: string;
	format: string;
	file: string;
	url: string;
	bytes: number;
	hasVideo: boolean;
	whyBrowserCant: string;
	libvlcWasm: Cell;
	nativeVlc: Cell;
	nativeVlc4: Cell;
	ffmpegWasm: Cell;
	ffmpeg: Cell;
	vlcjs: Cell;
	/** null: not measured in that browser yet. */
	browsers: { chromium: boolean | null; webkit: boolean | null; firefox: boolean | null };
};

const CATEGORY: Record<string, string> = {
	realmedia: 'RealMedia',
	'windows-media': 'Windows Media',
	'avi-era-codecs': 'AVI-era codecs',
	'quicktime-and-3gp': 'QuickTime and 3GP',
	'mpeg-ps-ts': 'MPEG program and transport streams',
	flash: 'Flash video',
	'game-and-oddball-video': 'Game and oddball video',
	'rare-and-surround-audio': 'Surround and rare audio',
	'modern-codecs': 'Modern codecs',
	'subtitles-and-captions': 'Subtitles and captions',
	'chiptune-tracker-midi': 'Chiptunes, trackers and MIDI',
	'discs-and-drm': 'Discs and DRM'
};
export const categoryName = (c: string) => CATEGORY[c] ?? c;

/** Every stream the manifest lists decoded = yes; some = partial; none = no. */
function decodeCell(d: Decode, wantVideo: boolean, wantAudio: boolean): Cell {
	if (!d) return { verdict: 'untested', note: 'not measured' };
	const got = [wantVideo ? d.video : null, wantAudio ? d.audio : null].filter((x) => x !== null);
	const ok = got.filter(Boolean).length;
	const verdict: Verdict = ok === 0 ? 'no' : ok < got.length ? 'partial' : 'yes';
	return { verdict, note: d.note ?? '' };
}

type Sample = (typeof compat.samples)[number];

function row(s: Sample): Row {
	const wantVideo = !!s.video && s.video !== 'none';
	const wantAudio = !!s.audio && s.audio !== 'none';
	// A sample added to the manifest has no libvlc-wasm result until the corpus is re-verified.
	const lv = s.libvlcWasm as unknown as { passed: boolean; checks?: Record<string, boolean | undefined>; note?: string | null } | null;
	const checks = Object.values(lv?.checks ?? {});
	const lvVerdict: Verdict = !lv ? 'untested' : lv.passed ? 'yes' : checks.some(Boolean) ? 'partial' : 'no';
	return {
		id: s.id,
		name: s.name,
		short: FORMATS[s.id]?.[0] ?? s.name,
		wiki: `https://en.wikipedia.org/wiki/${FORMATS[s.id]?.[1] ?? ''}`,
		category: s.category,
		plain: (plain as Record<string, string>)[s.id] ?? '',
		format: [s.container, s.video, s.audio].filter((x) => x && x !== 'none').join(' · '),
		file: s.file,
		// Generated files (the everyday formats) ship with the app.
		url: s.url ?? `/samples/${s.file}`,
		bytes: s.bytes,
		hasVideo: wantVideo,
		whyBrowserCant: s.whyBrowserCant ?? '',
		libvlcWasm: { verdict: lvVerdict, note: !lv ? 'not measured yet' : (lv.note ?? (lv.passed ? 'picture and sound verified' : '')) },
		nativeVlc: decodeCell(s.nativeVlc as Decode, wantVideo, wantAudio),
		nativeVlc4: decodeCell((s as { nativeVlc4?: Decode }).nativeVlc4, wantVideo, wantAudio),
		ffmpegWasm: decodeCell(s.ffmpegWasm as Decode, wantVideo, wantAudio),
		ffmpeg: decodeCell(s.ffmpeg as Decode, wantVideo, wantAudio),
		vlcjs:
			s.vlcjs === null || s.vlcjs === undefined
				? { verdict: 'untested', note: 'vlc.js was only measured on video samples' }
				: { verdict: s.vlcjs ? 'yes' : 'no', note: s.vlcjs ? 'showed video' : 'no picture' },
		// A sample added to the manifest has no browser results until the matrix is re-measured.
		browsers: (s.browsers ?? { chromium: null, webkit: null, firefox: null }) as Row['browsers']
	};
}

export const ROWS: Row[] = compat.samples.map(row);
export const TOOLS = compat.tools as Record<string, unknown>;
export const MEASURED = compat.date as string;

/** How many rows a tool plays, of those it was tried on. A browser's cell is a plain boolean. */
export function count(rows: Row[], pick: (r: Row) => Cell | boolean | null) {
	const verdict = (r: Row) => {
		const v = pick(r);
		return v == null ? 'untested' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v.verdict;
	};
	const tested = rows.filter((r) => verdict(r) !== 'untested');
	return { yes: tested.filter((r) => verdict(r) === 'yes').length, tested: tested.length };
}

/** Where a file stands, most distinctive first. */
export const SECTIONS = [
	{ key: 'only', title: 'Only libvlc-wasm plays these in a web page', blurb: 'No browser plays them and vlc.js fails on them; ffmpeg.wasm can only convert them first.' },
	{ key: 'better', title: "Browsers can't play these; libvlc-wasm can", blurb: 'Other in-browser tools manage some of them, usually by converting the whole file first.' },
	{ key: 'common', title: 'Common formats browsers play too', blurb: 'For completeness: at least one of Chrome, Safari or Firefox plays these on its own.' },
	{ key: 'none', title: 'Not fully playable yet', blurb: 'Truncated test files, formats no decoder handles, and a video whose picture nothing decodes (its sound plays).' }
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];

const inBrowser = (r: Row) => r.browsers.chromium || r.browsers.webkit || r.browsers.firefox;

export function sectionOf(r: Row): SectionKey {
	if (r.libvlcWasm.verdict !== 'yes') return 'none';
	if (inBrowser(r)) return 'common';
	// ffmpeg.wasm only converts, so it never plays in the page; vlc.js has
	// to have been tried and failed (it was only measured on video files).
	if (r.vlcjs.verdict === 'no') return 'only';
	return 'better';
}

/** Rows grouped by section, the rarest first: nothing-else-decodes ahead of everything-decodes. */
export function bySection(rows: Row[]) {
	const others = (r: Row) => [r.nativeVlc, r.ffmpegWasm, r.vlcjs].filter((c) => c.verdict === 'yes').length;
	return SECTIONS.map((s) => ({
		...s,
		rows: rows.filter((r) => sectionOf(r) === s.key).sort((a, b) => others(a) - others(b) || a.name.localeCompare(b.name))
	})).filter((s) => s.rows.length);
}
