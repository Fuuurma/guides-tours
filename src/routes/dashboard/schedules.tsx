import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/schedules")({
	component: SchedulesPage,
});

interface Schedule {
	_id: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityBooked: number;
	capacityTotal: number;
	status: "available" | "full" | "cancelled";
	tourId: string;
}

function TourCell({ tourId, tourNameById }: { tourId: string; tourNameById: Map<string, string> }) {
	const name = tourNameById.get(tourId);
	return (
		<Link
			to="/dashboard/tours/$tourId"
			params={{ tourId: tourId as Id<"tours"> }}
			className="text-blue-600 hover:underline truncate"
		>
			{name ?? (
				<span className="text-muted-foreground italic text-xs">Unknown tour</span>
			)}
		</Link>
	);
}

function defaultRange(): { from: string; to: string } {
	const to = new Date();
	const from = new Date(to.getTime() - 30 * 86_400_000);
	return {
		from: from.toISOString().slice(0, 10),
		to: to.toISOString().slice(0, 10),
	};
}

function SchedulesPage() {
	const [status, setStatus] = useState<"available" | "full" | "cancelled" | null>(null);
	const [range, setRange] = useState(defaultRange);

	const args: {
		status?: string;
		dateFrom?: string;
		dateTo?: string;
	} = {};
	if (status) args.status = status;
	if (range.from) args.dateFrom = range.from;
	if (range.to) args.dateTo = range.to;

	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: schedules, isPending, error } = useQuery(
		convexQuery(api.tourSchedules.list, args),
	);

	const tourNameById = new Map<string, string>(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);
	const items = (schedules ?? []) as Schedule[];
	const itemCount = items.length;
	const filtersActive = status !== null || range.from !== defaultRange().from;

	const columns: DataTableColumn<Schedule>[] = [
		{
			key: "date",
			header: "Date",
			render: (s) => (
				<Link
					to="/dashboard/schedules/$scheduleId"
					params={{ scheduleId: s._id }}
					className="font-medium text-blue-600 hover:underline"
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
			render: (s) => (
				<TourCell tourId={s.tourId} tourNameById={tourNameById} />
			),
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
			title="Tour schedules"
			description={`${itemCount} schedule${itemCount === 1 ? "" : "s"} — concrete tour instances that customers can book against.${
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
			<div className="mb-4 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Status:</span>
					{(["available", "full", "cancelled"] as const).map((s) => (
						<Button
							key={s}
							variant={status === s ? "default" : "outline"}
							size="sm"
							onClick={() => setStatus(status === s ? null : s)}
						>
							{s}
						</Button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2">
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
						Last 30 days
					</Button>
					{filtersActive && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setStatus(null);
								setRange(defaultRange());
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
						: "No schedules yet."
				}
				searchPlaceholder="Search by date, time, tour, or status…"
			/>
		</ListPage>
	);
}
