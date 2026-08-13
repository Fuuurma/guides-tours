import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type * as React from "react";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
	children?: React.ReactNode;
	className?: string;
}

export function PageBackLink({
	to,
	label = "Back",
}: {
	to: string;
	label?: string;
}) {
	return (
		<Link
			to={to}
			className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft aria-hidden="true" className="size-4" />
			{label}
		</Link>
	);
}

export function DetailPage({
	title,
	subtitle,
	backTo,
	backLabel = "Back",
	actions,
	children,
	className,
}: DetailPageProps) {
	const { pathname } = useLocation();

	// Detail edit routes are children of the detail route. Keep the shared
	// shell responsible for forwarding them so every entity gets the same
	// nested-route behavior without duplicating an <Outlet /> in each page.
	if (pathname.endsWith("/edit")) {
		return <Outlet />;
	}

	return (
		<div className={cn("space-y-6", className)}>
			<PageBackLink to={backTo} label={backLabel} />
			<header className="flex flex-wrap items-start justify-between gap-5">
				<div className="min-w-0">
					<h1 className="text-balance text-2xl font-semibold tracking-tight">
						{title}
					</h1>
					{subtitle && (
						<p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
					)}
				</div>
				{actions && (
					<div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
						{actions}
					</div>
				)}
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
			<CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b pb-5">
				<div className="min-w-0">
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</div>
				{actions && <div className="shrink-0">{actions}</div>}
			</CardHeader>
			<CardContent className="space-y-3 text-sm">{children}</CardContent>
		</Card>
	);
}
