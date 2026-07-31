import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { FormField } from "@/components/form";
import { MemberSelect } from "@/components/member-select";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { useOrgMembers } from "@/hooks/use-org-members";
import { resolveTourStaffing } from "@/lib/staffing";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/assignments/$assignmentId")({
	component: AssignmentDetailPage,
});

function AssignmentDetailPage() {
	const { assignmentId } = Route.useParams();
	const {
		data: assignment,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.assignments.get, {
			assignmentId: assignmentId as Id<"assignments">,
		}),
	);
	const { data: tour } = useQuery(
		convexQuery(
			api.tours.get,
			assignment?.tourId ? { tourId: assignment.tourId } : "skip",
		),
	);
	const { data: vehicles } = useQuery(convexQuery(api.vehicles.list, {}));
	const { data: drivers } = useQuery(convexQuery(api.drivers.list, {}));
	const { data: vehicle } = useQuery(
		convexQuery(
			api.vehicles.get,
			assignment?.vehicleId ? { vehicleId: assignment.vehicleId } : "skip",
		),
	);
	const { data: driver } = useQuery(
		convexQuery(
			api.drivers.get,
			assignment?.driverId ? { driverId: assignment.driverId } : "skip",
		),
	);
	const { displayName } = useOrgMembers(["guide", "owner", "admin"]);
	const { data: slot } = useQuery(
		convexQuery(api.assignments.slotCompanions, {
			assignmentId: assignmentId as Id<"assignments">,
		}),
	);
	const complete = useMutation(api.assignments.complete);
	const cancel = useMutation(api.assignments.cancel);
	const remove = useMutation(api.assignments.remove);
	const update = useMutation(api.assignments.update);
	const resendNotify = useMutation(api.assignmentNotifications.resend);
	const [pending, setPending] = useState(false);
	const [editing, setEditing] = useState(false);
	const [guideId, setGuideId] = useState("");
	const [vehicleId, setVehicleId] = useState("");
	const [driverId, setDriverId] = useState("");
	const [resendPending, setResendPending] = useState(false);

	useEffect(() => {
		if (!assignment) return;
		setGuideId(assignment.guideId);
		setVehicleId(assignment.vehicleId ?? "");
		setDriverId(assignment.driverId ?? "");
	}, [assignment]);

	const staffing = tour
		? resolveTourStaffing({
				tourType: tour.tourType,
				requiredGuides: tour.requiredGuides,
				requiresVehicle: tour.requiresVehicle,
				requiresDriver: tour.requiresDriver,
				requiredVehicleType: tour.requiredVehicleType,
			})
		: null;

	const eligibleVehicles = (vehicles ?? []).filter((v) => {
		if (v.status && v.status !== "available") return false;
		if (
			staffing?.requiredVehicleType &&
			v.vehicleType !== staffing.requiredVehicleType
		) {
			return false;
		}
		return true;
	});
	const eligibleDrivers = (drivers ?? []).filter((d) => d.isActive !== false);

	const onComplete = async () => {
		setPending(true);
		try {
			await complete({ assignmentId: assignmentId as Id<"assignments"> });
			toast.success("Assignment marked complete");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};
	const onCancel = async () => {
		const reason = window.prompt("Reason for cancellation? (optional)") ?? "";
		setPending(true);
		try {
			await cancel({
				assignmentId: assignmentId as Id<"assignments">,
				reason: reason.trim() || undefined,
			});
			toast.success("Assignment cancelled");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};
	const onRemove = async () => {
		if (!window.confirm("Delete this assignment? This will soft-delete it.")) {
			return;
		}
		setPending(true);
		try {
			await remove({ assignmentId: assignmentId as Id<"assignments"> });
			toast.success("Assignment deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};
	const onSaveStaffing = async () => {
		if (!guideId.trim()) {
			toast.error("Guide is required");
			return;
		}
		if (staffing?.requiresVehicle && !vehicleId) {
			toast.error("This tour requires a vehicle");
			return;
		}
		if (staffing?.requiresDriver && !driverId) {
			toast.error("This tour requires a driver");
			return;
		}
		setPending(true);
		try {
			await update({
				assignmentId: assignmentId as Id<"assignments">,
				guideId: guideId.trim(),
				vehicleId: vehicleId ? (vehicleId as Id<"vehicles">) : undefined,
				driverId: driverId ? (driverId as Id<"drivers">) : undefined,
				clearVehicle: !vehicleId,
				clearDriver: !driverId,
			});
			toast.success("Assignment updated");
			setEditing(false);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	const onResend = async (target: "guide" | "driver" | "both") => {
		setResendPending(true);
		try {
			const result = await resendNotify({
				assignmentId: assignmentId as Id<"assignments">,
				target,
			});
			const parts = [];
			if (result.guideQueued) parts.push("guide");
			if (result.driverQueued) parts.push("driver");
			toast.success(
				parts.length
					? `Notification queued for ${parts.join(" + ")}`
					: "Nothing queued",
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setResendPending(false);
		}
	};

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	if (!assignment)
		return (
			<DetailPage
				title="Assignment not found"
				backTo="/dashboard/assignments"
			/>
		);

	const endTimeDisplay = assignment.endTime ?? "—";
	const canComplete = assignment.status === "scheduled";
	const canCancel = assignment.status === "scheduled";
	const canDelete = assignment.status !== "completed";
	const canEdit = assignment.status === "scheduled";

	return (
		<DetailPage
			title={tour?.name ?? "Assignment"}
			subtitle={`${assignment.date} · ${assignment.startTime}–${endTimeDisplay}`}
			backTo="/dashboard/assignments"
			actions={
				<>
					{canEdit && !editing && (
						<Button
							variant="outline"
							onClick={() => setEditing(true)}
							disabled={pending}
						>
							Edit staffing
						</Button>
					)}
					{canEdit && (
						<Button
							variant="outline"
							disabled={pending || resendPending}
							onClick={() => void onResend("both")}
						>
							{resendPending ? "Sending…" : "Resend notify"}
						</Button>
					)}
					{canComplete && (
						<Button onClick={onComplete} disabled={pending}>
							Mark complete
						</Button>
					)}
					{canCancel && (
						<Button variant="outline" onClick={onCancel} disabled={pending}>
							Cancel
						</Button>
					)}
					{canDelete && (
						<Button variant="destructive" onClick={onRemove} disabled={pending}>
							Delete
						</Button>
					)}
					{tour && (
						<Button asChild variant="outline">
							<Link to="/dashboard/tours/$tourId" params={{ tourId: tour._id }}>
								View tour
							</Link>
						</Button>
					)}
				</>
			}
		>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Date" value={assignment.date} />
				<MetricCard
					label="Time"
					value={`${assignment.startTime}–${endTimeDisplay}`}
				/>
				<MetricCard label="Guide" value={displayName(assignment.guideId)} />
				<MetricCard label="Status" value={assignment.status}>
					<StatusBadge status={assignment.status} />
				</MetricCard>
			</div>

			{staffing ? (
				<p className="text-muted-foreground text-xs">
					Needs {staffing.requiredGuides} guide
					{staffing.requiredGuides === 1 ? "" : "s"}
					{staffing.requiresVehicle
						? ` · vehicle${staffing.requiredVehicleType ? ` (${staffing.requiredVehicleType})` : ""}`
						: ""}
					{staffing.requiresDriver ? " · driver" : ""}
					{slot
						? ` · slot ${slot.guideCount}/${slot.requiredGuides} guides${
								slot.ready ? " · ready" : ` · needs ${slot.gaps.join(", ")}`
							}`
						: ""}
				</p>
			) : null}

			{slot && slot.siblings.length > 0 ? (
				<DetailSection
					title="This departure"
					description={
						slot.ready
							? "Slot is fully staffed"
							: `Still needs: ${slot.gaps.join(", ")}`
					}
					actions={
						!slot.ready && canEdit ? (
							<Button asChild size="sm">
								<Link
									to="/dashboard/assignments/new"
									search={{
										date: slot.date,
										...(slot.scheduleId ? { scheduleId: slot.scheduleId } : {}),
									}}
								>
									+ Assign
								</Link>
							</Button>
						) : null
					}
				>
					<ul className="space-y-2">
						{slot.siblings.map((s) => (
							<li
								key={s._id}
								className="flex flex-wrap items-center justify-between gap-2 text-sm"
							>
								<span>
									{s.isCurrent ? (
										<span className="font-medium">
											{displayName(s.guideId)} (this)
										</span>
									) : (
										<Link
											to="/dashboard/assignments/$assignmentId"
											params={{ assignmentId: s._id }}
											className="text-link hover:underline"
										>
											{displayName(s.guideId)}
										</Link>
									)}
									<span className="text-muted-foreground">
										{" "}
										· {s.status}
										{s.vehicleId ? " · vehicle" : ""}
										{s.driverId ? " · driver" : ""}
									</span>
								</span>
								{s.isCurrent && canEdit ? (
									<div className="flex flex-wrap gap-1">
										<Button
											type="button"
											size="sm"
											variant="ghost"
											disabled={resendPending}
											onClick={() => void onResend("guide")}
										>
											Notify guide
										</Button>
										{s.driverId ? (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												disabled={resendPending}
												onClick={() => void onResend("driver")}
											>
												Notify driver
											</Button>
										) : null}
									</div>
								) : null}
							</li>
						))}
					</ul>
				</DetailSection>
			) : null}

			{editing ? (
				<DetailSection
					title="Edit staffing"
					description="Change guide, vehicle, or driver for this departure"
				>
					<div className="grid gap-4 md:grid-cols-3">
						<FormField label="Guide *" htmlFor="edit-guide">
							<MemberSelect
								id="edit-guide"
								value={guideId}
								onValueChange={setGuideId}
								roles={["guide", "owner", "admin"]}
							/>
						</FormField>
						<FormField
							label={staffing?.requiresVehicle ? "Vehicle *" : "Vehicle"}
							htmlFor="edit-vehicle"
						>
							<Select
								value={vehicleId || "__none__"}
								onValueChange={(v) => setVehicleId(v === "__none__" ? "" : v)}
							>
								<SelectTrigger id="edit-vehicle">
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									{!staffing?.requiresVehicle && (
										<SelectItem value="__none__">None</SelectItem>
									)}
									{eligibleVehicles.map((v) => (
										<SelectItem key={v._id} value={v._id}>
											{v.name}
											{v.vehicleType ? ` · ${v.vehicleType}` : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
						<FormField
							label={staffing?.requiresDriver ? "Driver *" : "Driver"}
							htmlFor="edit-driver"
						>
							<Select
								value={driverId || "__none__"}
								onValueChange={(v) => setDriverId(v === "__none__" ? "" : v)}
							>
								<SelectTrigger id="edit-driver">
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									{!staffing?.requiresDriver && (
										<SelectItem value="__none__">None</SelectItem>
									)}
									{eligibleDrivers.map((d) => (
										<SelectItem key={d._id} value={d._id}>
											{displayName(d.userId)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
					</div>
					<div className="mt-4 flex gap-2">
						<Button onClick={onSaveStaffing} disabled={pending}>
							Save
						</Button>
						<Button
							variant="outline"
							disabled={pending}
							onClick={() => {
								setEditing(false);
								setGuideId(assignment.guideId);
								setVehicleId(assignment.vehicleId ?? "");
								setDriverId(assignment.driverId ?? "");
							}}
						>
							Cancel
						</Button>
					</div>
				</DetailSection>
			) : (
				<DetailSection
					title="Resources"
					description="Vehicle and driver (if assigned)"
				>
					<DetailRow
						label="Vehicle"
						value={
							vehicle ? (
								<Link
									to="/dashboard/vehicles/$vehicleId"
									params={{ vehicleId: vehicle._id }}
									className="text-link hover:underline"
								>
									{vehicle.name}
								</Link>
							) : (
								<span className="italic text-muted-foreground">
									Not assigned
								</span>
							)
						}
					/>
					<DetailRow
						label="Driver"
						value={
							driver ? (
								<Link
									to="/dashboard/drivers/$driverId"
									params={{ driverId: driver._id }}
									className="text-link hover:underline"
								>
									{displayName(driver.userId)}
								</Link>
							) : (
								<span className="italic text-muted-foreground">
									Not assigned
								</span>
							)
						}
					/>
				</DetailSection>
			)}
		</DetailPage>
	);
}
