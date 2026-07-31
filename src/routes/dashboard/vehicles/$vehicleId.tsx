import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { useOrgMembers } from "@/hooks/use-org-members";
import { localYmd } from "@/lib/calendar-date";
import { getSafeDisplayMessage } from "@/lib/utils";
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
	const { displayName, members } = useOrgMembers();
	const today = localYmd();
	const { data: upcoming } = useQuery(
		convexQuery(
			api.assignments.list,
			vehicle
				? {
						vehicleId: vehicle._id,
						dateFrom: today,
						status: "scheduled" as const,
					}
				: "skip",
		),
	);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: drivers } = useQuery(convexQuery(api.drivers.list, {}));
	const tourNameById = new Map(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);
	const driverUserById = new Map(
		(drivers ?? []).map((d) => [String(d._id), d.userId]),
	);
	const phoneByUserId = new Map(
		members.map((m) => [m.userId, (m.phone ?? "").trim()]),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) {
		return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	}
	if (!vehicle) {
		return (
			<DetailPage title="Vehicle not found" backTo="/dashboard/vehicles" />
		);
	}

	const upcomingItems = upcoming ?? [];

	return (
		<DetailPage
			title={vehicle.name}
			subtitle={`${vehicle.vehicleType}${
				vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""
			}`}
			backTo="/dashboard/vehicles"
			actions={
				<Button asChild>
					<Link
						to="/dashboard/vehicles/$vehicleId/edit"
						params={{ vehicleId: vehicle._id }}
					>
						Edit
					</Link>
				</Button>
			}
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

			<DetailSection
				title="Upcoming assignments"
				description="Scheduled departures using this vehicle. SMS badge shows when the assigned driver has a phone on file."
			>
				{upcomingItems.length === 0 ? (
					<p className="text-muted-foreground text-sm italic">
						No upcoming assignments
					</p>
				) : (
					<ul className="space-y-2">
						{upcomingItems.slice(0, 20).map((a) => {
							const driverUser = a.driverId
								? driverUserById.get(a.driverId)
								: undefined;
							const driverPhone = driverUser
								? phoneByUserId.get(driverUser)
								: undefined;
							return (
								<li
									key={a._id}
									className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
								>
									<Link
										to="/dashboard/assignments/$assignmentId"
										params={{ assignmentId: a._id }}
										className="text-link hover:underline"
									>
										{a.date} · {a.startTime}
									</Link>
									<span className="text-muted-foreground">
										· {tourNameById.get(a.tourId) ?? "Tour"}
										{driverUser ? ` · ${displayName(driverUser)}` : ""}
									</span>
									{driverUser ? (
										driverPhone ? (
											<span className="text-muted-foreground text-xs">
												SMS ready
											</span>
										) : (
											<span className="text-muted-foreground text-xs">
												No SMS phone
											</span>
										)
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</DetailSection>
		</DetailPage>
	);
}
