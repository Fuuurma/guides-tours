import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useState } from "react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { addHours } from "@/lib/time";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

interface Tour {
	_id: string;
	name: string;
	durationHours: number;
}
interface Vehicle {
	_id: string;
	name: string;
}
interface Driver {
	_id: string;
	userId: string;
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
	const create = useMutation(api.assignments.create);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: vehicles } = useQuery(convexQuery(api.vehicles.list, {}));
	const { data: drivers } = useQuery(convexQuery(api.drivers.list, {}));
	const [conflicts, setConflicts] = useState<string[]>([]);

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
			});
			return id;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			if (!v.tourId) errs.tourId = "Please select a tour";
			if (!v.guideId.trim()) errs.guideId = "Guide user ID is required";
			if (!v.date) errs.date = "Date is required";
			if (!v.startTime) errs.startTime = "Start time is required";
			return Object.keys(errs).length > 0 ? errs : null;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/assignments/${id}`,
		successMessage: "Assignment created",
	});

	// Check conflicts when date/time/guide/vehicle/driver change.
	const tour = ((tours ?? []) as Tour[]).find(
		(t) => t._id === form.values.tourId,
	);
	const hasConflictData =
		form.values.date && form.values.startTime && tour?.durationHours;

	return (
		<EntityFormPage
			form={form}
			title="New assignment"
			description="Assign a guide to a tour on a specific date"
			backTo="/dashboard/assignments"
			submitLabel="Create assignment"
		>
			<FormField label="Tour *" htmlFor="tour" error={form.fieldErrors.tourId}>
				<Select
					value={form.values.tourId}
					onValueChange={(v) => form.set("tourId", v)}
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
				label="Guide user ID *"
				hint="Better Auth user ID of the guide (must have 'guide' role)"
				htmlFor="guide"
				error={form.fieldErrors.guideId}
			>
				<Input
					id="guide"
					required
					maxLength={200}
					value={form.values.guideId}
					onChange={(e) => form.set("guideId", e.target.value)}
					placeholder="user_abc123"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Date *" htmlFor="date" error={form.fieldErrors.date}>
					<Input
						id="date"
						type="date"
						required
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
				<FormField label="Vehicle (optional)" htmlFor="vehicle">
					<Select
						value={form.values.vehicleId}
						onValueChange={(v) => form.set("vehicleId", v)}
					>
						<SelectTrigger id="vehicle">
							<SelectValue placeholder="None" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">None</SelectItem>
							{(vehicles as Vehicle[] | undefined)?.map((v) => (
								<SelectItem key={v._id} value={v._id}>
									{v.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
				<FormField label="Driver (optional)" htmlFor="driver">
					<Select
						value={form.values.driverId}
						onValueChange={(v) => form.set("driverId", v)}
					>
						<SelectTrigger id="driver">
							<SelectValue placeholder="None" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">None</SelectItem>
							{(drivers as Driver[] | undefined)?.map((d) => (
								<SelectItem key={d._id} value={d._id}>
									{d.userId}
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
				: { date: "", startTime: "", endTime: "" },
		),
	);

	const conflictList = (conflicts ?? []) as Array<{
		conflictType: "guide" | "vehicle" | "driver";
		assignmentId: string;
		tourName: string;
		message: string;
	}>;
	const messages = conflictList.map((c) => c.message);

	const prevRef = React.useRef<string>("");
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

// Need React import for useRef.
import React from "react";
