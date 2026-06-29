import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/vehicles/$vehicleId")({
	component: VehicleDetailPage,
});

function VehicleDetailPage() {
	const { vehicleId } = Route.useParams();
	const {
		data: vehicle,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.vehicles.get, {
			vehicleId: vehicleId as Id<"vehicles">,
		}),
	);

	if (isPending) {
		return (
			<div className="space-y-4 p-4">
				<Skeleton className="h-8 w-1/3" />
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		);
	}
	if (error) {
		return <p className="text-destructive text-sm">Error: {error.message}</p>;
	}
	if (!vehicle) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Vehicle not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/vehicles">← Back to vehicles</Link>
				</Button>
			</div>
		);
	}

	return (
		<DetailPage
			title={vehicle.name}
			subtitle={`${vehicle.vehicleType}${
				vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""
			}`}
			backTo="/dashboard/vehicles"
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Capacity" value={`${vehicle.capacity} guests`} />
				<MetricCard
					label="Status"
					value={vehicle.status}
					badgeVariant="secondary"
				>
					<StatusBadge status={vehicle.status} />
				</MetricCard>
				<MetricCard
					label="Ownership"
					value={vehicle.ownershipType || "(unset)"}
				/>
				<MetricCard label="Year" value={vehicle.year?.toString() ?? "—"} />
			</div>

			<DetailSection
				title="Specifications"
				description="Make, model, and identification"
			>
				<DetailRow label="Make" value={vehicle.make || "—"} />
				<DetailRow label="Model" value={vehicle.model || "—"} />
				<DetailRow label="Color" value={vehicle.color || "—"} />
				<DetailRow label="License plate" value={vehicle.licensePlate || "—"} />
			</DetailSection>

			{vehicle.notes && (
				<DetailSection title="Notes">
					<p className="text-sm whitespace-pre-wrap">{vehicle.notes}</p>
				</DetailSection>
			)}
		</DetailPage>
	);
}
