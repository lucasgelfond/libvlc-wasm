import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';

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

export default defineConfig({
	plugins: [
		isolate,
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
	optimizeDeps: { exclude: ['@libvlc-wasm/core'] },
	// In this monorepo the SDK is a workspace package outside the app's root.
	server: { fs: { allow: ['../..'] } },
	worker: { format: 'es' }
});
