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

export const Route = createFileRoute("/dashboard/customers")({
	component: CustomersPage,
});

function CustomersPage() {
	const { data: org } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);
	const { data: customers, isPending } = useQuery(
		convexQuery(api.customers.list, {}),
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
					<CardTitle>Customers</CardTitle>
					<CardDescription>
						{customers?.items?.length ?? 0} customer
						{(customers?.items?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !customers?.items?.length ? (
						<p className="text-muted-foreground text-sm">No customers yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Phone</TableHead>
									<TableHead>Visits</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{customers.items.map((c) => (
									<TableRow key={c._id}>
										<TableCell className="font-medium">{c.name}</TableCell>
										<TableCell>{c.email}</TableCell>
										<TableCell>{c.phone}</TableCell>
										<TableCell>{c.totalVisits}</TableCell>
										<TableCell>
											{c.vipStatus ? (
												<Badge>VIP</Badge>
											) : (
												<Badge variant="secondary">Regular</Badge>
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
