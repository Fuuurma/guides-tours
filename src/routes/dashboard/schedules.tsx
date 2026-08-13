import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { TourCell } from "@/components/tour-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { upcomingDateRange } from "@/lib/date-range";
import type { Schedule } from "@/types/entities";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/schedules")({
	component: SchedulesPage,
});

const STATUS_FILTERS = ["available", "full", "cancelled"] as const;

function SchedulesPage() {
	const [status, setStatus] = useState<
		"available" | "full" | "cancelled" | null
	>(null);
	const [range, setRange] = useState(upcomingDateRange);

	const args: {
		status?: string;
		dateFrom?: string;
		dateTo?: string;
	} = {};
	if (status) args.status = status;
	if (range.from) args.dateFrom = range.from;
	if (range.to) args.dateTo = range.to;

	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const {
		data: schedules,
		isPending,
		error,
	} = useQuery(convexQuery(api.tourSchedules.list, args));

	const tourNameById = new Map<string, string>(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);
	const items = (schedules ?? []) as Schedule[];
	const itemCount = items.length;
	const filtersActive =
		status !== null || range.from !== upcomingDateRange().from;

	const columns: DataTableColumn<Schedule>[] = [
		{
			key: "date",
			header: "Date",
			render: (s) => (
				<Link
					to="/dashboard/schedules/$scheduleId"
					params={{ scheduleId: s._id }}
					className="font-medium text-link hover:underline"
				>
					{s.date}
				</Link>
			),
			searchValue: (s) => s.date,
		},
		{
			key: "time",
			header: "Time",
			render: (s) => (
				<span className="font-mono text-xs">
					{s.startTime}–{s.endTime}
				</span>
			),
			searchValue: (s) => `${s.startTime} ${s.endTime}`,
		},
		{
			key: "tour",
			header: "Tour",
			render: (s) => <TourCell tourId={s.tourId} tourNameById={tourNameById} />,
			searchValue: (s) => tourNameById.get(s.tourId) ?? s.tourId,
		},
		{ key: "booked", header: "Booked", render: (s) => s.capacityBooked },
		{ key: "capacity", header: "Capacity", render: (s) => s.capacityTotal },
		{
			key: "status",
			header: "Status",
			render: (s) => <StatusBadge status={s.status} />,
			searchValue: (s) => s.status,
		},
	];

	return (
		<ListPage
			title="Schedules"
			description={`${itemCount} departure${itemCount === 1 ? "" : "s"} — when a tour actually runs.${
				status || filtersActive
					? ` Filtered${status ? ` by ${status}` : ""}${
							range.from
								? ` from ${range.from}${range.to ? ` to ${range.to}` : ""}`
								: ""
						}.`
					: ""
			}`}
			newTo="/dashboard/schedules/new"
			newLabel="+ New schedule"
		>
			<div className="mb-4 flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Status</span>
					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						spacing={2}
						value={status ?? ""}
						onValueChange={(value) => {
							if (
								value === "available" ||
								value === "full" ||
								value === "cancelled"
							) {
								setStatus(value);
							} else {
								setStatus(null);
							}
						}}
						className="flex-wrap justify-start"
						aria-label="Filter by status"
					>
						{STATUS_FILTERS.map((value) => (
							<ToggleGroupItem key={value} value={value}>
								{value}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Date range</span>
					<Input
						type="date"
						value={range.from}
						onChange={(e) => setRange({ ...range, from: e.target.value })}
						className="w-auto"
						aria-label="From date"
					/>
					<span className="text-muted-foreground text-sm">→</span>
					<Input
						type="date"
						value={range.to}
						onChange={(e) => setRange({ ...range, to: e.target.value })}
						className="w-auto"
						aria-label="To date"
					/>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setRange(upcomingDateRange())}
					>
						Next 30 days
					</Button>
					{filtersActive && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setStatus(null);
								setRange(upcomingDateRange());
							}}
						>
							Clear all
						</Button>
					)}
				</div>
			</div>
			<DataTable
				data={items}
				columns={columns}
				rowKey={(s) => s._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					status || filtersActive
						? "No schedules match the current filters."
						: "No upcoming departures"
				}
				emptyDescription={
					status || filtersActive
						? undefined
						: "Publish a date and time for a tour, then assign a guide and vehicle."
				}
				emptyAction={
					status || filtersActive ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setStatus(null);
								setRange(upcomingDateRange());
							}}
						>
							Clear filters
						</Button>
					) : (
						<Button asChild size="sm">
							<Link to="/dashboard/schedules/new">Create a schedule</Link>
						</Button>
					)
				}
				searchPlaceholder="Search by date, time, tour, or status…"
			/>
		</ListPage>
	);
}
