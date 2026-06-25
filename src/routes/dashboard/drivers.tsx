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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/drivers")({
	component: DriversPage,
});

function DriversPage() {
	const { data: drivers, isPending } = useQuery(
		convexQuery(api.drivers.list, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Drivers</CardTitle>
					<CardDescription>
						{drivers?.length ?? 0} driver
						{(drivers?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !drivers?.length ? (
						<p className="text-muted-foreground text-sm">No drivers yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>User ID</TableHead>
									<TableHead>License</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{drivers.map((d) => (
									<TableRow key={d._id}>
										<TableCell className="font-mono text-xs">
											{d.userId}
										</TableCell>
										<TableCell>{d.licenseInfo}</TableCell>
										<TableCell>
											{d.isActive ? (
												<Badge>Active</Badge>
											) : (
												<Badge variant="secondary">Inactive</Badge>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
