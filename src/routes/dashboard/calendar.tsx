import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrgMembers } from "@/hooks/use-org-members";
import {
	addDaysLocal,
	daysInMonthLocal,
	formatMonthLabel,
	localYmd,
	startOfMonthLocal,
	startOfWeekLocal,
} from "@/lib/calendar-date";
import { evaluateSlotStaffing, resolveTourStaffing } from "@/lib/staffing";
import { cn, getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/calendar")({
	component: CalendarPage,
});

const ALL = "__all__";

type AssignmentRow = {
	_id: string;
	tourId: string;
	guideId: string;
	date: string;
	startTime: string;
	endTime?: string;
	status: string;
	vehicleId?: string;
	driverId?: string;
};

type TourLite = {
	_id: string;
	name: string;
	tourType: string;
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
};

type SlotFleet = {
	guideCount: number;
	hasVehicle: boolean;
	hasDriver: boolean;
};

function CalendarPage() {
	const [cursor, setCursor] = useState(() => new Date());
	const [view, setView] = useState<"month" | "week">("week");
	const [guideFilter, setGuideFilter] = useState(ALL);
	const [tourFilter, setTourFilter] = useState(ALL);
	const [statusFilter, setStatusFilter] = useState(ALL);

	const range = useMemo(() => {
		if (view === "week") {
			const weekStart = startOfWeekLocal(cursor);
			const weekEnd = addDaysLocal(weekStart, 6);
			return { from: localYmd(weekStart), to: localYmd(weekEnd), weekStart };
		}
		const year = cursor.getFullYear();
		const month = cursor.getMonth();
		const from = localYmd(new Date(year, month, 1));
		const to = localYmd(new Date(year, month + 1, 0));
		return { from, to, weekStart: null as Date | null };
	}, [cursor, view]);

	const listArgs = {
		dateFrom: range.from,
		dateTo: range.to,
		...(guideFilter !== ALL ? { guideId: guideFilter } : {}),
		...(tourFilter !== ALL ? { tourId: tourFilter as Id<"tours"> } : {}),
		...(statusFilter !== ALL
			? {
					status: statusFilter as "scheduled" | "completed" | "cancelled",
				}
			: {}),
	};

	const {
		data: assignments,
		isPending,
		error,
	} = useQuery(convexQuery(api.assignments.list, listArgs));
	const { data: schedules } = useQuery(
		convexQuery(api.tourSchedules.list, {
			dateFrom: range.from,
			dateTo: range.to,
		}),
	);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { members, displayName } = useOrgMembers(["guide", "owner", "admin"]);

	const tourNameById = useMemo(
		() => new Map((tours ?? []).map((t) => [String(t._id), t.name])),
		[tours],
	);
	const tourById = useMemo(() => {
		const map = new Map<string, TourLite>();
		for (const t of (tours ?? []) as TourLite[]) {
			map.set(String(t._id), t);
		}
		return map;
	}, [tours]);

	const byDate = useMemo(() => {
		const map = new Map<string, AssignmentRow[]>();
		for (const a of (assignments ?? []) as AssignmentRow[]) {
			const list = map.get(a.date) ?? [];
			list.push(a);
			map.set(a.date, list);
		}
		for (const list of map.values()) {
			list.sort((a, b) => a.startTime.localeCompare(b.startTime));
		}
		return map;
	}, [assignments]);

	const slotFleetByKey = useMemo(() => {
		const map = new Map<string, SlotFleet>();
		for (const a of (assignments ?? []) as AssignmentRow[]) {
			if (a.status === "cancelled") continue;
			const key = `${a.tourId}|${a.date}|${a.startTime}`;
			const agg = map.get(key) ?? {
				guideCount: 0,
				hasVehicle: false,
				hasDriver: false,
			};
			agg.guideCount += 1;
			if (a.vehicleId) agg.hasVehicle = true;
			if (a.driverId) agg.hasDriver = true;
			map.set(key, agg);
		}
		return map;
	}, [assignments]);

	const scheduleCountByDate = useMemo(() => {
		const map = new Map<string, number>();
		for (const s of schedules ?? []) {
			map.set(s.date, (map.get(s.date) ?? 0) + 1);
		}
		return map;
	}, [schedules]);

	/** Schedules (or assignment slots) with staffing gaps for the day. */
	const gapCountByDate = useMemo(() => {
		const map = new Map<string, number>();
		const seen = new Set<string>();
		for (const s of schedules ?? []) {
			if (s.status === "cancelled") continue;
			const key = `${s.tourId}|${s.date}|${s.startTime}`;
			seen.add(key);
			const tour = tourById.get(String(s.tourId));
			if (!tour) continue;
			const rules = resolveTourStaffing({
				tourType: tour.tourType,
				requiredGuides: tour.requiredGuides,
				requiresVehicle: tour.requiresVehicle,
				requiresDriver: tour.requiresDriver,
				requiredVehicleType: tour.requiredVehicleType,
			});
			const fleet = slotFleetByKey.get(key);
			const { ready } = evaluateSlotStaffing({
				requiredGuides: rules.requiredGuides,
				requiresVehicle: rules.requiresVehicle,
				requiresDriver: rules.requiresDriver,
				guideCount: fleet?.guideCount ?? 0,
				hasVehicle: fleet?.hasVehicle ?? false,
				hasDriver: fleet?.hasDriver ?? false,
			});
			if (!ready) map.set(s.date, (map.get(s.date) ?? 0) + 1);
		}
		for (const [key, fleet] of slotFleetByKey) {
			if (seen.has(key)) continue;
			const [tourId, date] = key.split("|");
			if (!tourId || !date) continue;
			const tour = tourById.get(tourId);
			if (!tour) continue;
			const rules = resolveTourStaffing({
				tourType: tour.tourType,
				requiredGuides: tour.requiredGuides,
				requiresVehicle: tour.requiresVehicle,
				requiresDriver: tour.requiresDriver,
				requiredVehicleType: tour.requiredVehicleType,
			});
			const { ready } = evaluateSlotStaffing({
				requiredGuides: rules.requiredGuides,
				requiresVehicle: rules.requiresVehicle,
				requiresDriver: rules.requiresDriver,
				guideCount: fleet.guideCount,
				hasVehicle: fleet.hasVehicle,
				hasDriver: fleet.hasDriver,
			});
			if (!ready) map.set(date, (map.get(date) ?? 0) + 1);
		}
		return map;
	}, [schedules, slotFleetByKey, tourById]);

	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const monthLabel = formatMonthLabel(cursor);

	const shift = (dir: -1 | 1) => {
		if (view === "week") {
			setCursor((c) => addDaysLocal(c, dir * 7));
		} else {
			setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
		}
	};

	const goToday = () => {
		const now = new Date();
		setCursor(view === "week" ? now : startOfMonthLocal(now));
	};

	const onViewChange = (next: string) => {
		const v = next as "month" | "week";
		setView(v);
		if (v === "week") {
			// Month view parks the cursor on day 1 — jump to today when
			// that month is the current month so Week shows this week.
			setCursor((c) => {
				const today = new Date();
				if (
					c.getDate() === 1 &&
					c.getMonth() === today.getMonth() &&
					c.getFullYear() === today.getFullYear()
				) {
					return today;
				}
				return c;
			});
		} else {
			setCursor((c) => startOfMonthLocal(c));
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">Calendar</h1>
					<p className="text-muted-foreground text-sm">
						Who is out this week — guides, vehicles, and open gaps ·{" "}
						<Link
							to="/dashboard/staffing"
							className="text-link hover:underline"
						>
							Staffing
						</Link>
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => shift(-1)}
					>
						Prev
					</Button>
					<span className="min-w-[10rem] text-center text-sm font-medium">
						{view === "week" ? `${range.from} → ${range.to}` : monthLabel}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => shift(1)}
					>
						Next
					</Button>
					<Button type="button" variant="ghost" size="sm" onClick={goToday}>
						Today
					</Button>
					<Button asChild size="sm">
						<Link to="/dashboard/assignments/new">+ Assignment</Link>
					</Button>
				</div>
			</header>

			<div className="flex flex-wrap gap-3">
				<Select value={guideFilter} onValueChange={setGuideFilter}>
					<SelectTrigger className="w-[180px]">
						<SelectValue placeholder="Guide" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>All guides</SelectItem>
							{(members ?? []).map((m) => (
								<SelectItem key={m.userId} value={m.userId}>
									{m.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Select value={tourFilter} onValueChange={setTourFilter}>
					<SelectTrigger className="w-[180px]">
						<SelectValue placeholder="Tour" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>All tours</SelectItem>
							{(tours ?? []).map((t) => (
								<SelectItem key={t._id} value={t._id}>
									{t.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger className="w-[160px]">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>All statuses</SelectItem>
							<SelectItem value="scheduled">Scheduled</SelectItem>
							<SelectItem value="completed">Completed</SelectItem>
							<SelectItem value="cancelled">Cancelled</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{error && <ErrorBanner message={getSafeDisplayMessage(error)} />}

			<Tabs value={view} onValueChange={onViewChange}>
				<TabsList>
					<TabsTrigger value="week">Week</TabsTrigger>
					<TabsTrigger value="month">Month</TabsTrigger>
				</TabsList>

				<TabsContent value="month" className="mt-4">
					<Card>
						<CardContent className="pt-6">
							{isPending ? (
								<Skeleton className="h-96 w-full" />
							) : (
								<MonthGrid
									year={year}
									month={month}
									byDate={byDate}
									scheduleCountByDate={scheduleCountByDate}
									gapCountByDate={gapCountByDate}
									slotFleetByKey={slotFleetByKey}
									tourById={tourById}
									tourNameById={tourNameById}
									displayName={displayName}
								/>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="week" className="mt-4">
					{isPending ? (
						<Skeleton className="h-64 w-full" />
					) : (
						<WeekAgenda
							weekStart={range.weekStart ?? startOfWeekLocal(cursor)}
							byDate={byDate}
							scheduleCountByDate={scheduleCountByDate}
							gapCountByDate={gapCountByDate}
							slotFleetByKey={slotFleetByKey}
							tourById={tourById}
							tourNameById={tourNameById}
							displayName={displayName}
						/>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}

function AssignmentChip({
	a,
	tourName,
	guideName,
	slotFleet,
	tour,
}: {
	a: AssignmentRow;
	tourName: string;
	guideName: string;
	slotFleet?: SlotFleet;
	tour?: TourLite;
}) {
	const rules = tour
		? resolveTourStaffing({
				tourType: tour.tourType,
				requiredGuides: tour.requiredGuides,
				requiresVehicle: tour.requiresVehicle,
				requiresDriver: tour.requiresDriver,
				requiredVehicleType: tour.requiredVehicleType,
			})
		: null;
	const fleetGap =
		rules &&
		!evaluateSlotStaffing({
			requiredGuides: rules.requiredGuides,
			requiresVehicle: rules.requiresVehicle,
			requiresDriver: rules.requiresDriver,
			guideCount: slotFleet?.guideCount ?? 1,
			hasVehicle: slotFleet?.hasVehicle ?? Boolean(a.vehicleId),
			hasDriver: slotFleet?.hasDriver ?? Boolean(a.driverId),
		}).ready;

	const markers: string[] = [];
	if (a.vehicleId || slotFleet?.hasVehicle) markers.push("V");
	if (a.driverId || slotFleet?.hasDriver) markers.push("D");
	if (rules?.requiresVehicle && !(a.vehicleId || slotFleet?.hasVehicle)) {
		markers.push("!V");
	}
	if (rules?.requiresDriver && !(a.driverId || slotFleet?.hasDriver)) {
		markers.push("!D");
	}

	return (
		<Link
			to="/dashboard/assignments/$assignmentId"
			params={{ assignmentId: a._id }}
			className={cn(
				"block rounded-sm border px-1.5 py-0.5 text-[11px] leading-tight hover:bg-muted truncate",
				a.status === "cancelled" && "opacity-50 line-through",
				a.status === "completed" && "border-primary/30 bg-primary/5",
				fleetGap &&
					a.status === "scheduled" &&
					"border-destructive/50 bg-destructive/5",
				!fleetGap &&
					a.status === "scheduled" &&
					(a.vehicleId || a.driverId) &&
					"border-primary/30 bg-primary/5",
			)}
			title={`${a.startTime} ${tourName} · ${guideName}${markers.length ? ` · ${markers.join(" ")}` : ""}`}
			onClick={(e) => e.stopPropagation()}
		>
			<span className="font-medium">{a.startTime}</span> {tourName}
			{markers.length > 0 ? (
				<span className="text-muted-foreground"> · {markers.join("")}</span>
			) : null}
		</Link>
	);
}

function MonthGrid({
	year,
	month,
	byDate,
	scheduleCountByDate,
	gapCountByDate,
	slotFleetByKey,
	tourById,
	tourNameById,
	displayName,
}: {
	year: number;
	month: number;
	byDate: Map<string, AssignmentRow[]>;
	scheduleCountByDate: Map<string, number>;
	gapCountByDate: Map<string, number>;
	slotFleetByKey: Map<string, SlotFleet>;
	tourById: Map<string, TourLite>;
	tourNameById: Map<string, string>;
	displayName: (userId: string) => string;
}) {
	const totalDays = daysInMonthLocal(year, month);
	const firstDow = new Date(year, month, 1).getDay();
	const today = localYmd(new Date());

	return (
		<div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border">
			{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
				<div
					key={d}
					className="bg-muted/50 text-muted-foreground text-center text-xs font-medium py-2"
				>
					{d}
				</div>
			))}
			{[...Array(firstDow).keys()].map((pad) => (
				<div
					key={`empty-${year}-${month}-before-${pad}`}
					className="bg-muted/20 min-h-24"
				/>
			))}
			{Array.from({ length: totalDays }, (_, dayZero) => dayZero + 1).map(
				(day) => {
					const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
					const items = byDate.get(date) ?? [];
					const scheduleCount = scheduleCountByDate.get(date) ?? 0;
					const gaps = gapCountByDate.get(date) ?? 0;
					const isToday = date === today;
					return (
						<div
							key={date}
							className={cn(
								"bg-background min-h-24 p-1 flex flex-col gap-0.5",
								isToday && "ring-1 ring-inset ring-primary",
								gaps > 0 && "bg-destructive/5",
							)}
						>
							<div className="flex items-center justify-between gap-1 px-0.5">
								<Link
									to="/dashboard/assignments/new"
									search={{ date }}
									className={cn(
										"text-xs font-medium hover:underline size-6 flex items-center justify-center rounded-full",
										isToday && "bg-primary text-primary-foreground",
									)}
									title={`New assignment on ${date}`}
								>
									{day}
								</Link>
								<div className="flex items-center gap-1">
									{gaps > 0 && (
										<span
											className="text-[10px] font-medium text-destructive"
											title={`${gaps} departure(s) need staffing`}
										>
											{gaps}!
										</span>
									)}
									{scheduleCount > 0 && (
										<span
											className="text-[10px] text-muted-foreground"
											title={`${scheduleCount} schedule(s)`}
										>
											{scheduleCount}s
										</span>
									)}
								</div>
							</div>
							<div className="flex flex-col gap-0.5 overflow-hidden">
								{items.slice(0, 3).map((a) => {
									const slotKey = `${a.tourId}|${a.date}|${a.startTime}`;
									return (
										<AssignmentChip
											key={a._id}
											a={a}
											tourName={tourNameById.get(a.tourId) ?? "Tour"}
											guideName={displayName(a.guideId)}
											slotFleet={slotFleetByKey.get(slotKey)}
											tour={tourById.get(a.tourId)}
										/>
									);
								})}
								{items.length > 3 && (
									<span className="text-[10px] text-muted-foreground px-1">
										+{items.length - 3} more
									</span>
								)}
							</div>
						</div>
					);
				},
			)}
		</div>
	);
}

function WeekAgenda({
	weekStart,
	byDate,
	scheduleCountByDate,
	gapCountByDate,
	slotFleetByKey,
	tourById,
	tourNameById,
	displayName,
}: {
	weekStart: Date;
	byDate: Map<string, AssignmentRow[]>;
	scheduleCountByDate: Map<string, number>;
	gapCountByDate: Map<string, number>;
	slotFleetByKey: Map<string, SlotFleet>;
	tourById: Map<string, TourLite>;
	tourNameById: Map<string, string>;
	displayName: (userId: string) => string;
}) {
	const days = Array.from({ length: 7 }).map((_, i) =>
		addDaysLocal(weekStart, i),
	);
	const today = localYmd(new Date());

	return (
		<div className="flex flex-col gap-3">
			{days.map((d) => {
				const date = localYmd(d);
				const items = byDate.get(date) ?? [];
				const scheduleCount = scheduleCountByDate.get(date) ?? 0;
				const gaps = gapCountByDate.get(date) ?? 0;
				const label = d.toLocaleDateString("en-US", {
					weekday: "short",
					month: "short",
					day: "numeric",
				});
				return (
					<Card key={date} className={cn(date === today && "border-primary")}>
						<CardHeader className="flex flex-row items-center justify-between gap-0 py-3">
							<div>
								<CardTitle className="text-base">{label}</CardTitle>
								<CardDescription>
									{items.length} assignment{items.length === 1 ? "" : "s"}
									{scheduleCount > 0
										? ` · ${scheduleCount} schedule${scheduleCount === 1 ? "" : "s"}`
										: ""}
									{gaps > 0 ? ` · ${gaps} need staffing` : ""}
								</CardDescription>
							</div>
							<div className="flex gap-2">
								{gaps > 0 && (
									<Button asChild size="sm" variant="secondary">
										<Link to="/dashboard/staffing">Gaps</Link>
									</Button>
								)}
								<Button asChild size="sm" variant="outline">
									<Link to="/dashboard/assignments/new" search={{ date }}>
										+ Assign
									</Link>
								</Button>
							</div>
						</CardHeader>
						<CardContent className="pb-3">
							{items.length === 0 ? (
								<Empty className="min-h-0 border-dashed p-4 md:p-6">
									<EmptyHeader>
										<EmptyTitle className="text-base">
											{scheduleCount > 0
												? "Published, not assigned"
												: "No departures"}
										</EmptyTitle>
										<EmptyDescription>
											{scheduleCount > 0
												? `${scheduleCount} schedule${scheduleCount === 1 ? "" : "s"} on this day still need a guide.`
												: gaps > 0
													? `${gaps} departure${gaps === 1 ? "" : "s"} still need staffing.`
													: "Assign a guide or publish a schedule for this day."}
										</EmptyDescription>
									</EmptyHeader>
									<EmptyContent>
										<div className="flex flex-wrap justify-center gap-2">
											<Button asChild size="sm">
												<Link to="/dashboard/assignments/new" search={{ date }}>
													Assign guide
												</Link>
											</Button>
											<Button asChild size="sm" variant="outline">
												<Link to="/dashboard/schedules/new" search={{ date }}>
													New schedule
												</Link>
											</Button>
										</div>
									</EmptyContent>
								</Empty>
							) : (
								<ul className="flex flex-col gap-2">
									{items.map((a) => {
										const slotKey = `${a.tourId}|${a.date}|${a.startTime}`;
										const tour = tourById.get(a.tourId);
										const fleet = slotFleetByKey.get(slotKey);
										const rules = tour
											? resolveTourStaffing({
													tourType: tour.tourType,
													requiredGuides: tour.requiredGuides,
													requiresVehicle: tour.requiresVehicle,
													requiresDriver: tour.requiresDriver,
													requiredVehicleType: tour.requiredVehicleType,
												})
											: null;
										const incomplete =
											rules &&
											!evaluateSlotStaffing({
												requiredGuides: rules.requiredGuides,
												requiresVehicle: rules.requiresVehicle,
												requiresDriver: rules.requiresDriver,
												guideCount: fleet?.guideCount ?? 1,
												hasVehicle: fleet?.hasVehicle ?? false,
												hasDriver: fleet?.hasDriver ?? false,
											}).ready;
										return (
											<li
												key={a._id}
												className="flex flex-wrap items-center justify-between gap-2"
											>
												<Link
													to="/dashboard/assignments/$assignmentId"
													params={{ assignmentId: a._id }}
													className="text-sm text-link hover:underline"
												>
													{a.startTime}
													{a.endTime ? `–${a.endTime}` : ""} ·{" "}
													{tourNameById.get(a.tourId) ?? "Tour"} ·{" "}
													{displayName(a.guideId)}
													{a.vehicleId ? " · V" : ""}
													{a.driverId ? " · D" : ""}
												</Link>
												<div className="flex items-center gap-2">
													{incomplete ? (
														<Badge variant="destructive">Incomplete</Badge>
													) : null}
													<Badge variant="secondary">{a.status}</Badge>
												</div>
											</li>
										);
									})}
								</ul>
							)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
