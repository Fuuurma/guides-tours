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

export const Route = createFileRoute("/dashboard/vehicles")({
	component: VehiclesPage,
});

const statusColors: Record<string, string> = {
	available: "bg-green-100 text-green-800",
	in_use: "bg-blue-100 text-blue-800",
	maintenance: "bg-yellow-100 text-yellow-800",
	retired: "bg-gray-100 text-gray-800",
};

function VehiclesPage() {
	const { data: vehicles, isPending } = useQuery(
		convexQuery(api.vehicles.list, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Vehicles</CardTitle>
					<CardDescription>
						{vehicles?.length ?? 0} vehicle
						{(vehicles?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !vehicles?.length ? (
						<p className="text-muted-foreground text-sm">No vehicles yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Plate</TableHead>
									<TableHead>Capacity</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{vehicles.map((v) => (
									<TableRow key={v._id}>
										<TableCell className="font-medium">{v.name}</TableCell>
										<TableCell>{v.vehicleType}</TableCell>
										<TableCell>{v.licensePlate}</TableCell>
										<TableCell>{v.capacity}</TableCell>
										<TableCell>
											<Badge
												className={statusColors[v.status] ?? ""}
												variant="secondary"
											>
												{v.status}
											</Badge>
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
