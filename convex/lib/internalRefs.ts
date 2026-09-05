import { internal } from "../_generated/api";
import type { FunctionReference } from "convex/server";

/**
 * The generated `internal` API strips subdirectory modules, so backend
 * files that keep internal mutations in `lib/`, `ota/`, etc. need a
 * structural cast to reach them. This is the single place that cast
 * lives (was copy-pasted in six files — drains 2026-09-05). Loose shape
 * on purpose: callers index `internalRefs.<module>.<refName>` for their
 * own module's refs; crons.ts keeps a narrower typed cast for its
 * payload-checked purgeOld ref.
 */
export const internalRefs = internal as unknown as Record<
	string,
	Record<string, FunctionReference<"mutation", "internal">>
>;
