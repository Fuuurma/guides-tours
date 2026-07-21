/**
 * Shared staffing-gap computation for the readiness query + daily digest.
 */

import type { Id } from "../_generated/dataModel";
import {
	evaluateSlotStaffing,
	resolveTourStaffing,
	type SlotGap,
} from "./staffing";

export type GapTour = {
	_id: Id<"tours">;
	name: string;
	tourType: string;
	requiredGuides: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
};

export type GapSchedule = {
	_id: Id<"tourSchedules">;
	tourId: Id<"tours">;
	date: string;
	startTime: string;
	endTime: string;
	status: string;
	capacityBooked: number;
};

export type GapAssignment = {
	_id: Id<"assignments">;
	tourId: Id<"tours">;
	date: string;
	startTime: string;
	status: string;
	guideId: string;
	vehicleId?: Id<"vehicles">;
	driverId?: Id<"drivers">;
	deletedAt?: number;
};

export type StaffingGapRow = {
	key: string;
	tourId: Id<"tours">;
	tourName: string;
	date: string;
	startTime: string;
	endTime?: string;
	scheduleId?: Id<"tourSchedules">;
	capacityBooked: number;
	guideCount: number;
	requiredGuides: number;
	guidesNeeded: number;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType?: string;
	hasVehicle: boolean;
	hasDriver: boolean;
	gaps: SlotGap[];
	assignmentIds: Id<"assignments">[];
};

type SlotAgg = {
	guideIds: string[];
	assignmentIds: Id<"assignments">[];
	hasVehicle: boolean;
	hasDriver: boolean;
};

