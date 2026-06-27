import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/assignments")({
	component: AssignmentsPage,
});

// Shape mirrors the Convex `assignments` row. endTime is optional
// in the schema (some legacy rows predate the field) — we render
// "—" when missing.
interface Assignment {
	_id: string;
	date: string;
	startTime: string;
	endTime?: string;
	guideId: string;
	tourId: string;
	status: "scheduled" | "completed" | "cancelled";
}

function TourCell({ tourId, tourNameById }: { tourId: string; tourNameById: Map<string, string> }) {
	const name = tourNameById.get(tourId);
	return (
		<Link
			to="/dashboard/tours/$tourId"
			params={{ tourId: tourId as Id<"tours"> }}
			className="text-blue-600 hover:underline"
		>
			{name ?? (
				<span className="text-muted-foreground italic text-xs">Unknown tour</span>
			)}
		</Link>
	);
}

function AssignmentsPage() {
	const [status, setStatus] = useState<"scheduled" | "completed" | "cancelled" | null>(null);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: assignments, isPending, error } = useQuery(
		convexQuery(api.assignments.list, status ? { status } : {}),
	);

	const tourNameById = new Map<string, string>(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);
	const items = (assignments ?? []) as Assignment[];
	const itemCount = items.length;

	const columns: DataTableColumn<Assignment>[] = [
		{
			key: "date",
			header: "Date",
			render: (a) => (
				<Link
					to="/dashboard/assignments/$assignmentId"
					params={{ assignmentId: a._id }}
					className="font-medium text-blue-600 hover:underline"
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
			render: (a) => (
				<TourCell tourId={a.tourId} tourNameById={tourNameById} />
			),
			searchValue: (a) =>
				tourNameById.get(a.tourId) ?? a.tourId,
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
				status ? ` · filtered by ${status}` : ""
			}`}
			newTo="/dashboard/assignments/new"
			newLabel="+ New assignment"
		>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-sm">Status:</span>
				{(["scheduled", "completed", "cancelled"] as const).map((s) => (
					<Button
						key={s}
						variant={status === s ? "default" : "outline"}
						size="sm"
						onClick={() => setStatus(status === s ? null : s)}
					>
						{s}
					</Button>
				))}
				{status && (
					<Button variant="ghost" size="sm" onClick={() => setStatus(null)}>
						Clear
					</Button>
				)}
			</div>
			<DataTable
				data={items}
				columns={columns}
				rowKey={(a) => a._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					status ? `No ${status} assignments.` : "No assignments yet."
				}
				searchPlaceholder="Search by date, time, guide, or tour…"
			/>
		</ListPage>
	);
}
