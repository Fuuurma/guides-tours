import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { resolveTourStaffing } from "@/lib/staffing";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/templates/$templateId")({
	component: TemplateDetailPage,
});

function TemplateDetailPage() {
	const { templateId } = Route.useParams();
	const navigate = useNavigate();
	const instantiate = useMutation(api.tourTemplates.instantiate);
	const [creating, setCreating] = useState(false);
	const [instantiateErr, setInstantiateErr] = useState<string | null>(null);
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
	if (error) return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	if (!template)
		return (
			<DetailPage title="Template not found" backTo="/dashboard/templates" />
		);

	const staffing = resolveTourStaffing({
		tourType: template.tourType,
		requiredGuides: template.requiredGuides,
		requiresVehicle: template.requiresVehicle,
		requiresDriver: template.requiresDriver,
		requiredVehicleType: template.requiredVehicleType,
	});
	const staffingCustomized =
		template.requiresVehicle !== undefined ||
		template.requiresDriver !== undefined ||
		Boolean(template.requiredVehicleType);

	const handleInstantiate = async () => {
		setCreating(true);
		setInstantiateErr(null);
		try {
			const tourId = await instantiate({
				templateId: templateId as Id<"tourTemplates">,
			});
			void navigate({
				to: "/dashboard/tours/$tourId",
				params: { tourId },
			});
		} catch (err) {
			setInstantiateErr(getErrorMessage(err));
		} finally {
			setCreating(false);
		}
	};

	return (
		<DetailPage
			title={template.name}
			subtitle={`${template.tourType} · ${template.durationHours}h`}
			backTo="/dashboard/templates"
			actions={
				<>
					<Button asChild variant="outline">
						<Link
							to="/dashboard/templates/$templateId/edit"
							params={{ templateId: template._id }}
						>
							Edit
						</Link>
					</Button>
					<Button onClick={() => void handleInstantiate()} disabled={creating}>
						{creating ? "Creating tour…" : "Use template"}
					</Button>
				</>
			}
		>
			{instantiateErr && (
				<p className="text-destructive text-sm mb-2">{instantiateErr}</p>
			)}

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
				title="Staffing"
				description={
					staffingCustomized
						? "Custom fleet rules copied into new tours"
						: "Inferred from tour type when instantiating"
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
