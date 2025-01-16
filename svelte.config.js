import staticAdapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: staticAdapter(),
		paths: {
			base: process.argv.includes("dev") ? undefined : process.env.BASE_PATH
		}
	}
};

export default config;
