import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/bookings")({
	component: BookingsPage,
});

interface Booking {
	_id: string;
	date: string;
	tourId: string;
	guests: number;
	totalAmountCents: number;
	source: string;
	status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";
}

const columns: DataTableColumn<Booking>[] = [
	{ key: "date", header: "Date", render: (b) => b.date, searchValue: (b) => b.date },
	{
		key: "tour",
		header: "Tour",
		render: (b) => (
			<Link
				to="/dashboard/bookings/$bookingId"
				params={{ bookingId: b._id }}
				className="text-blue-600 hover:underline"
			>
				{b.date} · {b.guests} guests
			</Link>
		),
		searchValue: (b) => `${b.date} ${b.guests}`,
	},
	{ key: "guests", header: "Guests", render: (b) => b.guests },
	{
		key: "amount",
		header: "Amount",
		render: (b) => `$${(Number(b.totalAmountCents) / 100).toFixed(2)}`,
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

function BookingsPage() {
	const [source, setSource] = useState<string | null>(null);
	const { data: bookings, isPending, error } = useQuery(
		convexQuery(api.bookings.list, source ? { source } : {}),
	);
	const itemCount = bookings?.items?.length ?? 0;

	return (
		<ListPage
			title="Bookings"
			description={`${itemCount} booking${itemCount === 1 ? "" : "s"}${
				source ? ` · filtered by ${source}` : ""
			}`}
			newTo="/dashboard/bookings/new"
			newLabel="+ New booking"
		>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<span className="text-muted-foreground text-sm">Source:</span>
				{["direct", "viator", "getyourguide", "airbnb", "klook", "booking", "expedia", "tripadvisor"].map(
					(s) => (
						<Button
							key={s}
							variant={source === s ? "default" : "outline"}
							size="sm"
							onClick={() => setSource(source === s ? null : s)}
						>
							{s}
						</Button>
					),
				)}
				{source && (
					<Button variant="ghost" size="sm" onClick={() => setSource(null)}>
						Clear
					</Button>
				)}
			</div>
			<DataTable
				data={bookings?.items as Booking[] | undefined}
				columns={columns}
				rowKey={(b) => b._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					source ? `No bookings from ${source}.` : "No bookings yet."
				}
				searchPlaceholder="Search by date, status, or source…"
			/>
		</ListPage>
	);
}
