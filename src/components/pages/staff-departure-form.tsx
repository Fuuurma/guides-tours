import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageBackLink } from "@/components/detail-page";
import { MemberSelect } from "@/components/member-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useOrgMembers } from "@/hooks/use-org-members";
import { resolveTourStaffing } from "@/lib/staffing";
import { addHours } from "@/lib/time";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_NOTES_LEN,
	validateNotesOptional,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Intent = "publish" | "assign";

type Tour = {
	_id: string;
	name: string;
	durationHours: number;
	capacity: number;
	tourType: string;
	requiredGuides?: number;
	requiresVehicle?: boolean;
	requiresDriver?: boolean;
	requiredVehicleType?: string;
};

type Vehicle = {
	_id: string;
	name: string;
	vehicleType?: string;
	capacity?: number;
	status?: string;
};

type Driver = {
	_id: string;
	userId: string;
	isActive?: boolean;
};

type ScheduleLite = {
	_id: string;
	tourId: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityTotal: number;
	status: string;
};

type StaffValues = {
	tourId: string;
	date: string;
	startTime: string;
	endTime: string;
	capacityTotal: string;
	notes: string;
	guideId: string;
	vehicleId: string;
	driverId: string;
	publish: boolean;
	scheduleId: string;
};

function metaErrors(
	errors: ReadonlyArray<unknown>,
): Array<{ message?: string }> {
	return errors.map((err) => {
		if (typeof err === "string") return { message: err };
		if (err && typeof err === "object" && "message" in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === "string") return { message };
		}
		return { message: String(err) };
	});
}

