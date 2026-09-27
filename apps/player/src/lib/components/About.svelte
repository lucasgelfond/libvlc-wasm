<!--
  The description under the header on the start screen. Plain text and links:
  edit freely.
-->
<script lang="ts">
	const link = 'text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground';
</script>

<div class="text-muted-foreground flex max-w-3xl flex-col gap-3 text-sm leading-relaxed">
	<p>
		libvlc-wasm compiles
		<a class={link} href="https://www.videolan.org/vlc/libvlc.html" target="_blank" rel="noreferrer">libvlc</a>, the engine inside VLC media player,
		to WebAssembly, so the formats VLC plays run in an ordinary web page: no plugin, no server, no upload. It builds
		<a class={link} href="https://code.videolan.org/videolan/vlc" target="_blank" rel="noreferrer">VLC 4's own source</a>
		with <a class={link} href="https://emscripten.org" target="_blank" rel="noreferrer">Emscripten</a>, starting from VideoLAN's upstream WebAssembly
		build scripts, and changes it in only a few small places: ten patches, each fixing a bug or a gap that any port would hit. Around that it adds
		what a browser needs: a video output that draws through WebGL, an audio output on Web Audio, a decoder that hands H.264, HEVC, VP9 and AV1 to
		the browser's hardware through WebCodecs, pointer input for DVD menus, and a JavaScript API over it all.
	</p>
	<p>
		It takes inspiration from earlier attempts at VLC in the browser:
		<a class={link} href="https://code.videolan.org/jbk/vlc.js" target="_blank" rel="noreferrer">vlc.js</a>
		(VideoLAN's asm.js proof of concept),
		<a class={link} href="https://code.videolan.org/videolan/vlc/-/merge_requests/184" target="_blank" rel="noreferrer">VLC's upstream wasm32-emscripten support</a>,
		<a class={link} href="https://github.com/addyosmani/vlc.js" target="_blank" rel="noreferrer">addyosmani/vlc.js</a>,
		<a class={link} href="https://github.com/addyosmani/webvlc" target="_blank" rel="noreferrer">webvlc</a> and
		<a class={link} href="https://github.com/Krowemoh/vlc.js" target="_blank" rel="noreferrer">Krowemoh/vlc.js</a>; and from other native
		libraries brought to the web:
		<a class={link} href="https://github.com/ffmpegwasm/ffmpeg.wasm" target="_blank" rel="noreferrer">ffmpeg.wasm</a>,
		<a class={link} href="https://github.com/6over3/exiftool" target="_blank" rel="noreferrer">ExifTool</a>,
		<a class={link} href="https://github.com/neslinesli93/qpdf-wasm" target="_blank" rel="noreferrer">qpdf-wasm</a> and
		<a class={link} href="https://github.com/ArtifexSoftware/mupdf.js" target="_blank" rel="noreferrer">mupdf.js</a>.
	</p>
</div>
