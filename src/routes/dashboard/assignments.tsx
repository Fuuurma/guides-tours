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
import { useOrgMembers } from "@/hooks/use-org-members";
import { upcomingDateRange } from "@/lib/date-range";
import type { Assignment } from "@/types/entities";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/assignments")({
	component: AssignmentsPage,
});

const STATUS_FILTERS = ["scheduled", "completed", "cancelled"] as const;

function AssignmentsPage() {
	const [status, setStatus] = useState<
		"scheduled" | "completed" | "cancelled" | null
	>(null);
	const [range, setRange] = useState(upcomingDateRange);

	const args: {
		status?: "scheduled" | "completed" | "cancelled";
		dateFrom?: string;
		dateTo?: string;
	} = {};
	if (status) args.status = status;
	if (range.from) args.dateFrom = range.from;
	if (range.to) args.dateTo = range.to;

	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: vehicles } = useQuery(convexQuery(api.vehicles.list, {}));
	const { data: drivers } = useQuery(convexQuery(api.drivers.list, {}));
	const { displayName } = useOrgMembers();
	const {
		data: assignments,
		isPending,
		error,
	} = useQuery(convexQuery(api.assignments.list, args));

	const tourNameById = new Map<string, string>(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);
	const vehicleNameById = new Map<string, string>(
		(vehicles ?? []).map((v) => [String(v._id), v.name]),
	);
	const driverUserById = new Map<string, string>(
		(drivers ?? []).map((d) => [String(d._id), d.userId]),
	);
	const items = (assignments ?? []) as Assignment[];
	const itemCount = items.length;
	const filtersActive =
		status !== null || range.from !== upcomingDateRange().from;

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
			render: (a) => displayName(a.guideId),
			searchValue: (a) => displayName(a.guideId),
		},
		{
			key: "tour",
			header: "Tour",
			render: (a) => <TourCell tourId={a.tourId} tourNameById={tourNameById} />,
			searchValue: (a) => tourNameById.get(a.tourId) ?? a.tourId,
		},
		{
			key: "vehicle",
			header: "Vehicle",
			render: (a) =>
				a.vehicleId ? (vehicleNameById.get(a.vehicleId) ?? "—") : "—",
			searchValue: (a) =>
				a.vehicleId ? (vehicleNameById.get(a.vehicleId) ?? "") : "",
		},
		{
			key: "driver",
			header: "Driver",
			render: (a) => {
				const userId = a.driverId ? driverUserById.get(a.driverId) : undefined;
				return userId ? displayName(userId) : "—";
			},
			searchValue: (a) => {
				const userId = a.driverId ? driverUserById.get(a.driverId) : undefined;
				return userId ? displayName(userId) : "";
			},
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
			description={`${itemCount} assignment${itemCount === 1 ? "" : "s"} — who is guiding, driving, and which vehicle is on each departure${
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
								value === "scheduled" ||
								value === "completed" ||
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
				rowKey={(a) => a._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					status || filtersActive
						? "No assignments match the current filters."
						: "No upcoming assignments"
				}
				emptyDescription={
					status || filtersActive
						? undefined
						: "Assign a guide — and a vehicle or driver if the tour needs them — to each published departure."
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
							<Link to="/dashboard/assignments/new">Create an assignment</Link>
						</Button>
					)
				}
				searchPlaceholder="Search by date, time, guide, or tour…"
			/>
		</ListPage>
	);
}
