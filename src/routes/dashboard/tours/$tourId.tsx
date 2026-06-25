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
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/tours/$tourId")({
	component: TourDetailPage,
});

function TourDetailPage() {
	const { tourId } = Route.useParams();
	const { data: tour, isPending, error } = useQuery(
		convexQuery(api.tours.get, { tourId: tourId as never }),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!tour) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Tour not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/tours">← Back to tours</Link>
				</Button>
			</div>
		);
	}

	const utilizationPercent = tour.capacity
		? Math.round((tour.maxGuests / tour.capacity) * 100)
		: 0;

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{tour.name}</h1>
					<p className="text-muted-foreground text-sm">
						{tour.tourType} · {tour.durationHours}h
					</p>
				</div>
				<Button asChild variant="outline">
					<Link to="/dashboard/tours">← Back</Link>
				</Button>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric label="Capacity" value={`${tour.maxGuests}/${tour.capacity}`} />
				<Metric label="Languages" value={tour.languages.join(", ")} />
				<Metric
					label="Status"
					value={tour.isActive ? "Active" : "Inactive"}
					badge={tour.isActive ? "default" : "secondary"}
				/>
				<Metric label="Currency" value={tour.currency} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Configuration</CardTitle>
					<CardDescription>Operational settings for this tour</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<Row label="Min guests" value={tour.minGuests.toString()} />
					<Row label="Max guests" value={tour.maxGuests.toString()} />
					<Row label="Buffer minutes" value={tour.bufferMinutes.toString()} />
					<Row
						label="Booking cutoff"
						value={`${tour.bookingCutoffHours}h before`}
					/>
					<Row label="Required guides" value={tour.requiredGuides.toString()} />
					<Row label="Recurrence" value={tour.recurrenceType} />
					{tour.templateId && (
						<Row label="From template" value={tour.templateId} mono />
					)}
					{tour.categoryId && (
						<Row label="Category" value={tour.categoryId} mono />
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Content</CardTitle>
					<CardDescription>Marketing + booking details</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<Row
						label="Description"
						value={tour.description || "(none)"}
						block
					/>
					<ListRow label="Inclusions" items={tour.inclusions} />
					<ListRow label="Exclusions" items={tour.exclusions} />
					<ListRow label="Highlights" items={tour.highlights} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Capacity utilization</CardTitle>
					<CardDescription>
						How much of the capacity is committed at max
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-3xl font-semibold">
						{utilizationPercent}%
					</p>
					<p className="text-muted-foreground text-sm">
						maxGuests {tour.maxGuests} / capacity {tour.capacity}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({
	label,
	value,
	badge,
}: {
	label: string;
	value: string;
	badge?: "default" | "secondary";
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				{badge ? (
					<Badge variant={badge}>{value}</Badge>
				) : (
					<p className="text-2xl font-semibold">{value}</p>
				)}
			</CardContent>
		</Card>
	);
}

function Row({
	label,
	value,
	mono,
	block,
}: {
	label: string;
	value: string;
	mono?: boolean;
	block?: boolean;
}) {
	return (
		<div className={block ? "" : "flex items-baseline justify-between gap-4"}>
			<span className="text-muted-foreground">{label}</span>
			{block ? (
				<p className="mt-1">{value}</p>
			) : mono ? (
				<span className="font-mono text-xs">{value}</span>
			) : (
				<span>{value}</span>
			)}
		</div>
	);
}

function ListRow({
	label,
	items,
}: {
	label: string;
	items: string[];
}) {
	return (
		<div>
			<p className="text-muted-foreground mb-1">{label}</p>
			{items.length === 0 ? (
				<p className="text-muted-foreground text-xs italic">(none)</p>
			) : (
				<ul className="list-disc pl-5 space-y-1">
					{items.map((item, i) => (
						<li key={i}>{item}</li>
					))}
				</ul>
			)}
		</div>
	);
}