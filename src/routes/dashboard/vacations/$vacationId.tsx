import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/vacations/$vacationId")({
	component: VacationDetailPage,
});

function VacationDetailPage() {
	const { vacationId } = Route.useParams();
	const { data: vacation, isPending, error } = useQuery(
		convexQuery(api.vacationRequests.get, {
			requestId: vacationId as Id<"vacationRequests">,
		}),
	);
	const approve = useMutation(api.vacationRequests.approve);
	const reject = useMutation(api.vacationRequests.reject);
	const [pending, setPending] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	if (isPending) return <p className="text-muted-foreground">Loading…</p>;
	if (error) return <p className="text-destructive text-sm">Error: {error.message}</p>;
	if (!vacation) return <DetailPage title="Vacation request not found" backTo="/dashboard/vacations" />;

	const dayCount = Math.floor(
		(Date.parse(vacation.endDate) - Date.parse(vacation.startDate)) / 86_400_000 + 1,
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
		<DetailPage title="Vacation request" subtitle={vacation.userId} backTo="/dashboard/vacations">
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Start" value={vacation.startDate} />
				<MetricCard label="End" value={vacation.endDate} />
				<MetricCard label="Days" value={dayCount.toString()} />
				<MetricCard label="Status" value={vacation.status}>
					<StatusBadge status={vacation.status} />
				</MetricCard>
			</div>

			{vacation.reason && (
				<DetailSection title="Reason">
					<p className="text-sm whitespace-pre-wrap">{vacation.reason}</p>
				</DetailSection>
			)}

			{vacation.status === "pending" && (
				<DetailSection title="Review" description="Approve or reject this request">
					{errorMsg && <p className="text-destructive text-sm">{errorMsg}</p>}
					<div className="flex gap-2">
						<Button onClick={onApprove} disabled={pending}>
							{pending ? "Working…" : "Approve"}
						</Button>
						<Button onClick={onReject} disabled={pending} variant="destructive">
							{pending ? "Working…" : "Reject"}
						</Button>
					</div>
				</DetailSection>
			)}

			{vacation.status !== "pending" && (
				<DetailSection title="Review">
					{vacation.reviewedBy && <DetailRow label="Reviewed by" value={vacation.reviewedBy} mono />}
					{vacation.reviewedAt && <DetailRow label="Reviewed at" value={new Date(vacation.reviewedAt).toLocaleString()} />}
				</DetailSection>
			)}
		</DetailPage>
	);
}
