<!--
  The description under the header on the start screen. Plain text and links:
  edit freely. The first sentence always shows; the rest folds away.
-->
<script lang="ts">
	import RiArrowDownSLine from 'remixicon-svelte/icons/arrow-down-s-line';

	const link = 'text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground';
	const a = (href: string) => ({ href, target: '_blank', rel: 'noreferrer', class: link });

	const KEY = 'libvlc-wasm:about-open';
	let open = $state(read());
	function read() {
		try {
			return localStorage.getItem(KEY) !== '0';
		} catch {
			return true;
		}
	}
	function toggle() {
		open = !open;
		try {
			localStorage.setItem(KEY, open ? '1' : '0');
		} catch {
			/* storage switched off: just don't remember */
		}
	}
</script>

<!-- One box holds the whole description, and the toggle sits on its bottom
     edge, so what folds away is visibly the box's own content. -->
<div class="text-muted-foreground border-foreground/10 bg-foreground/[0.04] rounded-xl border text-sm leading-relaxed backdrop-blur-sm">
	<div class="px-4 pt-3">
		<p>
			libvlc-wasm compiles and patches <a {...a('https://www.videolan.org/vlc/libvlc.html')}>libvlc</a>, the internals of VLC Media Player,
			into WebAssembly, and hooks it into the relevant browser APIs (WebGL, Web Audio, WebCodecs).
		</p>
		<!-- grid-rows 0fr -> 1fr animates to the content's natural height -->
		<div
			id="about-more"
			class="grid transition-[grid-template-rows,opacity] duration-300 ease-out {open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}"
			inert={!open}
		>
			<div class="min-h-0 overflow-hidden">
				<div class="flex flex-col gap-3 pt-3">
				<p>
					It takes inspiration from several vlc.js implementations (<a {...a('https://code.videolan.org/jbk/vlc.js')}>1</a>,
					<a {...a('https://github.com/addyosmani/vlc.js')}>2</a>, <a {...a('https://github.com/Krowemoh/vlc.js')}>3</a>,
					<a {...a('https://github.com/addyosmani/webvlc')}>4</a>), most of which have incomplete format support or work off of an outdated VLC
					source. It is inspired by other efforts to port essential media processing libraries to WebAssembly like
					<a {...a('https://github.com/neslinesli93/qpdf-wasm')}>qpdf</a>, <a {...a('https://github.com/6over3/exiftool')}>exiftool</a>,
					<a {...a('https://github.com/ffmpegwasm/ffmpeg.wasm')}>ffmpeg</a>, and <a {...a('https://github.com/dlemstra/magick-wasm')}>imagemagick</a>.
				</p>
				<p>
					You can view the <a {...a('https://github.com/lucasgelfond/libvlc-wasm')}>source code</a> or use it in your projects via
					<a {...a('https://www.npmjs.com/package/libvlc-wasm')}>npm</a>. Or, you can try it below!
				</p>
				<p>Built in New York City by <a {...a('https://lucasgelfond.online')}>Lucas Gelfond</a> (and Claude!)</p>
				</div>
			</div>
		</div>
	</div>
	<button
		type="button"
		onclick={toggle}
		aria-expanded={open}
		aria-controls="about-more"
		class="text-foreground/60 hover:text-foreground flex w-full items-center gap-1 rounded-b-xl px-4 pt-1.5 pb-2.5 text-xs"
	>
		{open ? 'Less' : 'More about the project'}
		<RiArrowDownSLine class="size-4 transition-transform duration-200 {open ? 'rotate-180' : ''}" />
	</button>
</div>
