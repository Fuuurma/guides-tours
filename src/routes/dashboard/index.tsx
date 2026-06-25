import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardIndex,
});

function DashboardIndex() {
	const { data: org } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Dashboard</CardTitle>
					<CardDescription>
						Welcome to {org?.name ?? "your workspace"}.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">
						Use the navigation above to manage customers, bookings, tours, and
						assignments.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
