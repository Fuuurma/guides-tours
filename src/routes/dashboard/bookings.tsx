import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { ALL_PROVIDERS, providerLabel } from "@/components/ota-providers";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultDateRange } from "@/lib/date-range";
import { formatCentsCompact } from "@/lib/format";
import type { Booking } from "@/types/entities";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/bookings")({
	component: BookingsPage,
});

function bookingColumns(
	tourNameById: Map<string, string>,
	customerNameById: Map<string, string>,
): DataTableColumn<Booking>[] {
	return [
		{
			key: "date",
			header: "Date",
			render: (b) => b.date,
			searchValue: (b) => b.date,
		},
		{
			key: "customer",
			header: "Customer",
			render: (b) => (
				<Link
					to="/dashboard/bookings/$bookingId"
					params={{ bookingId: b._id }}
					className="text-link hover:underline"
				>
					{b.customerId
						? (customerNameById.get(b.customerId) ?? "Unknown customer")
						: "Unknown customer"}
				</Link>
			),
			searchValue: (b) =>
				b.customerId ? (customerNameById.get(b.customerId) ?? "") : "",
		},
		{
			key: "tour",
			header: "Tour",
			render: (b) =>
				b.tourId
					? (tourNameById.get(b.tourId) ?? "Unknown tour")
					: "Unknown tour",
			searchValue: (b) => (b.tourId ? (tourNameById.get(b.tourId) ?? "") : ""),
		},
		{ key: "guests", header: "Guests", render: (b) => b.guests },
		{
			key: "amount",
			header: "Amount",
			render: (b) => formatCentsCompact(b.totalAmountCents),
		},
		{
			key: "source",
			header: "Source",
			render: (b) => <Badge variant="outline">{b.source}</Badge>,
			searchValue: (b) => b.source,
		},
		{
			key: "status",
			header: "Status",
			render: (b) => <StatusBadge status={b.status} />,
			searchValue: (b) => b.status,
		},
	];
}

function BookingsPage() {
	const [source, setSource] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [range, setRange] = useState(defaultDateRange);

	const args: {
		source?: string;
		status?: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
		dateFrom?: string;
		dateTo?: string;
	} = {};
	if (source) args.source = source;
	if (status) args.status = status as typeof args.status;
	if (range.from) args.dateFrom = range.from;
	if (range.to) args.dateTo = range.to;

	const {
		data: bookings,
		isPending,
		error,
	} = useQuery(convexQuery(api.bookings.list, args));
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: customers } = useQuery(convexQuery(api.customers.list, {}));
	const tourNameById = new Map(
		(tours ?? []).map((tour) => [String(tour._id), tour.name]),
	);
	const customerNameById = new Map(
		(customers?.items ?? []).map((customer) => [
			String(customer._id),
			customer.name,
		]),
	);
	const itemCount = bookings?.items?.length ?? 0;
	const filtersActive =
		source !== null ||
		status !== null ||
		range.from !== defaultDateRange().from;
	const statusFilters = [
		"pending",
		"confirmed",
		"checked_in",
		"completed",
		"cancelled",
	] as const;

	return (
		<ListPage
			title="Bookings"
			description={`${itemCount} booking${itemCount === 1 ? "" : "s"}${
				source || status || filtersActive
					? ` · filtered${source ? ` by ${source}` : ""}${
							status ? ` · ${status.replace("_", " ")}` : ""
						}${
							range.from
								? ` from ${range.from}${range.to ? ` to ${range.to}` : ""}`
								: ""
						}`
					: ""
			}`}
			newTo="/dashboard/bookings/new"
			newLabel="+ New booking"
		>
			<div className="mb-4 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Source:</span>
					{["direct", ...ALL_PROVIDERS.map((p) => p.id)].map((s) => (
						<Button
							key={s}
							variant={source === s ? "default" : "outline"}
							size="sm"
							onClick={() => setSource(source === s ? null : s)}
							aria-pressed={source === s}
						>
							{s === "direct" ? "Direct" : providerLabel(s)}
						</Button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Status:</span>
					{statusFilters.map((value) => (
						<Button
							key={value}
							variant={status === value ? "default" : "outline"}
							size="sm"
							onClick={() => setStatus(status === value ? null : value)}
							aria-pressed={status === value}
						>
							{value.replace("_", " ")}
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
								setSource(null);
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
				data={bookings?.items as Booking[] | undefined}
				columns={bookingColumns(tourNameById, customerNameById)}
				rowKey={(b) => b._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					source || status
						? `No ${status ?? "bookings"}${source ? ` from ${source}` : ""} in this date range.`
						: "No bookings yet."
				}
				emptyAction={
					filtersActive ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setSource(null);
								setStatus(null);
								setRange(defaultDateRange());
							}}
						>
							Clear all filters
						</Button>
					) : (
						<Button asChild size="sm">
							<Link to="/dashboard/bookings/new">
								Create your first booking
							</Link>
						</Button>
					)
				}
				searchPlaceholder="Search by customer, tour, date, status, or source…"
			/>
		</ListPage>
	);
}
