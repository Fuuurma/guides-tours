import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/dashboard/vacations/$vacationId")({
	component: VacationDetailPage,
});

const statusColors: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-800",
	approved: "bg-green-100 text-green-800",
	rejected: "bg-red-100 text-red-800",
};

function VacationDetailPage() {
	const { vacationId } = Route.useParams();
	const { data: vacation, isPending, error } = useQuery(
		convexQuery(api.vacationRequests.get, { requestId: vacationId as never }),
	);
	const approve = useMutation(api.vacationRequests.approve);
	const reject = useMutation(api.vacationRequests.reject);
	const [pending, setPending] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">Error: {error.message}</p>
		);
	}
	if (!vacation) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Vacation request not found.</p>
				<Button asChild variant="outline">
					<Link to="/dashboard/vacations">← Back to vacations</Link>
				</Button>
			</div>
		);
	}

	const dayCount = Math.floor(
		(Date.parse(vacation.endDate) - Date.parse(vacation.startDate)) /
			86_400_000 +
			1,
	);

	const onApprove = async () => {
		setPending(true);
		setErrorMsg(null);
		try {
			await approve({ requestId: vacation._id });
			toast.success("Vacation approved");
		} catch (err) {
			setErrorMsg((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	const onReject = async () => {
		setPending(true);
		setErrorMsg(null);
		try {
			await reject({ requestId: vacation._id });
			toast.success("Vacation rejected");
		} catch (err) {
			setErrorMsg((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Vacation request</h1>
					<p className="text-muted-foreground text-sm font-mono">
						{vacation.userId}
					</p>
				</div>
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/dashboard/vacations">← Back</Link>
					</Button>
				</div>
			</header>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Metric label="Start" value={vacation.startDate} />
				<Metric label="End" value={vacation.endDate} />
				<Metric label="Days" value={dayCount.toString()} />
				<Metric
					label="Status"
					customBadge={
						<Badge
							className={statusColors[vacation.status] ?? ""}
							variant="secondary"
						>
							{vacation.status}
						</Badge>
					}
				/>
			</div>

			{vacation.reason && (
				<Card>
					<CardHeader>
						<CardTitle>Reason</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm whitespace-pre-wrap">{vacation.reason}</p>
					</CardContent>
				</Card>
			)}

			{vacation.status === "pending" && (
				<Card>
					<CardHeader>
						<CardTitle>Review</CardTitle>
						<CardDescription>Approve or reject this request</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{errorMsg && (
							<p className="text-destructive text-sm">{errorMsg}</p>
						)}
						<div className="flex gap-2">
							<Button onClick={onApprove} disabled={pending}>
								{pending ? "Working…" : "Approve"}
							</Button>
							<Button
								onClick={onReject}
								disabled={pending}
								variant="destructive"
							>
								{pending ? "Working…" : "Reject"}
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{vacation.status !== "pending" && (
				<Card>
					<CardHeader>
						<CardTitle>Review</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						{vacation.reviewedBy && (
							<div className="flex items-baseline justify-between gap-4">
								<span className="text-muted-foreground">Reviewed by</span>
								<span className="font-mono text-xs">{vacation.reviewedBy}</span>
							</div>
						)}
						{vacation.reviewedAt && (
							<div className="flex items-baseline justify-between gap-4">
								<span className="text-muted-foreground">Reviewed at</span>
								<span>{new Date(vacation.reviewedAt).toLocaleString()}</span>
							</div>
						)}
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
	value?: string;
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
