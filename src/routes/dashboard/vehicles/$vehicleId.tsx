import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
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
		return <DetailSkeleton />;
	}
	if (error) {
		return <ErrorBanner message={error.message} />;
	}
	if (!vehicle) {
		return (
			<DetailPage title="Vehicle not found" backTo="/dashboard/vehicles" />
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
