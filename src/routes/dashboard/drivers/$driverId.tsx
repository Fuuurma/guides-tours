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

export const Route = createFileRoute("/dashboard/drivers/$driverId")({
	component: DriverDetailPage,
});

function DriverDetailPage() {
	const { driverId } = Route.useParams();
	const { data: driver, isPending, error } = useQuery(
		convexQuery(api.drivers.get, { driverId: driverId as never }),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!driver) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Driver not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/drivers">← Back to drivers</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Driver</h1>
					<p className="text-muted-foreground text-sm font-mono">
						{driver.userId}
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/dashboard/drivers">← Back</Link>
					</Button>
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Status</CardDescription>
					</CardHeader>
					<CardContent>
						{driver.isActive ? (
							<Badge>Active</Badge>
						) : (
							<Badge variant="secondary">Inactive</Badge>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>License</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm">{driver.licenseInfo}</p>
					</CardContent>
				</Card>
			</div>

			{driver.notes && (
				<Card>
					<CardHeader>
						<CardTitle>Notes</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm whitespace-pre-wrap">{driver.notes}</p>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Metadata</CardTitle>
					<CardDescription>System fields</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<div className="flex items-baseline justify-between gap-4">
						<span className="text-muted-foreground">Driver ID</span>
						<span className="font-mono text-xs">{driver._id}</span>
					</div>
					<div className="flex items-baseline justify-between gap-4">
						<span className="text-muted-foreground">Created at</span>
						<span>
							{new Date(driver.createdAt).toLocaleString()}
						</span>
					</div>
					<div className="flex items-baseline justify-between gap-4">
						<span className="text-muted-foreground">Updated at</span>
						<span>
							{new Date(driver.updatedAt).toLocaleString()}
						</span>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
