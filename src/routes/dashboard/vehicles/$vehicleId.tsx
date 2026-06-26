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

export const Route = createFileRoute("/dashboard/vehicles/$vehicleId")({
	component: VehicleDetailPage,
});

const statusColors: Record<string, string> = {
	available: "bg-green-100 text-green-800",
	in_use: "bg-blue-100 text-blue-800",
	maintenance: "bg-yellow-100 text-yellow-800",
	retired: "bg-gray-100 text-gray-800",
};

function VehicleDetailPage() {
	const { vehicleId } = Route.useParams();
	const { data: vehicle, isPending, error } = useQuery(
		convexQuery(api.vehicles.get, { vehicleId: vehicleId as never }),
	);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!vehicle) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Vehicle not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/vehicles">← Back to vehicles</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{vehicle.name}</h1>
					<p className="text-muted-foreground text-sm">
						{vehicle.vehicleType}
						{vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/dashboard/vehicles">← Back</Link>
					</Button>
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric label="Capacity" value={`${vehicle.capacity} guests`} />
				<Metric
					label="Status"
					value={vehicle.status}
					customBadge={
						<Badge
							className={statusColors[vehicle.status] ?? ""}
							variant="secondary"
						>
							{vehicle.status}
						</Badge>
					}
				/>
				<Metric
					label="Ownership"
					value={vehicle.ownershipType || "(unset)"}
				/>
				<Metric
					label="Year"
					value={vehicle.year?.toString() ?? "—"}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Specifications</CardTitle>
					<CardDescription>Make, model, and identification</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<Row label="Make" value={vehicle.make || "—"} />
					<Row label="Model" value={vehicle.model || "—"} />
					<Row label="Color" value={vehicle.color || "—"} />
					<Row label="License plate" value={vehicle.licensePlate || "—"} />
				</CardContent>
			</Card>

			{vehicle.notes && (
				<Card>
					<CardHeader>
						<CardTitle>Notes</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm whitespace-pre-wrap">{vehicle.notes}</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function Metric({
	label,
	value,
	customBadge,
}: {
	label: string;
	value: string;
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
