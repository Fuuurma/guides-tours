import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/bookings")({
	component: BookingsPage,
});

const statusColors: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-800",
	confirmed: "bg-green-100 text-green-800",
	checked_in: "bg-blue-100 text-blue-800",
	completed: "bg-gray-100 text-gray-800",
	cancelled: "bg-red-100 text-red-800",
};

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
		render: (b) => (
			<Badge className={statusColors[b.status] ?? ""} variant="secondary">
				{b.status}
			</Badge>
		),
		searchValue: (b) => b.status,
	},
];

function BookingsPage() {
	const { data: bookings, isPending, error } = useQuery(
		convexQuery(api.bookings.list, {}),
	);

	const itemCount = bookings?.items?.length ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<div>
						<CardTitle>Bookings</CardTitle>
						<CardDescription>
							{itemCount} booking{itemCount === 1 ? "" : "s"}
						</CardDescription>
					</div>
					<Button asChild>
						<Link to="/dashboard/bookings/new">+ New booking</Link>
					</Button>
				</CardHeader>
				<CardContent>
					<DataTable
						data={bookings?.items as Booking[] | undefined}
						columns={columns}
						rowKey={(b) => b._id}
						isPending={isPending}
						error={error}
						emptyMessage="No bookings yet."
						searchPlaceholder="Search by date, status, or source…"
					/>
				</CardContent>
			</Card>
		</div>
	);
}