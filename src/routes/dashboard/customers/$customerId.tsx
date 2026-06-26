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
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/customers/$customerId")({
	component: CustomerDetailPage,
});

interface Customer {
	_id: string;
	name: string;
	email: string;
	phone: string;
	preferredLanguage: string;
	source: string;
	vipStatus: boolean;
	totalVisits: number;
	totalRevenueCents: number;
	loyaltyPoints: number;
	tags: string[];
}

interface BookingRow {
	_id: string;
	date: string;
	tourName: string;
	guests: number;
	totalAmountCents: number;
	status: string;
}

const bookingColumns: DataTableColumn<BookingRow>[] = [
	{ key: "date", header: "Date", render: (b) => b.date },
	{ key: "tour", header: "Tour", render: (b) => b.tourName },
	{ key: "guests", header: "Guests", render: (b) => b.guests },
	{
		key: "amount",
		header: "Amount",
		render: (b) => `$${(Number(b.totalAmountCents) / 100).toFixed(2)}`,
	},
	{
		key: "status",
		header: "Status",
		render: (b) => <Badge variant="secondary">{b.status}</Badge>,
	},
];

function CustomerDetailPage() {
	const { customerId } = Route.useParams();
	const { data: customer, isPending, error } = useQuery(
		convexQuery(api.customers.get, { customerId: customerId as never }),
	);
	const { data: history } = useQuery(
		convexQuery(api.customers.history, {
			customerId: customerId as never,
		}),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!customer) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Customer not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/customers">← Back to customers</Link>
				</Button>
			</div>
		);
	}

	const c = customer as unknown as Customer;
	const bookings = ((history ?? []) as unknown as Array<{
	id: string;
	date: string;
	tourName: string;
	guests: number;
	totalAmountCents: number;
	status: string;
}>).map((b) => ({ ...b, _id: b.id }));

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{c.name}</h1>
					<p className="text-muted-foreground text-sm">
						{c.email}
						{c.vipStatus && (
							<>
								{" "}
								<Badge>VIP</Badge>
							</>
						)}
					</p>
				</div>
				<Button asChild variant="outline">
					<Link to="/dashboard/customers">← Back</Link>
				</Button>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric label="Total visits" value={c.totalVisits.toString()} />
				<Metric
					label="Total revenue"
					value={`$${(Number(c.totalRevenueCents) / 100).toFixed(2)}`}
				/>
				<Metric label="Loyalty points" value={c.loyaltyPoints.toString()} />
				<Metric label="Source" value={c.source} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Contact</CardTitle>
					<CardDescription>How to reach this customer</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<Row label="Email" value={c.email} />
					<Row label="Phone" value={c.phone || "(none)"} />
					<Row label="Preferred language" value={c.preferredLanguage} />
				</CardContent>
			</Card>

			{c.tags.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Tags</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-2">
							{c.tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag}
								</Badge>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Booking history</CardTitle>
					<CardDescription>
						{bookings.length} booking
						{bookings.length === 1 ? "" : "s"} on file
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DataTable
						data={bookings}
						columns={bookingColumns}
						rowKey={(b) => b._id}
						emptyMessage="No bookings yet for this customer."
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-2xl font-semibold">{value}</p>
			</CardContent>
		</Card>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}