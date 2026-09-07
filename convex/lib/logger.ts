// Thin structured logger wrapper for Convex server functions.
//
// Convex captures console output in function logs. This wrapper preserves
// severity (error/warn/info) and message content while providing a single
// seam to change format or sink later. `console.log` maps to `info` so
// severity is explicit at every call site.
//
// Call sites must pass only safe, non-PII, non-secret args — follow the
// `[public-booking]` safe-message pattern in convex/http.ts.

export const logger = {
	error: (...args: unknown[]): void => {
		console.error(...args);
	},
	warn: (...args: unknown[]): void => {
		console.warn(...args);
	},
	info: (...args: unknown[]): void => {
		console.log(...args);
	},
};
