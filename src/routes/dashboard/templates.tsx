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

export const Route = createFileRoute("/dashboard/templates")({
	component: TemplatesPage,
});

function TemplatesPage() {
	const { data: templates, isPending } = useQuery(
		convexQuery(api.tourTemplates.list, {}),
	);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Tour templates</CardTitle>
					<CardDescription>
						{templates?.length ?? 0} template
						{(templates?.length ?? 0) === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading...</p>
					) : !templates?.length ? (
						<p className="text-muted-foreground text-sm">
							No templates yet. Use templates to spin up multiple tours with shared defaults.
						</p>
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
								{templates.map((t) => (
									<TableRow key={t._id}>
										<TableCell className="font-medium">{t.name}</TableCell>
										<TableCell>{t.tourType}</TableCell>
										<TableCell>{t.durationHours}h</TableCell>
										<TableCell>{t.capacity}</TableCell>
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