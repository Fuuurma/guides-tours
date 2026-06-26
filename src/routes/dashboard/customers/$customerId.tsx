import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
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

const bookingColumns: DataTableColumn<Record<string, unknown>>[] = [
	{ key: "date", header: "Date", render: (b) => String(b.date) },
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
		render: (b) => <Badge variant="secondary">{String(b.status)}</Badge>,
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
		return <p className="text-destructive text-sm">Error: {error.message}</p>;
	}
	if (!customer) {
		return (
			<DetailPage title="Customer not found" backTo="/dashboard/customers" />
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
				<a
					href={`/dashboard/customers/${c._id}/edit`}
					className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					Edit
				</a>
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
