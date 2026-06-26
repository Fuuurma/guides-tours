import * as React from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

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
	/** Extra actions to render next to the New button. */
	actions?: React.ReactNode;
	children: React.ReactNode;
}

export function ListPage({
	title,
	description,
	newTo,
	newLabel,
	actions,
	children,
}: ListPageProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div>
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</div>
				<div className="flex gap-2">
					{actions}
					{newTo && (
						<Button asChild>
							<Link to={newTo}>{newLabel ?? "+ New"}</Link>
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
