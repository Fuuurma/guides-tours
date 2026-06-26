import * as React from "react";
import { Link } from "@tanstack/react-router";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * A metric card used on dashboard detail pages and the home
 * dashboard. Replaces the ~10 hand-rolled `Metric` / `MetricCard`
 * components in route files.
 *
 * Three display modes:
 *   - value:           string | number  — large text
 *   - badgeVariant:    renders a <Badge variant={...}>
 *   - children:        arbitrary ReactNode  (escape hatch)
 */
export interface MetricCardProps {
	label: string;
	value?: string | number;
	badgeVariant?: BadgeProps["variant"];
	children?: React.ReactNode;
	/** Render a subtle "—" placeholder while data loads. */
	isPending?: boolean;
	className?: string;
}

export function MetricCard({
	label,
	value,
	badgeVariant,
	children,
	isPending,
	className,
}: MetricCardProps) {
	return (
		<Card className={className}>
			<CardHeader className="pb-2">
				<CardDescription>{label}</CardDescription>
			</CardHeader>
			<CardContent>
				{children ??
					(badgeVariant ? (
						<Badge variant={badgeVariant}>{value ?? "—"}</Badge>
					) : (
						<p className="text-2xl font-semibold">
							{isPending ? "…" : (value ?? "—")}
						</p>
					))}
			</CardContent>
		</Card>
	);
}

/**
 * A single labelled row used on detail pages to show a key/value
 * pair. Replaces the 10 copy-pasted `Row` helpers in route files.
 *
 *   <DetailRow label="Capacity" value={tour.capacity} />
 *   <DetailRow label="Status" value={<StatusBadge status={tour.status} />} />
 *   <DetailRow label="License plate" value={vehicle.licensePlate} mono />
 *   <DetailRow label="Description" value={tour.description} block />
 */
export interface DetailRowProps {
	label: string;
	value?: React.ReactNode;
	/** If true, render the value in a monospace font. */
	mono?: boolean;
	/**
	 * If true, render the value as a block below the label
	 * (rather than inline-right). Use for long values.
	 */
	block?: boolean;
	/** If true, render "—" as the placeholder. */
	empty?: boolean;
}

export function DetailRow({
	label,
	value,
	mono,
	block,
	empty,
}: DetailRowProps) {
	const display = value ?? (empty ? "—" : "");
	if (block) {
		return (
			<div>
				<span className="text-muted-foreground">{label}</span>
				<p className="mt-1 text-sm">{display}</p>
			</div>
		);
	}
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			{mono ? (
				<span className="font-mono text-xs">{display}</span>
			) : (
				<span>{display}</span>
			)}
		</div>
	);
}

/**
 * A clickable detail row that links to a related entity. Use
 * sparingly — for primary navigations like "Go to tour" on a
 * detail page.
 */
export interface DetailLinkRowProps {
	label: string;
	to: string;
	params?: Record<string, string>;
	children: React.ReactNode;
}

export function DetailLinkRow({ label, to, params, children }: DetailLinkRowProps) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<Link
				to={to}
				params={params}
				className="text-blue-600 hover:underline"
			>
				{children}
			</Link>
		</div>
	);
}
