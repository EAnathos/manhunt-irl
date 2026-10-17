import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' }),
			// Always fetch service-worker.js from the network when checking for updates
			serviceWorker: { register: true, options: { updateViaCache: 'none' } },
			// Poll /_app/version.json so open clients learn about new deployments
			version: { pollInterval: 60_000 }
		})
	]
});
