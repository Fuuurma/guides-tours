import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TourCell } from "@/components/tour-cell";
import { defaultDateRange } from "@/lib/date-range";
import { api } from "../../../convex/_generated/api";
import type { Assignment } from "@/types/entities";

export const Route = createFileRoute("/dashboard/assignments")({
	component: AssignmentsPage,
});

function AssignmentsPage() {
	const [status, setStatus] = useState<
		"scheduled" | "completed" | "cancelled" | null
	>(null);
	const [range, setRange] = useState(defaultDateRange);

	const args: {
		status?: "scheduled" | "completed" | "cancelled";
		dateFrom?: string;
		dateTo?: string;
	} = {};
	if (status) args.status = status;
	if (range.from) args.dateFrom = range.from;
	if (range.to) args.dateTo = range.to;

	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const {
		data: assignments,
		isPending,
		error,
	} = useQuery(convexQuery(api.assignments.list, args));

	const tourNameById = new Map<string, string>(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);
	const items = (assignments ?? []) as Assignment[];
	const itemCount = items.length;
	const filtersActive = status !== null || range.from !== defaultDateRange().from;

	const columns: DataTableColumn<Assignment>[] = [
		{
			key: "date",
			header: "Date",
			render: (a) => (
				<Link
					to="/dashboard/assignments/$assignmentId"
					params={{ assignmentId: a._id }}
					className="font-medium text-link hover:underline"
				>
					{a.date}
				</Link>
			),
			searchValue: (a) => a.date,
		},
		{
			key: "time",
			header: "Time",
			render: (a) => (
				<span className="font-mono text-xs">
					{a.startTime}–{a.endTime ?? "—"}
				</span>
			),
			searchValue: (a) => `${a.startTime} ${a.endTime ?? ""}`,
		},
		{
			key: "guide",
			header: "Guide",
			render: (a) => a.guideId,
			searchValue: (a) => a.guideId,
		},
		{
			key: "tour",
			header: "Tour",
			render: (a) => <TourCell tourId={a.tourId} tourNameById={tourNameById} />,
			searchValue: (a) => tourNameById.get(a.tourId) ?? a.tourId,
		},
		{
			key: "status",
			header: "Status",
			render: (a) => <StatusBadge status={a.status} />,
			searchValue: (a) => a.status,
		},
	];

	return (
		<ListPage
			title="Assignments"
			description={`${itemCount} assignment${itemCount === 1 ? "" : "s"}${
				status || filtersActive
					? ` · filtered${status ? ` by ${status}` : ""}${
							range.from
								? ` from ${range.from}${range.to ? ` to ${range.to}` : ""}`
								: ""
						}`
					: ""
			}`}
			newTo="/dashboard/assignments/new"
			newLabel="+ New assignment"
		>
			<div className="mb-4 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Status:</span>
					{(["scheduled", "completed", "cancelled"] as const).map((s) => (
						<Button
							key={s}
							variant={status === s ? "default" : "outline"}
							size="sm"
							onClick={() => setStatus(status === s ? null : s)}
							aria-pressed={status === s}
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
						onClick={() => setRange(defaultDateRange())}
					>
						Last 30 days
					</Button>
					{filtersActive && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setStatus(null);
								setRange(defaultDateRange());
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
				rowKey={(a) => a._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					status || filtersActive
						? "No assignments match the current filters."
						: "No assignments yet."
				}
				searchPlaceholder="Search by date, time, guide, or tour…"
			/>
		</ListPage>
	);
}
