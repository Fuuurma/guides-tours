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

export const Route = createFileRoute("/dashboard/bookings")({
	component: BookingsPage,
});

const statusColors: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-800",
	confirmed: "bg-green-100 text-green-800",
	checked_in: "bg-blue-100 text-blue-800",
	completed: "bg-gray-100 text-gray-800",
	cancelled: "bg-red-100 text-red-800",
};

function BookingsPage() {
	const { data: org } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);
	const { data: bookings, isPending } = useQuery(
		convexQuery(api.bookings.list, {}),
	);

	if (!org) {
		return (
			<p className="text-muted-foreground">No organization selected.</p>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Bookings</CardTitle>
					<CardDescription>
						{bookings?.items?.length ?? 0} booking
						{(bookings?.items?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !bookings?.items?.length ? (
						<p className="text-muted-foreground text-sm">No bookings yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>Tour</TableHead>
									<TableHead>Guests</TableHead>
									<TableHead>Amount</TableHead>
									<TableHead>Source</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{bookings.items.map((b) => (
									<TableRow key={b._id}>
										<TableCell>{b.date}</TableCell>
										<TableCell className="font-mono text-xs">
											{b.tourId}
										</TableCell>
										<TableCell>{b.guests}</TableCell>
										<TableCell>
											${(Number(b.totalAmountCents) / 100).toFixed(2)}
										</TableCell>
										<TableCell>
											<Badge variant="outline">{b.source}</Badge>
										</TableCell>
										<TableCell>
											<Badge
												className={statusColors[b.status] ?? ""}
												variant="secondary"
											>
												{b.status}
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
