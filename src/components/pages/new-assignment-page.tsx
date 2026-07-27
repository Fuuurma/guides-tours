import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { MemberSelect } from "@/components/member-select";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useOrgMembers } from "@/hooks/use-org-members";
import { resolveTourStaffing } from "@/lib/staffing";
import { addHours } from "@/lib/time";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

const assignmentNewRoute = getRouteApi("/dashboard/assignments/new");

interface Tour {
	_id: string;
	name: string;
	durationHours: number;
	tourType?: string;
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
}
interface Vehicle {
	_id: string;
	name: string;
	vehicleType?: string;
	capacity?: number;
	status?: string;
}
interface Driver {
	_id: string;
	userId: string;
	isActive?: boolean;
}

interface FormValues extends Record<string, unknown> {
	tourId: string;
	guideId: string;
	date: string;
	startTime: string;
	vehicleId: string;
	driverId: string;
}

const INITIAL: FormValues = {
	tourId: "",
	guideId: "",
	date: "",
	startTime: "",
	vehicleId: "",
	driverId: "",
};

export function NewAssignmentPage() {
	const { date: searchDate, scheduleId: searchScheduleId } =
		assignmentNewRoute.useSearch();
	const create = useMutation(api.assignments.create);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: vehicles } = useQuery(convexQuery(api.vehicles.list, {}));
	const { data: drivers } = useQuery(convexQuery(api.drivers.list, {}));
	const { displayName: memberName } = useOrgMembers();
	const { data: prefillSchedule } = useQuery(
		convexQuery(
			api.tourSchedules.get,
			searchScheduleId
				? { scheduleId: searchScheduleId as Id<"tourSchedules"> }
				: "skip",
		),
	);
	const [conflicts, setConflicts] = useState<string[]>([]);
	const [scheduleId, setScheduleId] = useState(searchScheduleId ?? "");

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			if (conflicts.length > 0) {
				throw new Error(
					`Scheduling conflicts detected: ${conflicts.join("; ")}`,
				);
			}
			const id = await create({
				tourId: v.tourId as Id<"tours">,
				guideId: v.guideId.trim(),
				date: v.date,
				startTime: v.startTime,
				vehicleId: v.vehicleId ? (v.vehicleId as Id<"vehicles">) : undefined,
				driverId: v.driverId ? (v.driverId as Id<"drivers">) : undefined,
				scheduleId: scheduleId
					? (scheduleId as Id<"tourSchedules">)
					: undefined,
			});
			return id;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			if (!v.tourId) errs.tourId = "Please select a tour";
			if (!v.guideId.trim()) errs.guideId = "Please select a guide";
			if (!v.date) errs.date = "Date is required";
			if (!v.startTime) errs.startTime = "Start time is required";
			const selectedTour = ((tours ?? []) as Tour[]).find(
				(t) => t._id === v.tourId,
			);
			if (selectedTour) {
				const rules = resolveTourStaffing({
					tourType: selectedTour.tourType ?? "walking",
					requiredGuides: selectedTour.requiredGuides,
					requiresVehicle: selectedTour.requiresVehicle,
					requiresDriver: selectedTour.requiresDriver,
					requiredVehicleType: selectedTour.requiredVehicleType,
				});
				if (rules.requiresVehicle && !v.vehicleId) {
					errs.vehicleId = "This tour requires a vehicle";
				}
				if (rules.requiresDriver && !v.driverId) {
					errs.driverId = "This tour requires a driver";
				}
			}
			return Object.keys(errs).length > 0 ? errs : null;
		},
		initialValues: { ...INITIAL, date: searchDate ?? "" },
		redirectTo: (id) => `/dashboard/assignments/${id}`,
		successMessage: "Assignment created",
	});

	// Prefill from ?scheduleId=
	useEffect(() => {
		if (!prefillSchedule) return;
		setScheduleId(String(prefillSchedule._id));
		form.set("tourId", String(prefillSchedule.tourId));
		form.set("date", prefillSchedule.date);
		form.set("startTime", prefillSchedule.startTime);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot prefill
	}, [prefillSchedule, form.set]);

	// Check conflicts when date/time/guide/vehicle/driver change.
	const tour = ((tours ?? []) as Tour[]).find(
		(t) => t._id === form.values.tourId,
	);
	const staffing = tour
		? resolveTourStaffing({
				tourType: tour.tourType ?? "walking",
				requiredGuides: tour.requiredGuides,
				requiresVehicle: tour.requiresVehicle,
				requiresDriver: tour.requiresDriver,
				requiredVehicleType: tour.requiredVehicleType,
			})
		: null;
	const eligibleVehicles = ((vehicles ?? []) as Vehicle[]).filter((v) => {
		if (v.status && v.status !== "available") return false;
		if (
			staffing?.requiredVehicleType &&
			v.vehicleType !== staffing.requiredVehicleType
		) {
			return false;
		}
		return true;
	});
	const eligibleDrivers = ((drivers ?? []) as Driver[]).filter(
		(d) => d.isActive !== false,
	);
	const hasConflictData =
		form.values.date && form.values.startTime && tour?.durationHours;

	return (
		<EntityFormPage
			form={form}
			title="New assignment"
			description={
				scheduleId
					? "Assign a guide to this published schedule slot"
					: "Assign a guide to a tour on a specific date"
			}
			backTo="/dashboard/assignments"
			submitLabel="Create assignment"
		>
			{scheduleId ? (
				<p className="text-muted-foreground text-sm -mt-2">
					Linked to schedule · tour/date/time are locked from the slot.
				</p>
			) : null}
			{staffing ? (
				<p className="text-muted-foreground text-xs -mt-1">
					Needs {staffing.requiredGuides} guide
					{staffing.requiredGuides === 1 ? "" : "s"}
					{staffing.requiresVehicle
						? ` · vehicle${staffing.requiredVehicleType ? ` (${staffing.requiredVehicleType})` : ""}`
						: ""}
					{staffing.requiresDriver ? " · driver" : ""}
				</p>
			) : null}
			<FormField label="Tour *" htmlFor="tour" error={form.fieldErrors.tourId}>
				<Select
					value={form.values.tourId}
					onValueChange={(v) => form.set("tourId", v)}
					disabled={Boolean(scheduleId)}
				>
					<SelectTrigger id="tour">
						<SelectValue placeholder="Select a tour…" />
					</SelectTrigger>
					<SelectContent>
						{(tours as Tour[] | undefined)?.map((t) => (
							<SelectItem key={t._id} value={t._id}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FormField>

			<FormField
				label="Guide *"
				hint="Members with guide, owner, or admin role"
				htmlFor="guide"
				error={form.fieldErrors.guideId}
			>
				<MemberSelect
					id="guide"
					value={form.values.guideId}
					onValueChange={(v) => form.set("guideId", v)}
					roles={["guide", "owner", "admin"]}
					placeholder="Select a guide…"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Date *" htmlFor="date" error={form.fieldErrors.date}>
					<Input
						id="date"
						type="date"
						required
						disabled={Boolean(scheduleId)}
						value={form.values.date}
						onChange={(e) => form.set("date", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Start time *"
					htmlFor="start"
					error={form.fieldErrors.startTime}
				>
					<Input
						id="start"
						type="time"
						required
						disabled={Boolean(scheduleId)}
						value={form.values.startTime}
						onChange={(e) => form.set("startTime", e.target.value)}
					/>
				</FormField>
			</div>

			{hasConflictData && tour && (
				<ConflictChecker
					date={form.values.date}
					startTime={form.values.startTime}
					endTime={addHours(form.values.startTime, tour.durationHours)}
					guideId={form.values.guideId.trim() || undefined}
					vehicleId={
						form.values.vehicleId
							? (form.values.vehicleId as Id<"vehicles">)
							: undefined
					}
					driverId={
						form.values.driverId
							? (form.values.driverId as Id<"drivers">)
							: undefined
					}
					onConflictsChange={setConflicts}
				/>
			)}

			<div className="grid gap-4 md:grid-cols-2">
				<FormField
					label={staffing?.requiresVehicle ? "Vehicle *" : "Vehicle (optional)"}
					htmlFor="vehicle"
					error={form.fieldErrors.vehicleId}
				>
					<Select
						value={form.values.vehicleId || "__none__"}
						onValueChange={(v) =>
							form.set("vehicleId", v === "__none__" ? "" : v)
						}
					>
						<SelectTrigger id="vehicle">
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
									{v.capacity != null ? ` (${v.capacity} seats)` : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
				<FormField
					label={staffing?.requiresDriver ? "Driver *" : "Driver (optional)"}
					htmlFor="driver"
					error={form.fieldErrors.driverId}
				>
					<Select
						value={form.values.driverId || "__none__"}
						onValueChange={(v) =>
							form.set("driverId", v === "__none__" ? "" : v)
						}
					>
						<SelectTrigger id="driver">
							<SelectValue placeholder="None" />
						</SelectTrigger>
						<SelectContent>
							{!staffing?.requiresDriver && (
								<SelectItem value="__none__">None</SelectItem>
							)}
							{eligibleDrivers.map((d) => (
								<SelectItem key={d._id} value={d._id}>
									{memberName(d.userId)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
			</div>
		</EntityFormPage>
	);
}

function ConflictChecker({
	date,
	startTime,
	endTime,
	guideId,
	vehicleId,
	driverId,
	onConflictsChange,
}: {
	date: string;
	startTime: string;
	endTime: string;
	guideId?: string;
	vehicleId?: Id<"vehicles">;
	driverId?: Id<"drivers">;
	onConflictsChange: (conflicts: string[]) => void;
}) {
	const { data: conflicts } = useQuery(
		convexQuery(
			api.assignments.checkConflicts,
			date && startTime && endTime
				? {
						date,
						startTime,
						endTime,
						guideId: guideId || undefined,
						vehicleId,
						driverId,
					}
				: "skip",
		),
	);

	const conflictList = (conflicts ?? []) as Array<{
		conflictType: "guide" | "vehicle" | "driver";
		assignmentId: string;
		tourName: string;
		message: string;
	}>;
	const messages = conflictList.map((c) => c.message);

	const prevRef = useRef<string>("");
	const key = JSON.stringify(messages);
	if (key !== prevRef.current) {
		prevRef.current = key;
		queueMicrotask(() => onConflictsChange(messages));
	}

	if (conflictList.length === 0) return null;

	return (
		<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
			<p className="font-medium">Scheduling conflicts detected:</p>
			<ul className="mt-1 list-disc pl-5">
				{conflictList.map((c) => (
					<li key={c.assignmentId}>{c.message}</li>
				))}
			</ul>
		</div>
	);
}
