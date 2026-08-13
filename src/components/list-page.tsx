import { Link, Outlet, useLocation } from "@tanstack/react-router";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Standard shell for list/index pages. Replaces the duplicated
 * Card + CardHeader + count + "+ New" button pattern across all
 * 7 list pages (customers, tours, bookings, assignments, etc.).
 *
 * @example
 *   <ListPage
 *     title="Customers"
 *     description={`${count} customer${count === 1 ? "" : "s"}`}
 *     newTo="/dashboard/customers/new"
 *     newLabel="+ New customer"
 *   >
 *     <DataTable ... />
 *   </ListPage>
 */
export interface ListPageProps {
	title: string;
	description?: string;
	newTo?: string;
	newLabel?: string;
	/** Base path used to hide the list while a nested route is active. */
	basePath?: string;
	/** Extra actions to render next to the New button. */
	actions?: React.ReactNode;
	/** Content shown below the list card, only on the list route. */
	below?: React.ReactNode;
	children: React.ReactNode;
}

export function ListPage({
	title,
	description,
	newTo,
	newLabel,
	basePath,
	actions,
	below,
	children,
}: ListPageProps) {
	const { pathname } = useLocation();
	const listPath = basePath ?? newTo?.replace(/\/new$/, "");
	const isListRoute =
		!listPath || pathname === listPath || pathname === `${listPath}/`;

	return (
		<>
			{isListRoute ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="min-w-0">
							<h1 className="text-balance text-2xl font-semibold tracking-tight">
								{title}
							</h1>
							{description && (
								<p className="mt-1 text-sm text-muted-foreground">
									{description}
								</p>
							)}
						</div>
						<div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
							{actions}
							{newTo && (
								<Button asChild>
									<Link to={newTo}>{newLabel ?? "+ New"}</Link>
								</Button>
							)}
						</div>
					</div>
					<Card className="overflow-hidden">
						<CardContent className="pt-6">{children}</CardContent>
					</Card>
					{below}
				</div>
			) : (
				<Outlet />
			)}
		</>
	);
}
