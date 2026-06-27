import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
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
	totalRevenueCents: bigint | number;
	loyaltyPoints: number;
	tags: string[];
}

const bookingColumns: DataTableColumn<Record<string, unknown>>[] = [
	{
		key: "date",
		header: "Date",
		render: (b) => (
			<Link
				to="/dashboard/bookings/$bookingId"
				params={{ bookingId: String(b._id) }}
				className="font-medium text-blue-600 hover:underline"
			>
				{String(b.date)}
			</Link>
		),
	},
	{ key: "tour", header: "Tour", render: (b) => String(b.tourName) },
	{ key: "guests", header: "Guests", render: (b) => String(b.guests) },
	{
		key: "amount",
		header: "Amount",
		render: (b) => `$${(Number(b.totalAmountCents) / 100).toFixed(2)}`,
	},
	{
		key: "status",
		header: "Status",
		render: (b) => <StatusBadge status={String(b.status)} />,
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
		return <p className="text-muted-foreground">Loading…</p>;
	}
	if (error) {
		return <p className="text-destructive text-sm">Error: {error.message}</p>;
	}
	if (!customer) {
		return (
			<DetailPage title="Customer not found" backTo="/dashboard/customers" />
		);
	}

	const c = customer as unknown as Customer;
	const bookings = (history ?? []) as unknown as Array<{
		_id: string;
		tourId: string;
		tourName: string;
		date: string;
		startTime: string;
		guests: number;
		status: string;
		totalAmountCents: number | bigint;
		reviewRating: number | null;
		createdAt: number;
	}>;

	return (
		<DetailPage
			title={c.name}
			subtitle={
				<>
					{c.email}
					{c.vipStatus && <Badge className="ml-2">VIP</Badge>}
				</>
			}
			backTo="/dashboard/customers"
			actions={
				<Button asChild>
					<Link
						to="/dashboard/customers/$customerId/edit"
						params={{ customerId: c._id }}
					>
						Edit
					</Link>
				</Button>
			}
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Total visits" value={c.totalVisits.toString()} />
				<MetricCard label="Total revenue" value={`$${(Number(c.totalRevenueCents) / 100).toFixed(2)}`} />
				<MetricCard label="Loyalty points" value={c.loyaltyPoints.toString()} />
				<MetricCard label="Source" value={c.source} />
			</div>

			<DetailSection title="Contact" description="How to reach this customer">
				<DetailRow label="Email" value={c.email} />
				<DetailRow label="Phone" value={c.phone || "(none)"} />
				<DetailRow label="Preferred language" value={c.preferredLanguage} />
			</DetailSection>

			{c.tags.length > 0 && (
				<DetailSection title="Tags">
					<div className="flex flex-wrap gap-2">
						{c.tags.map((tag) => (
							<Badge key={tag} variant="secondary">{tag}</Badge>
						))}
					</div>
				</DetailSection>
			)}

			<DetailSection title="Booking history" description={`${bookings.length} booking${bookings.length === 1 ? "" : "s"} on file`}>
				<DataTable
					data={bookings}
					columns={bookingColumns}
					rowKey={(b) => String(b._id)}
					emptyMessage="No bookings yet for this customer."
				/>
			</DetailSection>
		</DetailPage>
	);
}
