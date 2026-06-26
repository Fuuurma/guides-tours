import * as React from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Standard shell for entity detail pages. Replaces the duplicated
 * header + back-link pattern across all 8 detail pages.
 *
 * @example
 *   <DetailPage
 *     title={tour.name}
 *     subtitle={`${tour.tourType} · ${tour.durationHours}h`}
 *     backTo="/dashboard/tours"
 *     actions={<Button asChild><Link to="...">Edit</Link></Button>}
 *   >
 *     <DetailSection title="Configuration">
 *       <DetailRow label="Capacity" value={tour.capacity} />
 *     </DetailSection>
 *   </DetailPage>
 */
export interface DetailPageProps {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	backTo: string;
	backLabel?: string;
	actions?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}

export function DetailPage({
	title,
	subtitle,
	backTo,
	backLabel = "← Back",
	actions,
	children,
	className,
}: DetailPageProps) {
	return (
		<div className={cn("space-y-6", className)}>
			<header className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">{title}</h1>
					{subtitle && (
						<p className="text-muted-foreground text-sm">{subtitle}</p>
					)}
				</div>
				<div className="flex gap-2">
					{actions}
					<Button asChild variant="outline">
						<Link to={backTo}>{backLabel}</Link>
					</Button>
				</div>
			</header>
			{children}
		</div>
	);
}

/**
 * A grouped section inside a DetailPage. Use for "Configuration",
 * "Content", "Metadata" etc. Uses the standard Card styling.
 */
export interface DetailSectionProps {
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
	actions?: React.ReactNode;
}

export function DetailSection({
	title,
	description,
	children,
	className,
	actions,
}: DetailSectionProps) {
	return (
		<Card className={className}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div>
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</div>
				{actions}
			</CardHeader>
			<CardContent className="space-y-2 text-sm">{children}</CardContent>
		</Card>
	);
}
