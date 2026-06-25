/// <reference types="vitest" />
/// <reference types="vite/client" />

// Convex-test uses `import.meta.glob` for hot module loading during
// testing — declare it so tsc doesn't complain.
declare module "*.ts" {
	const content: string;
	export default content;
}
