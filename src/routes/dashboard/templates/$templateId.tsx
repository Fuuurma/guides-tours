import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/templates/$templateId")({
	component: TemplateDetailPage,
});

function TemplateDetailPage() {
	const { templateId } = Route.useParams();
	const {
		data: template,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.tourTemplates.get, {
			templateId: templateId as Id<"tourTemplates">,
		}),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error)
		return <p className="text-destructive text-sm">Error: {error.message}</p>;
	if (!template)
		return (
			<DetailPage title="Template not found" backTo="/dashboard/templates" />
		);

	return (
		<DetailPage
			title={template.name}
			subtitle={`${template.tourType} · ${template.durationHours}h`}
			backTo="/dashboard/templates"
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Capacity"
					value={`${template.maxGuests}/${template.capacity}`}
				/>
				<MetricCard label="Languages" value={template.languages.join(", ")} />
				<MetricCard
					label="Status"
					value={template.isActive ? "Active" : "Inactive"}
				>
					<StatusBadge status={template.isActive ? "active" : "inactive"} />
				</MetricCard>
				<MetricCard
					label="Booking cutoff"
					value={`${template.bookingCutoffHours}h before`}
				/>
			</div>

			{template.description && (
				<DetailSection title="Description">
					<p className="text-sm whitespace-pre-wrap">{template.description}</p>
				</DetailSection>
			)}

			<DetailSection
				title="Defaults"
				description="Values applied when instantiating"
			>
				<DetailRow label="Min guests" value={template.minGuests.toString()} />
				<DetailRow label="Max guests" value={template.maxGuests.toString()} />
				<DetailRow
					label="Default time"
					value={template.defaultTime ?? "(none)"}
					mono
				/>
				<DetailRow
					label="Required guides"
					value={template.requiredGuides.toString()}
				/>
			</DetailSection>

			<div className="grid gap-4 md:grid-cols-3">
				{(["inclusions", "exclusions", "highlights"] as const).map((key) => (
					<DetailSection
						key={key}
						title={key.charAt(0).toUpperCase() + key.slice(1)}
					>
						{template[key].length === 0 ? (
							<p className="text-muted-foreground text-xs italic">(none)</p>
						) : (
							<ul className="list-disc pl-5 space-y-1 text-sm">
								{template[key].map((s) => (
									<li key={s}>{s}</li>
								))}
							</ul>
						)}
					</DetailSection>
				))}
			</div>
		</DetailPage>
	);
}
