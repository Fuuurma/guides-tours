import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import {
	TourGallerySection,
	TourScheduleRulesSection,
} from "@/components/tour-ops-sections";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { lastNDays } from "@/lib/date-range";
import { formatCents } from "@/lib/format";
import { resolveTourStaffing } from "@/lib/staffing";
import { getErrorMessage } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/tours/$tourId")({
	component: TourDetailPage,
});

function TourDetailPage() {
	const { tourId } = Route.useParams();
	const navigate = useNavigate();
	const removeTour = useMutation(api.tours.remove);
	const [deleting, setDeleting] = useState(false);
	const {
		data: tour,
		isPending,
		error,
	} = useQuery(convexQuery(api.tours.get, { tourId: tourId as Id<"tours"> }));
	const period = lastNDays(30);
	const { data: stats } = useQuery(
		convexQuery(api.analytics.getForTour, {
			tourId: tourId as Id<"tours">,
			startDate: period.startDate,
			endDate: period.endDate,
		}),
	);

	const onDelete = async () => {
		if (
			!window.confirm(
				`Delete "${tour?.name ?? "this tour"}"? It will be soft-deleted and hidden from lists.`,
			)
		) {
			return;
		}
		setDeleting(true);
		try {
			await removeTour({ tourId: tourId as Id<"tours"> });
			toast.success("Tour deleted");
			void navigate({ to: "/dashboard/tours" });
		} catch (err) {
			toast.error(getErrorMessage(err));
			setDeleting(false);
		}
	};

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) {
		return <ErrorBanner message={error.message} />;
	}
	if (!tour) {
		return <DetailPage title="Tour not found" backTo="/dashboard/tours" />;
	}

	const utilizationPercent = tour.capacity
		? Math.round((tour.maxGuests / tour.capacity) * 100)
		: 0;
	const staffing = resolveTourStaffing({
		tourType: tour.tourType,
		requiredGuides: tour.requiredGuides,
		requiresVehicle: tour.requiresVehicle,
		requiresDriver: tour.requiresDriver,
		requiredVehicleType: tour.requiredVehicleType,
	});
	const staffingCustomized =
		tour.requiresVehicle !== undefined ||
		tour.requiresDriver !== undefined ||
		Boolean(tour.requiredVehicleType);

	return (
		<DetailPage
			title={tour.name}
			subtitle={`${tour.tourType} · ${tour.durationHours}h`}
			backTo="/dashboard/tours"
			actions={
				<>
					<Button asChild>
						<Link
							to="/dashboard/tours/$tourId/edit"
							params={{ tourId: tour._id }}
						>
							Edit
						</Link>
					</Button>
					<Button
						variant="destructive"
						disabled={deleting}
						onClick={() => void onDelete()}
					>
						{deleting ? "Deleting…" : "Delete"}
					</Button>
				</>
			}
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Capacity"
					value={`${tour.maxGuests}/${tour.capacity}`}
				/>
				<MetricCard label="Languages" value={tour.languages.join(", ")} />
				<MetricCard
					label="Status"
					value={tour.isActive ? "Active" : "Inactive"}
				>
					<StatusBadge status={tour.isActive ? "active" : "inactive"} />
				</MetricCard>
				<MetricCard label="Currency" value={tour.currency} />
			</div>

			{stats ? (
				<DetailSection
					title="Recent performance"
					description={`${stats.periodStart} → ${stats.periodEnd} (last 30 days)`}
				>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						<MetricCard label="Bookings" value={stats.totalBookings} />
						<MetricCard label="Guests" value={stats.totalGuests} />
						<MetricCard
							label="Revenue"
							value={formatCents(stats.totalRevenueCents)}
						/>
						<MetricCard
							label="Utilization"
							value={`${Math.round(stats.utilizationRate * 100)}%`}
						/>
					</div>
					<div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
						<p>
							Avg group {stats.avgGroupSize}
							{stats.cancellations > 0
								? ` · ${stats.cancellations} cancelled`
								: ""}
						</p>
						<p>
							Assignments {stats.completedAssignments}/{stats.totalAssignments}{" "}
							done
							{stats.cancelledAssignments > 0
								? ` · ${stats.cancelledAssignments} cancelled`
								: ""}
						</p>
						<p>
							Capacity used {stats.totalGuests}/{stats.totalCapacity}
						</p>
					</div>
				</DetailSection>
			) : null}

			<DetailSection
				title="Staffing"
				description={
					staffingCustomized
						? "Custom fleet rules for assignments"
						: "Inferred from tour type (override in Edit)"
				}
			>
				<DetailRow
					label="Required guides"
					value={staffing.requiredGuides.toString()}
				/>
				<DetailRow
					label="Vehicle"
					value={
						staffing.requiresVehicle
							? staffing.requiredVehicleType
								? `Required · ${staffing.requiredVehicleType}`
								: "Required"
							: "Not required"
					}
				/>
				<DetailRow
					label="Driver"
					value={staffing.requiresDriver ? "Required" : "Not required"}
				/>
			</DetailSection>

			<DetailSection
				title="Configuration"
				description="Operational settings for this tour"
			>
				<DetailRow label="Min guests" value={tour.minGuests.toString()} />
				<DetailRow label="Max guests" value={tour.maxGuests.toString()} />
				<DetailRow
					label="Buffer minutes"
					value={tour.bufferMinutes.toString()}
				/>
				<DetailRow
					label="Booking cutoff"
					value={`${tour.bookingCutoffHours}h before`}
				/>
				<DetailRow label="Recurrence" value={tour.recurrenceType} />
				{tour.templateId && (
					<DetailRow label="From template" value={tour.templateId} mono />
				)}
				{tour.categoryId && (
					<DetailRow label="Category" value={tour.categoryId} mono />
				)}
			</DetailSection>

			<DetailSection title="Content" description="Marketing + booking details">
				<DetailRow
					label="Description"
					value={tour.description || "(none)"}
					block
				/>
				{(["inclusions", "exclusions", "highlights"] as const).map((key) => (
					<div key={key} className="mb-3">
						<p className="text-muted-foreground mb-1 capitalize">{key}</p>
						{tour[key].length === 0 ? (
							<p className="text-muted-foreground text-xs italic">(none)</p>
						) : (
							<ul className="list-disc pl-5 space-y-1">
								{tour[key].map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						)}
					</div>
				))}
			</DetailSection>

			<TourGallerySection tourId={tour._id} />
			<TourScheduleRulesSection tourId={tour._id} />

			<DetailSection
				title="Capacity utilization"
				description="How much of the capacity is committed at max"
			>
				<p className="text-3xl font-semibold">{utilizationPercent}%</p>
				<p className="text-muted-foreground text-sm">
					maxGuests {tour.maxGuests} / capacity {tour.capacity}
				</p>
			</DetailSection>
		</DetailPage>
	);
}
