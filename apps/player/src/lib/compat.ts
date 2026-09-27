/**
 * The format compatibility matrix (corpus/compat/compat.json, measured by
 * corpus/compat/build.mjs) with a plain-English line per file, shaped for the
 * "What can it play?" page.
 */
import compat from '../../../../corpus/compat/compat.json';
import plain from '../../../../corpus/plain-english.json';

export type Verdict = 'yes' | 'partial' | 'no' | 'untested';
export type Cell = { verdict: Verdict; note: string };

type Decode = { video: boolean | null; audio: boolean | null; note?: string } | null | undefined;

export type Row = {
	id: string;
	name: string;
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
	ffmpegWasm: Cell;
	ffmpeg: Cell;
	vlcjs: Cell;
	browsers: { chromium: boolean; webkit: boolean; firefox: boolean };
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
	'chiptune-tracker-midi': 'Chiptunes, trackers and MIDI'
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
	const lv = s.libvlcWasm as unknown as { passed: boolean; checks?: Record<string, boolean | undefined>; note?: string | null };
	const checks = Object.values(lv.checks ?? {});
	const lvVerdict: Verdict = lv.passed ? 'yes' : checks.some(Boolean) ? 'partial' : 'no';
	return {
		id: s.id,
		name: s.name,
		category: s.category,
		plain: (plain as Record<string, string>)[s.id] ?? '',
		format: [s.container, s.video, s.audio].filter((x) => x && x !== 'none').join(' · '),
		file: s.file,
		url: s.url,
		bytes: s.bytes,
		hasVideo: wantVideo,
		whyBrowserCant: s.whyBrowserCant ?? '',
		libvlcWasm: { verdict: lvVerdict, note: lv.note ?? (lv.passed ? 'picture and sound verified' : '') },
		nativeVlc: decodeCell(s.nativeVlc as Decode, wantVideo, wantAudio),
		ffmpegWasm: decodeCell(s.ffmpegWasm as Decode, wantVideo, wantAudio),
		ffmpeg: decodeCell(s.ffmpeg as Decode, wantVideo, wantAudio),
		vlcjs:
			s.vlcjs === null || s.vlcjs === undefined
				? { verdict: 'untested', note: 'vlc.js was only measured on video samples' }
				: { verdict: s.vlcjs ? 'yes' : 'no', note: s.vlcjs ? 'showed video' : 'no picture' },
		browsers: s.browsers as Row['browsers']
	};
}

export const ROWS: Row[] = compat.samples.map(row);
export const TOOLS = compat.tools as Record<string, unknown>;
export const MEASURED = compat.date as string;

export function count(rows: Row[], pick: (r: Row) => Cell) {
	const tested = rows.filter((r) => pick(r).verdict !== 'untested');
	return { yes: tested.filter((r) => pick(r).verdict === 'yes').length, tested: tested.length };
}
