import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

interface Tour {
	_id: string;
	name: string;
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

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
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
