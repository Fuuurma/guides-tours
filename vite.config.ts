import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	server: {
		host: "127.0.0.1",
		port: 3020,
		strictPort: true,
	},
	preview: {
		host: "127.0.0.1",
		port: 4020,
		strictPort: true,
	},
	resolve: { tsconfigPaths: true },
	optimizeDeps: {
		include: ["zod", "@convex-dev/react-query", "sonner", "next-themes"],
	},
	ssr: {
		noExternal: ["@convex-dev/better-auth"],
	},
	plugins: [
		devtools(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
