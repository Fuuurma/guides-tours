import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useOrgMembers } from "@/hooks/use-org-members";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/vacations/$vacationId")({
	component: VacationDetailPage,
});

type ReviewAction = "approve" | "force" | "reject";

function VacationDetailPage() {
	const { vacationId } = Route.useParams();
	const {
		data: vacation,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.vacationRequests.get, {
			requestId: vacationId as Id<"vacationRequests">,
		}),
	);
	const approve = useMutation(api.vacationRequests.approve);
	const reject = useMutation(api.vacationRequests.reject);
	const confirm = useConfirm();
	const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const { displayName } = useOrgMembers();

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	if (!vacation)
		return (
			<DetailPage
				title="Vacation request not found"
				backTo="/dashboard/vacations"
			/>
		);

	const dayCount = Math.floor(
		(Date.parse(vacation.endDate) - Date.parse(vacation.startDate)) /
			86_400_000 +
			1,
	);
	const busy = reviewAction !== null;

	const onApprove = async (force = false) => {
		setReviewAction(force ? "force" : "approve");
		setErrorMsg(null);
		try {
			await approve({ requestId: vacation._id, force: force || undefined });
			toast.success("Vacation approved");
		} catch (err) {
			const msg = getErrorMessage(err);
			setErrorMsg(msg);
			toast.error(msg);
		} finally {
			setReviewAction(null);
		}
	};

	const onReject = async () => {
		const ok = await confirm({
			title: "Reject this vacation request?",
			description:
				"The requester will see it as rejected. This cannot be undone from here.",
			confirmText: "Reject",
			variant: "destructive",
		});
		if (!ok) return;
		setReviewAction("reject");
		setErrorMsg(null);
		try {
			await reject({ requestId: vacation._id });
			toast.success("Vacation rejected");
		} catch (err) {
			const msg = getErrorMessage(err);
			setErrorMsg(msg);
			toast.error(msg);
		} finally {
			setReviewAction(null);
		}
	};

	return (
		<DetailPage
			title="Vacation request"
			subtitle={displayName(vacation.userId)}
			backTo="/dashboard/vacations"
		>
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
				<DetailSection
					title="Review"
					description="Approving blocks overlapping assignments for these dates."
				>
					{errorMsg && (
						<ErrorBanner
							message={errorMsg.replace(
								/^VACATION_ASSIGNMENT_CONFLICT:\s*/,
								"",
							)}
						/>
					)}
					<div className="flex flex-wrap gap-2">
						<Button onClick={() => void onApprove(false)} disabled={busy}>
							{reviewAction === "approve" ? (
								<Spinner data-icon="inline-start" />
							) : null}
							{reviewAction === "approve" ? "Working…" : "Approve"}
						</Button>
						{errorMsg?.includes("VACATION_ASSIGNMENT_CONFLICT") && (
							<Button
								variant="outline"
								onClick={() => void onApprove(true)}
								disabled={busy}
							>
								{reviewAction === "force" ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Approve anyway
							</Button>
						)}
						<Button
							onClick={() => void onReject()}
							disabled={busy}
							variant="destructive"
						>
							{reviewAction === "reject" ? (
								<Spinner data-icon="inline-start" />
							) : null}
							{reviewAction === "reject" ? "Working…" : "Reject"}
						</Button>
					</div>
				</DetailSection>
			)}

			{vacation.status !== "pending" && (
				<DetailSection title="Review">
					{vacation.reviewedBy && (
						<DetailRow label="Reviewed by" value={vacation.reviewedBy} mono />
					)}
					{vacation.reviewedAt && (
						<DetailRow
							label="Reviewed at"
							value={new Date(vacation.reviewedAt).toLocaleString()}
						/>
					)}
				</DetailSection>
			)}
		</DetailPage>
	);
}
