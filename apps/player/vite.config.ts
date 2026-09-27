import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// libvlc-wasm needs SharedArrayBuffer, so every response must carry these.
// A middleware rather than server.headers: the latter misses some responses
// (Vite's worker client), and Safari refuses such workers outright.
const isolation = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};
const stamp = (server: ViteDevServer | PreviewServer) => {
	server.middlewares.use((_req, res, next) => {
		for (const [k, v] of Object.entries(isolation)) res.setHeader(k, v);
		next();
	});
};
const isolate: Plugin = { name: 'isolate', configureServer: stamp, configurePreviewServer: stamp };

// The test corpus (corpus/media, fetched by corpus/fetch.mjs) at /media/, for
// the sample gallery and the formats page: try a file here or download it.
const mediaRoot = resolve(fileURLToPath(new URL('../../corpus/media', import.meta.url)));
const serveMedia = (server: ViteDevServer | PreviewServer) => {
	server.middlewares.use('/media', (req, res, next) => {
		const path = resolve(join(mediaRoot, decodeURIComponent(((req as { url?: string }).url ?? '/').split('?')[0])));
		if (!path.startsWith(mediaRoot + sep) || !existsSync(path) || !statSync(path).isFile()) return next();
		res.setHeader('Content-Type', 'application/octet-stream');
		res.setHeader('Content-Length', statSync(path).size);
		res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
		createReadStream(path).pipe(res);
	});
};
const media: Plugin = { name: 'corpus-media', configureServer: serveMedia, configurePreviewServer: serveMedia };

export default defineConfig({
	plugins: [
		isolate,
		media,
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	// The Emscripten output has to stay next to libvlc.wasm and spawn itself
	// as pthread workers: keep the dependency optimiser away from it.
	optimizeDeps: { exclude: ['libvlc-wasm'] },
	// In this monorepo the SDK is a workspace package outside the app's root.
	// Listed one by one rather than the repo root, which /@fs/ would then serve
	// whole (build output, scratch files, anything untracked).
	server: {
		fs: {
			allow: [
				'.',
				'../../packages',
				'../../node_modules',
				'../../corpus/media',
				'../../corpus/compat/compat.json',
				'../../corpus/compat/fate-summary.json',
				'../../corpus/compat/fate-matrix.json',
				'../../corpus/compat/suites',
				'../../corpus/suites',
				'../../corpus/plain-english.json',
				'../../corpus/formats.json'
			]
		}
	},
	worker: { format: 'es' }
});
