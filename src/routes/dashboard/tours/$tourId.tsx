import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/tours/$tourId")({
	component: TourDetailPage,
});

function TourDetailPage() {
	const { tourId } = Route.useParams();
	const { data: tour, isPending, error } = useQuery(
		convexQuery(api.tours.get, { tourId: tourId as Id<"tours"> }),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading…</p>;
	}
	if (error) {
		return <p className="text-destructive text-sm">Error: {error.message}</p>;
	}
	if (!tour) {
		return <DetailPage title="Tour not found" backTo="/dashboard/tours" />;
	}

	const utilizationPercent = tour.capacity
		? Math.round((tour.maxGuests / tour.capacity) * 100)
		: 0;

	return (
		<DetailPage
			title={tour.name}
			subtitle={`${tour.tourType} · ${tour.durationHours}h`}
			backTo="/dashboard/tours"
			actions={
				<Button asChild>
					<Link
						to="/dashboard/tours/$tourId/edit"
						params={{ tourId: tour._id }}
					>
						Edit
					</Link>
				</Button>
			}
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Capacity" value={`${tour.maxGuests}/${tour.capacity}`} />
				<MetricCard label="Languages" value={tour.languages.join(", ")} />
				<MetricCard label="Status" value={tour.isActive ? "Active" : "Inactive"}>
					<StatusBadge status={tour.isActive ? "active" : "inactive"} />
				</MetricCard>
				<MetricCard label="Currency" value={tour.currency} />
			</div>

			<DetailSection title="Configuration" description="Operational settings for this tour">
				<DetailRow label="Min guests" value={tour.minGuests.toString()} />
				<DetailRow label="Max guests" value={tour.maxGuests.toString()} />
				<DetailRow label="Buffer minutes" value={tour.bufferMinutes.toString()} />
				<DetailRow label="Booking cutoff" value={`${tour.bookingCutoffHours}h before`} />
				<DetailRow label="Required guides" value={tour.requiredGuides.toString()} />
				<DetailRow label="Recurrence" value={tour.recurrenceType} />
				{tour.templateId && <DetailRow label="From template" value={tour.templateId} mono />}
				{tour.categoryId && <DetailRow label="Category" value={tour.categoryId} mono />}
			</DetailSection>

			<DetailSection title="Content" description="Marketing + booking details">
				<DetailRow label="Description" value={tour.description || "(none)"} block />
				{(["inclusions", "exclusions", "highlights"] as const).map((key) => (
					<div key={key} className="mb-3">
						<p className="text-muted-foreground mb-1 capitalize">{key}</p>
						{tour[key].length === 0 ? (
							<p className="text-muted-foreground text-xs italic">(none)</p>
						) : (
							<ul className="list-disc pl-5 space-y-1">
								{tour[key].map((item, i) => <li key={i}>{item}</li>)}
							</ul>
						)}
					</div>
				))}
			</DetailSection>

			<DetailSection title="Capacity utilization" description="How much of the capacity is committed at max">
				<p className="text-3xl font-semibold">{utilizationPercent}%</p>
				<p className="text-muted-foreground text-sm">
					maxGuests {tour.maxGuests} / capacity {tour.capacity}
				</p>
			</DetailSection>
		</DetailPage>
	);
}
