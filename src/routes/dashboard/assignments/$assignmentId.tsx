import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { MemberSelect } from "@/components/member-select";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
	const confirm = useConfirm();
	const [action, setAction] = useState<
		"complete" | "cancel" | "remove" | "save" | null
	>(null);
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
		setAction("complete");
		try {
			await complete({ assignmentId: assignmentId as Id<"assignments"> });
			toast.success("Assignment marked complete");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setAction(null);
		}
	};
	const onCancel = async () => {
		const ok = await confirm({
			title: "Cancel this assignment?",
			description:
				"The guide will be unassigned from this departure. You can assign someone else afterward.",
			confirmText: "Cancel assignment",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setAction("cancel");
		try {
			await cancel({
				assignmentId: assignmentId as Id<"assignments">,
			});
			toast.success("Assignment cancelled");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setAction(null);
		}
	};
	const onRemove = async () => {
		const ok = await confirm({
			title: "Delete this assignment?",
			description: "This will soft-delete it.",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setAction("remove");
		try {
			await remove({ assignmentId: assignmentId as Id<"assignments"> });
			toast.success("Assignment deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setAction(null);
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
		setAction("save");
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
			setAction(null);
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
	const busy = action !== null;

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
							disabled={busy}
						>
							Edit staffing
						</Button>
					)}
					{canEdit && (
						<Button
							variant="outline"
							disabled={busy || resendPending}
							onClick={() => void onResend("both")}
						>
							{resendPending ? <Spinner data-icon="inline-start" /> : null}
							{resendPending ? "Sending…" : "Resend notify"}
						</Button>
					)}
					{canComplete && (
						<Button onClick={onComplete} disabled={busy}>
							{action === "complete" ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Mark complete
						</Button>
					)}
					{canCancel && (
						<Button variant="outline" onClick={onCancel} disabled={busy}>
							{action === "cancel" ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Cancel
						</Button>
					)}
					{canDelete && (
						<Button variant="destructive" onClick={onRemove} disabled={busy}>
							{action === "remove" ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Delete
						</Button>
					)}
					{assignment.scheduleId ? (
						<Button asChild variant="outline">
							<Link
								to="/dashboard/schedules/$scheduleId"
								params={{ scheduleId: assignment.scheduleId }}
							>
								View departure
							</Link>
						</Button>
					) : null}
					{tour && (
						<Button asChild variant="ghost">
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

			{slot && !slot.ready ? (
				<Alert variant="destructive">
					<AlertTitle>This departure still needs crew</AlertTitle>
					<AlertDescription>
						Still needs {slot.gaps.join(", ")}
						{staffing
							? ` · ${staffing.requiredGuides} guide${staffing.requiredGuides === 1 ? "" : "s"} required`
							: ""}
						.
					</AlertDescription>
				</Alert>
			) : staffing ? (
				<p className="text-muted-foreground text-xs">
					Needs {staffing.requiredGuides} guide
					{staffing.requiredGuides === 1 ? "" : "s"}
					{staffing.requiresVehicle
						? ` · vehicle${staffing.requiredVehicleType ? ` (${staffing.requiredVehicleType})` : ""}`
						: ""}
					{staffing.requiresDriver ? " · driver" : ""}
					{slot
						? ` · ${slot.guideCount}/${slot.requiredGuides} guides assigned`
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
					<ul className="flex flex-col gap-2">
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
					<FieldGroup>
						<div className="grid gap-4 md:grid-cols-3">
							<Field>
								<FieldLabel htmlFor="edit-guide">Guide *</FieldLabel>
								<MemberSelect
									id="edit-guide"
									value={guideId}
									onValueChange={setGuideId}
									roles={["guide", "owner", "admin"]}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="edit-vehicle">
									{staffing?.requiresVehicle ? "Vehicle *" : "Vehicle"}
								</FieldLabel>
								<Select
									value={vehicleId || "__none__"}
									onValueChange={(v) => setVehicleId(v === "__none__" ? "" : v)}
								>
									<SelectTrigger id="edit-vehicle">
										<SelectValue placeholder="None" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{!staffing?.requiresVehicle && (
												<SelectItem value="__none__">None</SelectItem>
											)}
											{eligibleVehicles.map((v) => (
												<SelectItem key={v._id} value={v._id}>
													{v.name}
													{v.vehicleType ? ` · ${v.vehicleType}` : ""}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="edit-driver">
									{staffing?.requiresDriver ? "Driver *" : "Driver"}
								</FieldLabel>
								<Select
									value={driverId || "__none__"}
									onValueChange={(v) => setDriverId(v === "__none__" ? "" : v)}
								>
									<SelectTrigger id="edit-driver">
										<SelectValue placeholder="None" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{!staffing?.requiresDriver && (
												<SelectItem value="__none__">None</SelectItem>
											)}
											{eligibleDrivers.map((d) => (
												<SelectItem key={d._id} value={d._id}>
													{displayName(d.userId)}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						</div>
					</FieldGroup>
					<div className="mt-4 flex gap-2">
						<Button onClick={onSaveStaffing} disabled={busy}>
							{action === "save" ? <Spinner data-icon="inline-start" /> : null}
							Save
						</Button>
						<Button
							variant="outline"
							disabled={busy}
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
					title="Fleet"
					description="Vehicle and driver for this assignment"
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
								<span className="text-muted-foreground">Not assigned</span>
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
								<span className="text-muted-foreground">Not assigned</span>
							)
						}
					/>
				</DetailSection>
			)}
		</DetailPage>
	);
}
