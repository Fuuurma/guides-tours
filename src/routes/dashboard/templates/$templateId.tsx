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

export const Route = createFileRoute("/dashboard/templates/$templateId")({
	component: TemplateDetailPage,
});

function TemplateDetailPage() {
	const { templateId } = Route.useParams();
	const { data: template, isPending, error } = useQuery(
		convexQuery(api.tourTemplates.get, {
			templateId: templateId as never,
		}),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!template) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Template not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/templates">← Back to templates</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{template.name}</h1>
					<p className="text-muted-foreground text-sm">
						{template.tourType} · {template.durationHours}h
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/dashboard/templates">← Back</Link>
					</Button>
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric label="Capacity" value={`${template.maxGuests}/${template.capacity}`} />
				<Metric label="Languages" value={template.languages.join(", ")} />
				<Metric
					label="Status"
					customBadge={
						template.isActive ? (
							<Badge>Active</Badge>
						) : (
							<Badge variant="secondary">Inactive</Badge>
						)
					}
				/>
				<Metric
					label="Booking cutoff"
					value={`${template.bookingCutoffHours}h before`}
				/>
			</div>

			{template.description && (
				<Card>
					<CardHeader>
						<CardTitle>Description</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm whitespace-pre-wrap">
							{template.description}
						</p>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Defaults</CardTitle>
					<CardDescription>Values applied when instantiating</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<Row label="Min guests" value={template.minGuests.toString()} />
					<Row label="Max guests" value={template.maxGuests.toString()} />
					<Row
						label="Default time"
						value={template.defaultTime ?? "(none)"}
						mono
					/>
					<Row label="Required guides" value={template.requiredGuides.toString()} />
				</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle>Inclusions</CardTitle>
					</CardHeader>
					<CardContent>
						{template.inclusions.length === 0 ? (
							<p className="text-muted-foreground text-xs italic">(none)</p>
						) : (
							<ul className="list-disc pl-5 space-y-1 text-sm">
								{template.inclusions.map((s, i) => (
									<li key={i}>{s}</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Exclusions</CardTitle>
					</CardHeader>
					<CardContent>
						{template.exclusions.length === 0 ? (
							<p className="text-muted-foreground text-xs italic">(none)</p>
						) : (
							<ul className="list-disc pl-5 space-y-1 text-sm">
								{template.exclusions.map((s, i) => (
									<li key={i}>{s}</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Highlights</CardTitle>
					</CardHeader>
					<CardContent>
						{template.highlights.length === 0 ? (
							<p className="text-muted-foreground text-xs italic">(none)</p>
						) : (
							<ul className="list-disc pl-5 space-y-1 text-sm">
								{template.highlights.map((s, i) => (
									<li key={i}>{s}</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function Metric({
	label,
	value,
	customBadge,
}: {
	label: string;
	value?: string;
	customBadge?: React.ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				{customBadge ?? <p className="text-2xl font-semibold">{value}</p>}
			</CardContent>
		</Card>
	);
}

function Row({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			{mono ? (
				<span className="font-mono text-xs">{value}</span>
			) : (
				<span>{value}</span>
			)}
		</div>
	);
}
