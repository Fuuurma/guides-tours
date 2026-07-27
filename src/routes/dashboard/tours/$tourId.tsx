import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
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
import { addDaysLocal, localYmd } from "@/lib/calendar-date";
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
	const today = localYmd();
	const availabilityTo = localYmd(addDaysLocal(new Date(), 90));
	const { data: stats } = useQuery(
		convexQuery(api.analytics.getForTour, {
			tourId: tourId as Id<"tours">,
			startDate: period.startDate,
			endDate: period.endDate,
		}),
	);
	const { data: upcomingSchedules } = useQuery(
		convexQuery(api.tourSchedules.list, {
			tourId: tourId as Id<"tours">,
			dateFrom: today,
			dateTo: availabilityTo,
			status: "available",
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
	const hasUpcomingAvailability = (upcomingSchedules ?? []).some(
		(schedule) => schedule.capacityBooked < schedule.capacityTotal,
	);
	const readinessItems = [
		{
			label: "Public visibility",
			detail: tour.isActive
				? "Customers can see this tour on the booking page."
				: "Inactive tours are hidden from the public booking page.",
			ready: tour.isActive,
			action: tour.isActive ? null : "Edit tour",
			recommended: false,
		},
		{
			label: "Customer-facing description",
			detail: tour.description?.trim()
				? "The public page has useful context for choosing this tour."
				: "Add a short description so customers know what they are requesting.",
			ready: Boolean(tour.description?.trim()),
			action: tour.description?.trim() ? null : "Add description",
			recommended: false,
		},
		{
			label: "Upcoming availability",
			detail:
				upcomingSchedules === undefined
					? "Checking the next 90 days…"
					: hasUpcomingAvailability
						? "At least one future slot has room for new requests."
						: "Create an available schedule before sharing this booking page.",
			ready: upcomingSchedules === undefined ? null : hasUpcomingAvailability,
			action: hasUpcomingAvailability ? null : "Create schedule",
			recommended: false,
		},
		{
			label: "Price",
			detail:
				tour.basePriceCents !== undefined
					? "Customers can see the per-person price when requesting."
					: "No price is shown publicly — useful for quote-based bookings.",
			ready: tour.basePriceCents !== undefined,
			action: null,
			recommended: true,
		},
	] as const;
	const requiredIssues = readinessItems.filter(
		(item) => !item.recommended && item.ready === false,
	).length;
	const readinessLoading = upcomingSchedules === undefined;

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

			<DetailSection
				title="Booking readiness"
				description={
					readinessLoading
						? "Checking public availability and tour setup…"
						: requiredIssues === 0
							? "The key pieces for accepting public requests are in place."
							: `${requiredIssues} item${requiredIssues === 1 ? "" : "s"} needs attention before customers can book confidently.`
				}
			>
				<div className="grid gap-3 md:grid-cols-2">
					{readinessItems.map((item) => (
						<div
							key={item.label}
							className="flex items-start justify-between gap-3 rounded-lg border p-3"
						>
							<div className="flex min-w-0 gap-3">
								<div className="pt-0.5">
									{item.ready === null ? (
										<LoaderCircle
											aria-hidden="true"
											className="size-4 animate-spin text-muted-foreground"
										/>
									) : item.ready ? (
										<CheckCircle2
											aria-hidden="true"
											className="size-4 text-emerald-600"
										/>
									) : (
										<AlertCircle
											aria-hidden="true"
											className="size-4 text-amber-600"
										/>
									)}
								</div>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-medium text-sm">{item.label}</p>
										{item.recommended && (
											<span className="text-muted-foreground text-xs">
												Recommended
											</span>
										)}
									</div>
									<p className="text-muted-foreground text-sm">{item.detail}</p>
								</div>
							</div>
							{item.action === "Create schedule" ? (
								<Button
									asChild
									size="sm"
									variant="outline"
									className="shrink-0"
								>
									<Link
										to="/dashboard/schedules/new"
										search={{ tourId: tour._id }}
									>
										Create schedule
									</Link>
								</Button>
							) : item.action ? (
								<Button
									asChild
									size="sm"
									variant="outline"
									className="shrink-0"
								>
									<Link
										to="/dashboard/tours/$tourId/edit"
										params={{ tourId: tour._id }}
									>
										{item.action}
									</Link>
								</Button>
							) : null}
						</div>
					))}
				</div>
			</DetailSection>

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