/** UTC calendar day as YYYY-MM-DD (cron / digest). */
export function utcYmd(d: Date = new Date()): string {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Add days to a YYYY-MM-DD string in UTC. */
export function addDaysYmd(ymd: string, days: number): string {
	const [y, m, d] = ymd.split("-").map(Number);
	const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
	dt.setUTCDate(dt.getUTCDate() + days);
	return utcYmd(dt);
}

export function computeStaffingGaps(input: {
	schedules: GapSchedule[];
	assignments: GapAssignment[];
	toursById: Map<string, GapTour>;
}): StaffingGapRow[] {
	const bySlot = new Map<string, SlotAgg>();
	for (const a of input.assignments) {
		if (a.deletedAt || a.status === "cancelled") continue;
		const key = `${a.tourId}|${a.date}|${a.startTime}`;
		const agg = bySlot.get(key) ?? {
			guideIds: [],
			assignmentIds: [],
			hasVehicle: false,
			hasDriver: false,
		};
		agg.guideIds.push(a.guideId);
		agg.assignmentIds.push(a._id);
		if (a.vehicleId) agg.hasVehicle = true;
		if (a.driverId) agg.hasDriver = true;
		bySlot.set(key, agg);
	}

	const gaps: StaffingGapRow[] = [];
	const seenSlots = new Set<string>();

	for (const s of input.schedules) {
		if (s.status === "cancelled") continue;
		const key = `${s.tourId}|${s.date}|${s.startTime}`;
		seenSlots.add(key);
		const tour = input.toursById.get(String(s.tourId));
		if (!tour) continue;
		const rules = resolveTourStaffing(tour);
		const agg = bySlot.get(key);
		const evaled = evaluateSlotStaffing({
			requiredGuides: rules.requiredGuides,
			requiresVehicle: rules.requiresVehicle,
			requiresDriver: rules.requiresDriver,
			guideCount: agg?.guideIds.length ?? 0,
			hasVehicle: agg?.hasVehicle ?? false,
			hasDriver: agg?.hasDriver ?? false,
		});
		if (evaled.ready) continue;
		gaps.push({
			key,
			tourId: s.tourId,
			tourName: tour.name,
			date: s.date,
			startTime: s.startTime,
			endTime: s.endTime,
			scheduleId: s._id,
			capacityBooked: s.capacityBooked,
			guideCount: agg?.guideIds.length ?? 0,
			requiredGuides: rules.requiredGuides,
			guidesNeeded: evaled.guidesNeeded,
			requiresVehicle: rules.requiresVehicle,
			requiresDriver: rules.requiresDriver,
			requiredVehicleType: rules.requiredVehicleType,
			hasVehicle: agg?.hasVehicle ?? false,
			hasDriver: agg?.hasDriver ?? false,
			gaps: evaled.gaps,
			assignmentIds: agg?.assignmentIds ?? [],
		});
	}

	for (const [key, agg] of bySlot) {
		if (seenSlots.has(key)) continue;
		const [tourIdStr, date, startTime] = key.split("|");
		if (!tourIdStr || !date || !startTime) continue;
		const tour = input.toursById.get(tourIdStr);
		if (!tour) continue;
		const rules = resolveTourStaffing(tour);
		const evaled = evaluateSlotStaffing({
			requiredGuides: rules.requiredGuides,
			requiresVehicle: rules.requiresVehicle,
			requiresDriver: rules.requiresDriver,
			guideCount: agg.guideIds.length,
			hasVehicle: agg.hasVehicle,
			hasDriver: agg.hasDriver,
		});
		if (evaled.ready) continue;
		gaps.push({
			key,
			tourId: tour._id,
			tourName: tour.name,
			date,
			startTime,
			capacityBooked: 0,
			guideCount: agg.guideIds.length,
			requiredGuides: rules.requiredGuides,
			guidesNeeded: evaled.guidesNeeded,
			requiresVehicle: rules.requiresVehicle,
			requiresDriver: rules.requiresDriver,
			requiredVehicleType: rules.requiredVehicleType,
			hasVehicle: agg.hasVehicle,
			hasDriver: agg.hasDriver,
			gaps: evaled.gaps,
			assignmentIds: agg.assignmentIds,
		});
	}

	gaps.sort((a, b) => {
		const d = a.date.localeCompare(b.date);
		if (d !== 0) return d;
		return a.startTime.localeCompare(b.startTime);
	});
	return gaps;
}

/** Plain-text / SMS body for an ops staffing digest. */
export function formatStaffingDigest(input: {
	orgLabel?: string;
	dateFrom: string;
	dateTo: string;
	gaps: StaffingGapRow[];
	maxLines?: number;
	/** Absolute app origin, e.g. https://app.example.com */
	siteUrl?: string;
	/** Staff on assignments with no phone (SMS won't reach them). */
	missingPhones?: Array<{ name: string; roles: string[]; assignmentCount: number }>;
}): { subject: string; bodyText: string; smsBody: string } {
	const n = input.gaps.length;
	const subject =
		n === 0
			? `Staffing OK · ${input.dateFrom}–${input.dateTo}`
			: `${n} staffing gap${n === 1 ? "" : "s"} · ${input.dateFrom}–${input.dateTo}`;

	const base = (input.siteUrl ?? "").replace(/\/$/, "");
	const staffingPage = base
		? `${base}/dashboard/staffing?from=${encodeURIComponent(input.dateFrom)}&to=${encodeURIComponent(input.dateTo)}`
		: "";

	const missing = input.missingPhones ?? [];
	const missingBlock =
		missing.length === 0
			? ""
			: [
					"",
					`${missing.length} assigned staff missing phone (no SMS):`,
					...missing.slice(0, 8).map((p) => {
						const roles = p.roles.join("/");
						return `• ${p.name} (${roles}, ${p.assignmentCount} assignment${p.assignmentCount === 1 ? "" : "s"})`;
					}),
					missing.length > 8 ? `…and ${missing.length - 8} more.` : null,
					staffingPage ? `Add phones: ${staffingPage}` : null,
				]
					.filter((x) => x !== null)
					.join("\n");

	if (n === 0) {
		const ok = [
			`All departures look fully staffed for ${input.dateFrom} through ${input.dateTo}.`,
			missingBlock,
			staffingPage && !missingBlock ? `\n${staffingPage}` : "",
		]
			.filter(Boolean)
			.join("\n");
		return { subject, bodyText: ok.trim(), smsBody: ok.trim().slice(0, 320) };
	}

	const maxLines = input.maxLines ?? 12;
	const lines = input.gaps.slice(0, maxLines).map((g) => {
		const needs = g.gaps.join(", ");
		const assign =
			base && g.scheduleId
				? ` → ${base}/dashboard/assignments/new?date=${encodeURIComponent(g.date)}&scheduleId=${encodeURIComponent(g.scheduleId)}`
				: base
					? ` → ${base}/dashboard/assignments/new?date=${encodeURIComponent(g.date)}`
					: "";
		return `• ${g.date} ${g.startTime} ${g.tourName} — needs ${needs} (guides ${g.guideCount}/${g.requiredGuides})${assign}`;
	});
	const more =
		n > maxLines
			? `\n…and ${n - maxLines} more.${staffingPage ? ` See all: ${staffingPage}` : " Open Staffing in the dashboard."}`
			: staffingPage
				? `\n\nOpen staffing: ${staffingPage}`
				: "";
	const bodyText = [
		input.orgLabel ? `${input.orgLabel}` : null,
		`${n} departure${n === 1 ? "" : "s"} need staffing (${input.dateFrom} → ${input.dateTo}):`,
		"",
		...lines,
		more,
		missingBlock,
	]
		.filter((x) => x !== null && x !== "")
		.join("\n");

	const smsExtra =
		missing.length > 0
			? ` ${missing.length} missing phone.`
			: "";
	const smsBody =
		n <= 3 && !staffingPage
			? `${n} staffing gap${n === 1 ? "" : "s"}: ${input.gaps
					.slice(0, 3)
					.map((g) => `${g.date} ${g.startTime} ${g.tourName}`)
					.join("; ")}${smsExtra}`
			: staffingPage
				? `${n} staffing gap${n === 1 ? "" : "s"} ${input.dateFrom}–${input.dateTo}.${smsExtra} ${staffingPage}`
				: `${n} staffing gaps ${input.dateFrom}–${input.dateTo}.${smsExtra} Check dashboard Staffing.`;

	return { subject, bodyText, smsBody };
}
