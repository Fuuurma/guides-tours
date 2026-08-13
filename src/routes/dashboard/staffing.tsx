import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ListPage } from "@/components/list-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { addDaysLocal, localYmd } from "@/lib/calendar-date";
import type { SlotGap } from "@/lib/staffing";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

function defaultRange() {
	const from = localYmd();
	const to = localYmd(addDaysLocal(new Date(), 14));
	return { from, to };
}

function parseYmd(raw: unknown): string | undefined {
	if (typeof raw !== "string") return undefined;
	return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

export const Route = createFileRoute("/dashboard/staffing")({
	validateSearch: (
		search: Record<string, unknown>,
	): { from?: string; to?: string } => {
		const out: { from?: string; to?: string } = {};
		const from = parseYmd(search.from);
		const to = parseYmd(search.to);
		if (from) out.from = from;
		if (to) out.to = to;
		return out;
	},
	component: StaffingPage,
});

function gapLabel(g: SlotGap): string {
	if (g === "guides") return "guides";
	if (g === "vehicle") return "vehicle";
	return "driver";
}

function roleLabel(roles: string[]): string {
	return roles.join(" · ");
}

function StaffingPage() {
	const search = Route.useSearch();
	const [range, setRange] = useState(() => ({
		from: search.from ?? defaultRange().from,
		to: search.to ?? defaultRange().to,
	}));
	const {
		data: gaps,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.assignments.staffingGaps, {
			dateFrom: range.from,
			dateTo: range.to,
		}),
	);
	const { data: missingPhones, isPending: missingPending } = useQuery(
		convexQuery(api.userProfiles.missingStaffPhones, {
			dateFrom: range.from,
			dateTo: range.to,
		}),
	);
	const { data: remindStatus } = useQuery(
		convexQuery(api.phoneReminders.cooldownStatus, {
			dateFrom: range.from,
			dateTo: range.to,
		}),
	);

	const sendPhoneReminders = useMutation(api.phoneReminders.sendReminders);
	const [remindPending, setRemindPending] = useState(false);

	const items = gaps ?? [];
	const missing = missingPhones ?? [];
	const summary = useMemo(() => {
		let needGuides = 0;
		let needVehicle = 0;
		let needDriver = 0;
		for (const g of items) {
			if (g.gaps.includes("guides")) needGuides += 1;
			if (g.gaps.includes("vehicle")) needVehicle += 1;
			if (g.gaps.includes("driver")) needDriver += 1;
		}
		return { needGuides, needVehicle, needDriver };
	}, [items]);

	const onRemindPhones = async () => {
		setRemindPending(true);
		try {
			const result = await sendPhoneReminders({
				dateFrom: range.from,
				dateTo: range.to,
			});
			toast.success(
				`Reminders queued for ${result.eligible} staff${
					result.capped ? " (capped at 50)" : ""
				}${
					result.coolingDown
						? ` · ${result.coolingDown} still in 7-day cooldown`
						: ""
				}`,
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setRemindPending(false);
		}
	};

	return (
		<ListPage
			title="Staffing"
			description="Upcoming departures missing a guide, vehicle, or driver"
		>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-sm">Date range:</span>
				<Input
					type="date"
					value={range.from}
					onChange={(e) => setRange({ ...range, from: e.target.value })}
					className="w-auto"
				/>
				<span className="text-muted-foreground text-sm">→</span>
				<Input
					type="date"
					value={range.to}
					onChange={(e) => setRange({ ...range, to: e.target.value })}
					className="w-auto"
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setRange(defaultRange())}
				>
					Next 14 days
				</Button>
			</div>

			{!missingPending && missing.length > 0 && (
				<Alert className="mb-4">
					<AlertTitle>
						{missing.length} assigned staff missing a phone
					</AlertTitle>
					<AlertDescription>
						<div className="flex flex-col gap-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p>
									Assignment SMS won&apos;t reach them until a phone is on their
									profile.
								</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={
										remindPending || remindStatus?.canSendManual === false
									}
									onClick={() => void onRemindPhones()}
									title={
										remindStatus && !remindStatus.orgBulkClear
											? "Org bulk cooldown — try again later"
											: remindStatus && remindStatus.eligibleCount === 0
												? "Everyone eligible was reminded in the last 7 days"
												: undefined
									}
								>
									{remindPending ? <Spinner data-icon="inline-start" /> : null}
									{remindPending ? "Sending…" : "Email reminders"}
								</Button>
							</div>
							<ul className="flex flex-col gap-2">
								{missing.slice(0, 12).map((p) => (
									<li
										key={p.userId}
										className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground"
									>
										<span>
											<span className="font-medium">{p.name}</span>
											<span className="text-muted-foreground">
												{" "}
												· {roleLabel(p.roles)} · {p.assignmentCount} assignment
												{p.assignmentCount === 1 ? "" : "s"}
											</span>
										</span>
										<div className="flex flex-wrap gap-2">
											<Button asChild size="sm" variant="outline">
												<Link
													to="/dashboard/guides/$userId"
													params={{ userId: p.userId }}
												>
													Add phone
												</Link>
											</Button>
											{p.driverId ? (
												<Button asChild size="sm" variant="ghost">
													<Link
														to="/dashboard/drivers/$driverId"
														params={{ driverId: p.driverId }}
													>
														Driver
													</Link>
												</Button>
											) : null}
										</div>
									</li>
								))}
							</ul>
							{missing.length > 12 ? (
								<p className="text-xs">…and {missing.length - 12} more</p>
							) : null}
						</div>
					</AlertDescription>
				</Alert>
			)}

			{!isPending && items.length > 0 && (
				<p className="text-muted-foreground mb-4 text-sm">
					{items.length} gap{items.length === 1 ? "" : "s"}
					{summary.needGuides ? ` · ${summary.needGuides} need guides` : ""}
					{summary.needVehicle ? ` · ${summary.needVehicle} need vehicle` : ""}
					{summary.needDriver ? ` · ${summary.needDriver} need driver` : ""}
				</p>
			)}

			{error && <ErrorBanner message={getSafeDisplayMessage(error)} />}
			{isPending ? (
				<Skeleton className="h-48 w-full" />
			) : items.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Users />
						</EmptyMedia>
						<EmptyTitle>No staffing gaps</EmptyTitle>
						<EmptyDescription>
							Every published departure in this range has the guides and fleet
							it needs. Open the calendar to assign the next week.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<div className="flex flex-wrap justify-center gap-2">
							<Button asChild>
								<Link to="/dashboard/calendar">Open calendar</Link>
							</Button>
							<Button asChild variant="outline">
								<Link to="/dashboard/assignments/new">New assignment</Link>
							</Button>
						</div>
					</EmptyContent>
				</Empty>
			) : (
				<ul className="divide-y rounded-md border">
					{items.map((g) => (
						<li
							key={g.key}
							className="flex flex-wrap items-center justify-between gap-3 p-4"
						>
							<div className="flex min-w-0 flex-col gap-1">
								<p className="font-medium">
									{g.date} · {g.startTime}
									{g.endTime ? `–${g.endTime}` : ""} · {g.tourName}
								</p>
								<p className="text-muted-foreground text-xs">
									Guides {g.guideCount}/{g.requiredGuides}
									{g.requiresVehicle
										? ` · vehicle ${g.hasVehicle ? "✓" : "needed"}`
										: ""}
									{g.requiresDriver
										? ` · driver ${g.hasDriver ? "✓" : "needed"}`
										: ""}
									{g.capacityBooked > 0 ? ` · ${g.capacityBooked} booked` : ""}
								</p>
								<div className="flex flex-wrap gap-1">
									{g.gaps.map((gap) => (
										<Badge key={gap} variant="secondary">
											Needs {gapLabel(gap)}
											{gap === "guides" && g.guidesNeeded > 0
												? ` (${g.guidesNeeded})`
												: ""}
										</Badge>
									))}
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								{g.scheduleId ? (
									<Button asChild size="sm" variant="outline">
										<Link
											to="/dashboard/schedules/$scheduleId"
											params={{ scheduleId: g.scheduleId }}
										>
											Schedule
										</Link>
									</Button>
								) : null}
								<Button asChild size="sm">
									<Link
										to="/dashboard/assignments/new"
										search={{
											date: g.date,
											...(g.scheduleId ? { scheduleId: g.scheduleId } : {}),
										}}
									>
										+ Assign
									</Link>
								</Button>
								{g.assignmentIds[0] ? (
									<Button asChild size="sm" variant="ghost">
										<Link
											to="/dashboard/assignments/$assignmentId"
											params={{ assignmentId: g.assignmentIds[0] }}
										>
											Open
										</Link>
									</Button>
								) : null}
							</div>
						</li>
					))}
				</ul>
			)}
		</ListPage>
	);
}
