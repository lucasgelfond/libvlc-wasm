<!--
  The description under the header on the start screen. Plain text and links:
  edit freely.
-->
<script lang="ts">
	const link = 'text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground';
	const a = (href: string) => ({ href, target: '_blank', rel: 'noreferrer', class: link });
</script>

<div class="text-muted-foreground flex max-w-3xl flex-col gap-3 text-sm leading-relaxed">
	<p>
		libvlc-wasm compiles <a {...a('https://www.videolan.org/vlc/libvlc.html')}>libvlc</a>, the internals of VLC Media Player, into WebAssembly, and
		hooks it into the browser (video through WebGL, audio outputs through Web Audio, and decoding with WebCodecs). It takes inspiration from several
		vlc.js implementations (<a {...a('https://code.videolan.org/jbk/vlc.js')}>1</a>, <a {...a('https://github.com/addyosmani/vlc.js')}>2</a>,
		<a {...a('https://github.com/Krowemoh/vlc.js')}>3</a>, <a {...a('https://github.com/addyosmani/webvlc')}>4</a>), most of which have incomplete
		format support or work off of an outdated VLC source. It is inspired by other efforts to port essential media processing libraries to wasm like
		<a {...a('https://github.com/neslinesli93/qpdf-wasm')}>qpdf</a>, <a {...a('https://github.com/6over3/exiftool')}>exiftool</a>,
		<a {...a('https://github.com/ffmpegwasm/ffmpeg.wasm')}>ffmpeg</a>, and <a {...a('https://github.com/dlemstra/magick-wasm')}>imagemagick</a>.
	</p>
	<p>
		You can also use libvlc-wasm in your projects via <a {...a('https://www.npmjs.com/package/libvlc-wasm')}>npm</a>. Or, you can try it below!
	</p>
	<p>Built in New York City by <a {...a('https://lucasgelfond.online')}>Lucas Gelfond</a> (and Claude!)</p>
</div>