export function StaffDepartureForm({
	intent,
	preselectedTourId,
	searchDate,
	searchScheduleId,
}: {
	intent: Intent;
	preselectedTourId?: string;
	searchDate?: string;
	searchScheduleId?: string;
}) {
	const navigate = useNavigate();
	const staffDeparture = useMutation(api.ops.staffDeparture);
	const { data: tours } = useQuery({
		...convexQuery(api.tours.list, { onlyActive: true }),
		refetchOnMount: "always",
	});
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
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			tourId: "",
			date: searchDate ?? "",
			startTime: "",
			endTime: "",
			capacityTotal: "",
			notes: "",
			guideId: "",
			vehicleId: "",
			driverId: "",
			publish: intent === "assign",
			scheduleId: searchScheduleId ?? "",
		} satisfies StaffValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			const tour = ((tours ?? []) as Tour[]).find(
				(t) => t._id === value.tourId,
			);
			const locked = Boolean(value.scheduleId && searchScheduleId);
			const mustPublish =
				intent === "publish" || (value.publish && !value.scheduleId);
			const assigning = intent === "assign" || Boolean(value.guideId.trim());
			const resolvedEnd =
				value.endTime ||
				(tour && value.startTime
					? addHours(value.startTime, tour.durationHours)
					: "");
			const resolvedCapacity =
				value.capacityTotal || (tour ? String(tour.capacity) : "");

			let invalid = false;
			const fail = (name: keyof StaffValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			if (!value.tourId) fail("tourId", "Please select a tour");
			if (!value.date) fail("date", "Date is required");
			if (!value.startTime) fail("startTime", "Start time is required");
			if (mustPublish) {
				if (!resolvedEnd) fail("endTime", "End time is required");
				if (value.startTime && resolvedEnd && value.startTime >= resolvedEnd) {
					fail("endTime", "End time must be after start time");
				}
				const capErr = validatePositiveInteger(resolvedCapacity, "Capacity");
				if (capErr) fail("capacityTotal", capErr);
				const notesErr = validateNotesOptional(value.notes);
				if (notesErr) fail("notes", notesErr);
			}
			if (intent === "assign" && !value.guideId.trim()) {
				fail("guideId", "Please select a guide");
			}
			if (assigning && tour) {
				const rules = resolveTourStaffing({
					tourType: tour.tourType ?? "walking",
					requiredGuides: tour.requiredGuides,
					requiresVehicle: tour.requiresVehicle,
					requiresDriver: tour.requiresDriver,
					requiredVehicleType: tour.requiredVehicleType,
				});
				if (rules.requiresVehicle && !value.vehicleId) {
					fail("vehicleId", "This tour requires a vehicle");
				}
				if (rules.requiresDriver && !value.driverId) {
					fail("driverId", "This tour requires a driver");
				}
			}
			if (assigning && conflicts.length > 0) {
				setSubmitErr(`Scheduling conflicts detected: ${conflicts.join("; ")}`);
				invalid = true;
			}
			if (invalid) {
				toast.error("Please fix the highlighted fields");
				return;
			}

			try {
				const result = await staffDeparture({
					tourId: value.tourId as Id<"tours">,
					date: value.date,
					startTime: value.startTime,
					endTime: mustPublish ? resolvedEnd : undefined,
					capacityTotal: mustPublish ? Number(resolvedCapacity) : undefined,
					notes: value.notes.trim() || undefined,
					publish: mustPublish,
					guideId: value.guideId.trim() || undefined,
					vehicleId: value.vehicleId
						? (value.vehicleId as Id<"vehicles">)
						: undefined,
					driverId: value.driverId
						? (value.driverId as Id<"drivers">)
						: undefined,
					scheduleId: value.scheduleId
						? (value.scheduleId as Id<"tourSchedules">)
						: undefined,
				});

				if (intent === "publish") {
					if (!result.scheduleId) {
						throw new Error("Departure was not published");
					}
					toast.success(
						result.assignmentId
							? "Departure published and guide assigned"
							: "Schedule created",
					);
					void navigate({
						to: "/dashboard/schedules/$scheduleId",
						params: { scheduleId: result.scheduleId },
					});
					return;
				}

				if (!result.assignmentId) {
					throw new Error("Assignment was not created");
				}
				toast.success(
					result.scheduleId && !locked
						? "Assigned and departure published"
						: "Assignment created",
				);
				void navigate({
					to: "/dashboard/assignments/$assignmentId",
					params: { assignmentId: result.assignmentId },
				});
			} catch (err) {
				const message = getErrorMessage(err);
				setSubmitErr(message);
				toast.error(message);
			}
		},
	});

	const tourId = useStore(form.store, (s) => s.values.tourId);
	const date = useStore(form.store, (s) => s.values.date);
	const startTime = useStore(form.store, (s) => s.values.startTime);
	const endTime = useStore(form.store, (s) => s.values.endTime);
	const guideId = useStore(form.store, (s) => s.values.guideId);
	const vehicleId = useStore(form.store, (s) => s.values.vehicleId);
	const driverId = useStore(form.store, (s) => s.values.driverId);
	const publish = useStore(form.store, (s) => s.values.publish);
	const scheduleId = useStore(form.store, (s) => s.values.scheduleId);

	const locked = Boolean(searchScheduleId && scheduleId);
	const tour = ((tours ?? []) as Tour[]).find((t) => t._id === tourId);
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
	const assigning = intent === "assign" || Boolean(guideId.trim());
	const showPublishFields =
		intent === "publish" || (intent === "assign" && publish && !scheduleId);
	const hasConflictData = Boolean(date && startTime && tour?.durationHours);

	const { data: daySchedules } = useQuery(
		convexQuery(
			api.tourSchedules.list,
			intent === "assign" && tourId && date
				? {
						tourId: tourId as Id<"tours">,
						dateFrom: date,
						dateTo: date,
					}
				: "skip",
		),
	);
	const openSlots = ((daySchedules ?? []) as ScheduleLite[]).filter(
		(s) => s.status !== "cancelled",
	);

	useEffect(() => {
		if (!prefillSchedule) return;
		form.setFieldValue("tourId", String(prefillSchedule.tourId));
		form.setFieldValue("date", prefillSchedule.date);
		form.setFieldValue("startTime", prefillSchedule.startTime);
		form.setFieldValue("endTime", prefillSchedule.endTime);
		form.setFieldValue("capacityTotal", String(prefillSchedule.capacityTotal));
		form.setFieldValue("scheduleId", String(prefillSchedule._id));
		form.setFieldValue("publish", false);
	}, [prefillSchedule, form.setFieldValue]);

	useEffect(() => {
		if (tourId || !preselectedTourId || !tours) return;
		const exists = (tours as Tour[]).some((t) => t._id === preselectedTourId);
		if (exists) form.setFieldValue("tourId", preselectedTourId);
	}, [form.setFieldValue, preselectedTourId, tourId, tours]);

	useEffect(() => {
		if (locked || !tour) return;
		form.setFieldValue("capacityTotal", String(tour.capacity));
	}, [form.setFieldValue, locked, tour]);

	useEffect(() => {
		if (locked || !tour || !startTime) return;
		const nextEnd = addHours(startTime, tour.durationHours);
		if (nextEnd) form.setFieldValue("endTime", nextEnd);
	}, [form.setFieldValue, locked, startTime, tour]);

	useEffect(() => {
		if (locked || intent !== "assign") return;
		const hit = ((daySchedules ?? []) as ScheduleLite[]).find(
			(s) => s.status !== "cancelled" && s.startTime === startTime,
		);
		const nextId = hit ? String(hit._id) : "";
		if (nextId !== scheduleId) form.setFieldValue("scheduleId", nextId);
	}, [daySchedules, form.setFieldValue, intent, locked, scheduleId, startTime]);

	const title = intent === "publish" ? "New tour schedule" : "New assignment";
	const description =
		intent === "publish"
			? "Publish a departure, then optionally assign who runs it."
			: locked
				? "Assign a guide to this published departure."
				: "Assign who runs this slot. We'll publish the departure if it isn't on the calendar yet.";
	const backTo =
		intent === "publish" ? "/dashboard/schedules" : "/dashboard/assignments";
	const submitLabel =
		intent === "publish" ? "Create schedule" : "Create assignment";

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<PageBackLink to={backTo} />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</div>
			<Card>
				<CardContent className="pt-6">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void form.handleSubmit();
						}}
					>
						<FieldGroup className="gap-4">
							{locked ? (
								<Alert>
									<AlertTitle>Linked to a published departure</AlertTitle>
									<AlertDescription>
										Tour, date, and time are locked from the schedule.
									</AlertDescription>
								</Alert>
							) : null}

							{staffing ? (
								<p className="text-xs text-muted-foreground">
									Needs {staffing.requiredGuides} guide
									{staffing.requiredGuides === 1 ? "" : "s"}
									{staffing.requiresVehicle
										? ` · vehicle${staffing.requiredVehicleType ? ` (${staffing.requiredVehicleType})` : ""}`
										: ""}
									{staffing.requiresDriver ? " · driver" : ""}
								</p>
							) : null}

							<form.Field name="tourId">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="tour">Tour *</FieldLabel>
										<Select
											value={field.state.value}
											onValueChange={(v) => field.handleChange(v)}
											disabled={locked}
										>
											<SelectTrigger id="tour">
												<SelectValue placeholder="Select a tour…" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{(tours as Tour[] | undefined)?.map((t) => (
														<SelectItem key={t._id} value={t._id}>
															{t.name}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="date">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="date">Date *</FieldLabel>
											<Input
												id="date"
												type="date"
												required
												disabled={locked}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="startTime">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="start">Start time *</FieldLabel>
											<Input
												id="start"
												type="time"
												required
												disabled={locked}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							{intent === "assign" && !locked && openSlots.length > 0 ? (
								<div className="flex flex-col gap-2">
									<p className="text-sm font-medium">Departures this day</p>
									<ul className="flex flex-col gap-2">
										{openSlots.map((slot) => {
											const selected = scheduleId === slot._id;
											return (
												<li key={slot._id}>
													<Button
														type="button"
														size="sm"
														variant={selected ? "default" : "outline"}
														onClick={() => {
															form.setFieldValue("startTime", slot.startTime);
															form.setFieldValue("endTime", slot.endTime);
															form.setFieldValue(
																"capacityTotal",
																String(slot.capacityTotal),
															);
															form.setFieldValue("scheduleId", slot._id);
															form.setFieldValue("publish", false);
														}}
													>
														{slot.startTime}–{slot.endTime} ·{" "}
														{slot.capacityTotal} seats
														{selected ? " · selected" : ""}
													</Button>
												</li>
											);
										})}
									</ul>
								</div>
							) : null}

							{intent === "assign" && !locked && scheduleId ? (
								<Alert>
									<AlertTitle>This slot is already published</AlertTitle>
									<AlertDescription>
										You&apos;re assigning crew to the existing departure.
									</AlertDescription>
								</Alert>
							) : null}

							{intent === "assign" && !locked && !scheduleId ? (
								<form.Field name="publish">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="publish">
												Also publish this departure
											</FieldLabel>
											<Switch
												id="publish"
												checked={field.state.value}
												onCheckedChange={(checked) =>
													field.handleChange(checked)
												}
											/>
											<FieldDescription>
												Puts it on the calendar so this slot can take bookings.
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							) : null}

							{showPublishFields ? (
								<>
									<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
										<form.Field name="endTime">
											{(field) => (
												<Field data-invalid={!field.state.meta.isValid}>
													<FieldLabel htmlFor="end">End time *</FieldLabel>
													<Input
														id="end"
														type="time"
														required
														disabled={locked}
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
													/>
													<FieldError
														errors={metaErrors(field.state.meta.errors)}
													/>
												</Field>
											)}
										</form.Field>
										<form.Field name="capacityTotal">
											{(field) => (
												<Field data-invalid={!field.state.meta.isValid}>
													<FieldLabel htmlFor="cap">Capacity *</FieldLabel>
													<Input
														id="cap"
														type="number"
														min="1"
														required
														disabled={locked}
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
													/>
													<FieldError
														errors={metaErrors(field.state.meta.errors)}
													/>
												</Field>
											)}
										</form.Field>
									</FieldGroup>
									{intent === "publish" ? (
										<form.Field name="notes">
											{(field) => (
												<Field data-invalid={!field.state.meta.isValid}>
													<FieldLabel htmlFor="notes">Notes</FieldLabel>
													<Textarea
														id="notes"
														rows={3}
														maxLength={MAX_NOTES_LEN}
														placeholder="Optional"
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
													/>
													<FieldError
														errors={metaErrors(field.state.meta.errors)}
													/>
												</Field>
											)}
										</form.Field>
									) : null}
								</>
							) : null}

							<FieldSeparator />

							<FieldSet>
								<FieldLegend>
									{intent === "publish" ? "Crew (optional)" : "Crew"}
								</FieldLegend>
								<FieldDescription>
									{intent === "publish"
										? "Assign a guide now, or publish the departure and staff it later."
										: "Who is running this departure."}
								</FieldDescription>
								<FieldGroup className="gap-4">
									<form.Field name="guideId">
										{(field) => (
											<Field data-invalid={!field.state.meta.isValid}>
												<FieldLabel htmlFor="guide">
													{intent === "assign" ? "Guide *" : "Guide"}
												</FieldLabel>
												<MemberSelect
													id="guide"
													value={field.state.value}
													onValueChange={(v) => field.handleChange(v)}
													roles={["guide", "owner", "admin"]}
													placeholder="Select a guide…"
													allowNone={intent === "publish"}
													noneLabel="Assign later"
												/>
												<FieldDescription>
													Members with guide, owner, or admin role
												</FieldDescription>
												<FieldError
													errors={metaErrors(field.state.meta.errors)}
												/>
											</Field>
										)}
									</form.Field>

									{hasConflictData && tour ? (
										<ConflictChecker
											date={date}
											startTime={startTime}
											endTime={
												endTime || addHours(startTime, tour.durationHours)
											}
											guideId={guideId.trim() || undefined}
											vehicleId={
												vehicleId ? (vehicleId as Id<"vehicles">) : undefined
											}
											driverId={
												driverId ? (driverId as Id<"drivers">) : undefined
											}
											onConflictsChange={setConflicts}
										/>
									) : null}

									{assigning ? (
										<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
											<form.Field name="vehicleId">
												{(field) => (
													<Field data-invalid={!field.state.meta.isValid}>
														<FieldLabel htmlFor="vehicle">
															{staffing?.requiresVehicle
																? "Vehicle *"
																: "Vehicle"}
														</FieldLabel>
														<Select
															value={field.state.value || "__none__"}
															onValueChange={(v) =>
																field.handleChange(v === "__none__" ? "" : v)
															}
														>
															<SelectTrigger id="vehicle">
																<SelectValue placeholder="None" />
															</SelectTrigger>
															<SelectContent>
																<SelectGroup>
																	{!staffing?.requiresVehicle && (
																		<SelectItem value="__none__">
																			None
																		</SelectItem>
																	)}
																	{eligibleVehicles.map((v) => (
																		<SelectItem key={v._id} value={v._id}>
																			{v.name}
																			{v.vehicleType
																				? ` · ${v.vehicleType}`
																				: ""}
																			{v.capacity != null
																				? ` (${v.capacity} seats)`
																				: ""}
																		</SelectItem>
																	))}
																</SelectGroup>
															</SelectContent>
														</Select>
														{staffing?.requiresVehicle &&
														eligibleVehicles.length === 0 ? (
															<FieldDescription>
																No matching vehicles. Add one to the fleet
																first.
															</FieldDescription>
														) : null}
														<FieldError
															errors={metaErrors(field.state.meta.errors)}
														/>
													</Field>
												)}
											</form.Field>
											<form.Field name="driverId">
												{(field) => (
													<Field data-invalid={!field.state.meta.isValid}>
														<FieldLabel htmlFor="driver">
															{staffing?.requiresDriver ? "Driver *" : "Driver"}
														</FieldLabel>
														<Select
															value={field.state.value || "__none__"}
															onValueChange={(v) =>
																field.handleChange(v === "__none__" ? "" : v)
															}
														>
															<SelectTrigger id="driver">
																<SelectValue placeholder="None" />
															</SelectTrigger>
															<SelectContent>
																<SelectGroup>
																	{!staffing?.requiresDriver && (
																		<SelectItem value="__none__">
																			None
																		</SelectItem>
																	)}
																	{eligibleDrivers.map((d) => (
																		<SelectItem key={d._id} value={d._id}>
																			{memberName(d.userId)}
																		</SelectItem>
																	))}
																</SelectGroup>
															</SelectContent>
														</Select>
														<FieldError
															errors={metaErrors(field.state.meta.errors)}
														/>
													</Field>
												)}
											</form.Field>
										</FieldGroup>
									) : null}
								</FieldGroup>
							</FieldSet>

							{submitErr ? <ErrorBanner message={submitErr} /> : null}

							<form.Subscribe
								selector={(state) =>
									[state.canSubmit, state.isSubmitting] as const
								}
							>
								{([canSubmit, isSubmitting]) => (
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" asChild>
											<Link to={backTo}>Back</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : submitLabel}
										</Button>
									</div>
								)}
							</form.Subscribe>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
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

	const conflictList = useMemo(
		() =>
			(conflicts ?? []) as Array<{
				conflictType: "guide" | "vehicle" | "driver";
				assignmentId: string;
				tourName: string;
				message: string;
			}>,
		[conflicts],
	);
	const messages = useMemo(
		() => conflictList.map((conflict) => conflict.message),
		[conflictList],
	);

	useEffect(() => {
		onConflictsChange(messages);
	}, [messages, onConflictsChange]);

	useEffect(
		() => () => {
			onConflictsChange([]);
		},
		[onConflictsChange],
	);

	if (conflictList.length === 0) return null;

	return (
		<Alert variant="destructive">
			<AlertTitle>Scheduling conflicts</AlertTitle>
			<AlertDescription>
				<ul className="list-disc pl-4">
					{conflictList.map((c) => (
						<li key={c.assignmentId}>{c.message}</li>
					))}
				</ul>
			</AlertDescription>
		</Alert>
	);
}
