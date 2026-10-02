import { useEffect, useState } from "react";
import { localYmd } from "@/lib/calendar-date";

// The user's local "today" as YYYY-MM-DD, resolved after mount.
//
// <input type="date"> min= used to read `new Date().toISOString()`
// inline — that is UTC, so guests behind UTC lose "today" near
// midnight, and a render-time read can produce SSR markup the
// client's first render disagrees with (hydration mismatch whenever
// server and browser calendars differ). Returning undefined until
// after mount keeps the first render identical on both sides — the
// F114 upgrade-after-mount pattern from PublicBookingLinkBar — then
// stamps the browser's own local calendar day.
export function useTodayYmd(): string | undefined {
	const [today, setToday] = useState<string>();
	useEffect(() => setToday(localYmd()), []);
	return today;
}
