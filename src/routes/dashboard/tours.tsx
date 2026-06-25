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

export const Route = createFileRoute("/dashboard/tours")({
	component: ToursPage,
});

function ToursPage() {
	const { data: tours, isPending } = useQuery(
		convexQuery(api.tours.list, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Tours</CardTitle>
					<CardDescription>
						{tours?.length ?? 0} tour{(tours?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !tours?.length ? (
						<p className="text-muted-foreground text-sm">No tours yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Duration</TableHead>
									<TableHead>Capacity</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{tours.map((t) => (
									<TableRow key={t._id}>
										<TableCell className="font-medium">{t.name}</TableCell>
										<TableCell>{t.tourType}</TableCell>
										<TableCell>{t.durationHours}h</TableCell>
										<TableCell>
											{t.minGuests}-{t.maxGuests}
										</TableCell>
										<TableCell>
											{t.isActive ? (
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
