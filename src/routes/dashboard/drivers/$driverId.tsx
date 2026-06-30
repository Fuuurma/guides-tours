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

export const Route = createFileRoute("/dashboard/drivers/$driverId")({
	component: DriverDetailPage,
});

function DriverDetailPage() {
	const { driverId } = Route.useParams();
	const {
		data: driver,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.drivers.get, { driverId: driverId as Id<"drivers"> }),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={error.message} />;
	if (!driver)
		return <DetailPage title="Driver not found" backTo="/dashboard/drivers" />;

	return (
		<DetailPage
			title="Driver"
			subtitle={driver.userId}
			backTo="/dashboard/drivers"
		>
			<div className="grid gap-4 md:grid-cols-2">
				<MetricCard
					label="Status"
					value={driver.isActive ? "Active" : "Inactive"}
				>
					<StatusBadge status={driver.isActive ? "active" : "inactive"} />
				</MetricCard>
				<MetricCard label="License" value={driver.licenseInfo} />
			</div>

			{driver.notes && (
				<DetailSection title="Notes">
					<p className="text-sm whitespace-pre-wrap">{driver.notes}</p>
				</DetailSection>
			)}

			<DetailSection title="Metadata" description="System fields">
				<DetailRow label="Driver ID" value={driver._id} mono />
				<DetailRow
					label="Created at"
					value={new Date(driver.createdAt).toLocaleString()}
				/>
				<DetailRow
					label="Updated at"
					value={new Date(driver.updatedAt).toLocaleString()}
				/>
			</DetailSection>
		</DetailPage>
	);
}
