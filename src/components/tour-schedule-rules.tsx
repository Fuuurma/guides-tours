import { convexQuery } from "@convex-dev/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { DetailSection } from "@/components/detail-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	validateName,
	validatePositiveInteger,
} from "@/lib/validation";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EXCEPTION_TYPES = ["added", "removed", "modified"] as const;

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

function SectionEmpty({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<Empty className="gap-2 border border-dashed p-4 md:p-4">
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

export function TourScheduleRulesSection({ tourId }: { tourId: Id<"tours"> }) {
	const { data: seasonals } = useQuery(
		convexQuery(api.tourSeasonalSchedules.list, { tourId }),
	);
	const { data: exceptions } = useQuery(
		convexQuery(api.tourExceptionDates.list, { tourId }),
	);
	const { data: blackouts } = useQuery(
		convexQuery(api.tourBlackoutDates.list, { tourId }),
	);

	const createSeasonal = useMutation(api.tourSeasonalSchedules.create);
	const removeSeasonal = useMutation(api.tourSeasonalSchedules.remove);
	const generate = useMutation(api.tourSeasonalSchedules.generate);
	const createException = useMutation(api.tourExceptionDates.create);
	const removeException = useMutation(api.tourExceptionDates.remove);
	const createBlackout = useMutation(api.tourBlackoutDates.create);
	const removeBlackout = useMutation(api.tourBlackoutDates.remove);

	const [pendingSeasonalId, setPendingSeasonalId] = useState<string | null>(
		null,
	);
	const [pendingExceptionId, setPendingExceptionId] = useState<string | null>(
		null,
	);
	const [pendingBlackoutId, setPendingBlackoutId] = useState<string | null>(
		null,
	);

	return (
		<>
			<DetailSection
				title="Seasonal schedules"
				description="Recurring rules that generate concrete schedules"
				actions={
					<div className="flex gap-2">
						<GenerateDialog
							onGenerate={async (dateFrom, dateTo) => {
								const result = await generate({
									tourId,
									dateFrom,
									dateTo,
								});
								toast.success(
									`Created ${result.created}, skipped ${result.skipped}`,
								);
							}}
						/>
						<SeasonalDialog
							tourId={tourId}
							onCreate={async (args) => {
								await createSeasonal(args);
								toast.success("Seasonal rule created");
							}}
						/>
					</div>
				}
			>
				{(seasonals?.length ?? 0) === 0 ? (
					<SectionEmpty
						title="No seasonal rules"
						description="Add a weekday pattern, then generate schedules for a date window."
					/>
				) : (
					<ul className="flex flex-col gap-2">
						{(seasonals ?? []).map((s) => (
							<li
								key={s._id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
							>
								<div className="text-sm">
									<p className="font-medium">{s.name}</p>
									<p className="text-muted-foreground">
										{s.startDate} → {s.endDate} ·{" "}
										{s.daysOfWeek.map((d) => DOW_LABELS[d]).join(", ")}
										{s.startTime ? ` · ${s.startTime}` : ""}
										{s.capacityOverride ? ` · cap ${s.capacityOverride}` : ""}
									</p>
								</div>
								<div className="flex items-center gap-2">
									{s.isActive ? null : (
										<Badge variant="secondary">Inactive</Badge>
									)}
									<Button
										type="button"
										size="sm"
										variant="destructive"
										disabled={pendingSeasonalId === s._id}
										onClick={async () => {
											setPendingSeasonalId(s._id);
											try {
												await removeSeasonal({ scheduleId: s._id });
												toast.success("Rule deleted");
											} catch (err) {
												toast.error(getErrorMessage(err));
											} finally {
												setPendingSeasonalId(null);
											}
										}}
									>
										{pendingSeasonalId === s._id ? (
											<Spinner data-icon="inline-start" />
										) : null}
										Delete
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection
				title="Exception dates"
				description="One-off added, removed, or modified dates"
				actions={
					<ExceptionDialog
						tourId={tourId}
						onCreate={async (args) => {
							await createException(args);
							toast.success("Exception created");
						}}
					/>
				}
			>
				{(exceptions?.length ?? 0) === 0 ? (
					<SectionEmpty
						title="No exceptions"
						description="Override a single date without rewriting the seasonal rule."
					/>
				) : (
					<ul className="flex flex-col gap-2">
						{(exceptions ?? []).map((e) => (
							<li
								key={e._id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
							>
								<div className="text-sm">
									<p className="font-medium">
										{e.date} ·{" "}
										<Badge variant="secondary">{e.exceptionType}</Badge>
									</p>
									<p className="text-muted-foreground">
										{[e.startTime, e.endTime].filter(Boolean).join("–") ||
											e.reason ||
											"—"}
									</p>
								</div>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									disabled={pendingExceptionId === e._id}
									onClick={async () => {
										setPendingExceptionId(e._id);
										try {
											await removeException({ exceptionId: e._id });
											toast.success("Exception deleted");
										} catch (err) {
											toast.error(getErrorMessage(err));
										} finally {
											setPendingExceptionId(null);
										}
									}}
								>
									{pendingExceptionId === e._id ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Delete
								</Button>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection
				title="Blackout dates"
				description="Date ranges when this tour cannot run"
				actions={
					<BlackoutDialog
						tourId={tourId}
						onCreate={async (args) => {
							await createBlackout(args);
							toast.success("Blackout created");
						}}
					/>
				}
			>
				{(blackouts?.length ?? 0) === 0 ? (
					<SectionEmpty
						title="No blackouts"
						description="Block a range when this tour cannot run — public booking follows the same rule."
					/>
				) : (
					<ul className="flex flex-col gap-2">
						{(blackouts ?? []).map((b) => (
							<li
								key={b._id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
							>
								<div className="text-sm">
									<p className="font-medium">
										{b.startDate} → {b.endDate}
									</p>
									{b.reason ? (
										<p className="text-muted-foreground">{b.reason}</p>
									) : null}
								</div>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									disabled={pendingBlackoutId === b._id}
									onClick={async () => {
										setPendingBlackoutId(b._id);
										try {
											await removeBlackout({ blackoutId: b._id });
											toast.success("Blackout deleted");
										} catch (err) {
											toast.error(getErrorMessage(err));
										} finally {
											setPendingBlackoutId(null);
										}
									}}
								>
									{pendingBlackoutId === b._id ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Delete
								</Button>
							</li>
						))}
					</ul>
				)}
			</DetailSection>
		</>
	);
}

function GenerateDialog({
	onGenerate,
}: {
	onGenerate: (dateFrom: string, dateTo: string) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { dateFrom: "", dateTo: "" },
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			if (!value.dateFrom) {
				form.setFieldMeta("dateFrom", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: "From date is required" },
				}));
				return;
			}
			if (!value.dateTo) {
				form.setFieldMeta("dateTo", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: "To date is required" },
				}));
				return;
			}
			if (value.dateTo < value.dateFrom) {
				form.setFieldMeta("dateTo", (prev) => ({
					...prev,
					errorMap: {
						...prev.errorMap,
						onSubmit: "To must be on or after From",
					},
				}));
				return;
			}
			try {
				await onGenerate(value.dateFrom, value.dateTo);
				form.reset();
				setOpen(false);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					form.reset();
					setSubmitErr(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" size="sm" variant="outline">
					Generate schedules
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>Generate schedules</DialogTitle>
						<DialogDescription>
							Create concrete schedule rows from seasonal rules, exceptions, and
							blackouts.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4 py-4">
						<form.Field name="dateFrom">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="gen-from">From</FieldLabel>
									<Input
										id="gen-from"
										type="date"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						<form.Field name="dateTo">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="gen-to">To</FieldLabel>
									<Input
										id="gen-to"
										type="date"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						{submitErr ? <ErrorBanner message={submitErr} /> : null}
					</FieldGroup>
					<DialogFooter>
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Generating…" : "Generate"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function SeasonalDialog({
	tourId,
	onCreate,
}: {
	tourId: Id<"tours">;
	onCreate: (args: {
		tourId: Id<"tours">;
		name: string;
		startDate: string;
		endDate: string;
		daysOfWeek: number[];
		startTime?: string;
		capacityOverride?: number;
	}) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			name: "",
			startDate: "",
			endDate: "",
			startTime: "09:00",
			daysOfWeek: [1, 2, 3, 4, 5] as number[],
			capacity: "",
		},
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (
				name: "name" | "startDate" | "endDate" | "daysOfWeek" | "capacity",
				message: string,
			) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};
			const nameErr = validateName(value.name);
			if (nameErr) fail("name", nameErr);
			if (!value.startDate) fail("startDate", "Start date is required");
			if (!value.endDate) fail("endDate", "End date is required");
			if (value.startDate && value.endDate && value.endDate < value.startDate) {
				fail("endDate", "End must be on or after start");
			}
			if (value.daysOfWeek.length === 0) {
				fail("daysOfWeek", "Pick at least one weekday");
			}
			if (value.capacity.trim()) {
				const capErr = validatePositiveInteger(
					value.capacity,
					"Capacity override",
				);
				if (capErr) fail("capacity", capErr);
			}
			if (invalid) return;
			try {
				await onCreate({
					tourId,
					name: value.name.trim(),
					startDate: value.startDate,
					endDate: value.endDate,
					daysOfWeek: value.daysOfWeek,
					startTime: value.startTime || undefined,
					capacityOverride: value.capacity.trim()
						? Number.parseInt(value.capacity, 10)
						: undefined,
				});
				form.reset();
				setOpen(false);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					form.reset();
					setSubmitErr(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" size="sm">
					+ Rule
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>New seasonal rule</DialogTitle>
						<DialogDescription>
							Weekday pattern used when generating schedules for a date window.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4 py-4">
						<form.Field name="name">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="s-name">Name *</FieldLabel>
									<Input
										id="s-name"
										maxLength={MAX_NAME_LEN}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<form.Field name="startDate">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="s-start">Start *</FieldLabel>
										<Input
											id="s-start"
											type="date"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>
							<form.Field name="endDate">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="s-end">End *</FieldLabel>
										<Input
											id="s-end"
											type="date"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>
						</FieldGroup>
						<form.Field name="startTime">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="s-time">Start time</FieldLabel>
									<Input
										id="s-time"
										type="time"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="daysOfWeek">
							{(field) => (
								<FieldSet data-invalid={!field.state.meta.isValid}>
									<FieldLegend>Days</FieldLegend>
									<ToggleGroup
										type="multiple"
										variant="outline"
										size="sm"
										value={field.state.value.map(String)}
										onValueChange={(v) =>
											field.handleChange(v.map(Number).sort((a, b) => a - b))
										}
										className="flex-wrap"
									>
										{DOW_LABELS.map((label, i) => (
											<ToggleGroupItem
												key={label}
												id={`schedule-dow-${i}`}
												value={String(i)}
											>
												{label}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</FieldSet>
							)}
						</form.Field>
						<form.Field name="capacity">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="s-cap">Capacity override</FieldLabel>
									<Input
										id="s-cap"
										type="number"
										min={1}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Optional"
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldDescription>
										Leave empty to use the tour capacity.
									</FieldDescription>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						{submitErr ? <ErrorBanner message={submitErr} /> : null}
					</FieldGroup>
					<DialogFooter>
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Saving…" : "Create"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ExceptionDialog({
	tourId,
	onCreate,
}: {
	tourId: Id<"tours">;
	onCreate: (args: {
		tourId: Id<"tours">;
		date: string;
		exceptionType: "added" | "removed" | "modified";
		startTime?: string;
		endTime?: string;
		reason?: string;
	}) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			date: "",
			exceptionType: "removed" as "added" | "removed" | "modified",
			startTime: "09:00",
			endTime: "11:00",
			reason: "",
		},
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (
				name: "date" | "startTime" | "endTime" | "reason",
				message: string,
			) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};
			if (!value.date) fail("date", "Date is required");
			if (value.exceptionType !== "removed") {
				if (!value.startTime) fail("startTime", "Start time is required");
				if (!value.endTime) fail("endTime", "End time is required");
				if (
					value.startTime &&
					value.endTime &&
					value.endTime < value.startTime
				) {
					fail("endTime", "End must be on or after start");
				}
			}
			if (value.reason.length > MAX_NOTES_LEN) {
				fail("reason", `Reason is too long (max ${MAX_NOTES_LEN} characters)`);
			}
			if (invalid) return;
			try {
				await onCreate({
					tourId,
					date: value.date,
					exceptionType: value.exceptionType,
					startTime:
						value.exceptionType === "removed"
							? undefined
							: value.startTime || undefined,
					endTime:
						value.exceptionType === "removed"
							? undefined
							: value.endTime || undefined,
					reason: value.reason.trim() || undefined,
				});
				form.reset();
				setOpen(false);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	const exceptionType = useStore(form.store, (s) => s.values.exceptionType);
	const showTimes = exceptionType === "added" || exceptionType === "modified";

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					form.reset();
					setSubmitErr(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" size="sm">
					+ Exception
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>New exception</DialogTitle>
						<DialogDescription>
							Override one date without changing the seasonal rule.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4 py-4">
						<form.Field name="date">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="e-date">Date *</FieldLabel>
									<Input
										id="e-date"
										type="date"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						<form.Field name="exceptionType">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="e-type">Type *</FieldLabel>
									<ToggleGroup
										id="e-type"
										type="single"
										variant="outline"
										size="sm"
										value={field.state.value}
										onValueChange={(v) => {
											if (
												v === "added" ||
												v === "removed" ||
												v === "modified"
											) {
												field.handleChange(v);
											}
										}}
									>
										{EXCEPTION_TYPES.map((t) => (
											<ToggleGroupItem key={t} value={t}>
												{t}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
								</Field>
							)}
						</form.Field>
						{showTimes ? (
							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="startTime">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="e-start">Start time</FieldLabel>
											<Input
												id="e-start"
												type="time"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="endTime">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="e-end">End time</FieldLabel>
											<Input
												id="e-end"
												type="time"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>
						) : null}
						<form.Field name="reason">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="e-reason">Reason</FieldLabel>
									<Input
										id="e-reason"
										maxLength={MAX_NOTES_LEN}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						{submitErr ? <ErrorBanner message={submitErr} /> : null}
					</FieldGroup>
					<DialogFooter>
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Saving…" : "Create"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function BlackoutDialog({
	tourId,
	onCreate,
}: {
	tourId: Id<"tours">;
	onCreate: (args: {
		tourId: Id<"tours">;
		startDate: string;
		endDate: string;
		reason?: string;
	}) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { startDate: "", endDate: "", reason: "" },
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (
				name: "startDate" | "endDate" | "reason",
				message: string,
			) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};
			if (!value.startDate) fail("startDate", "Start date is required");
			if (!value.endDate) fail("endDate", "End date is required");
			if (value.startDate && value.endDate && value.endDate < value.startDate) {
				fail("endDate", "End must be on or after start");
			}
			if (value.reason.length > MAX_NOTES_LEN) {
				fail("reason", `Reason is too long (max ${MAX_NOTES_LEN} characters)`);
			}
			if (invalid) return;
			try {
				await onCreate({
					tourId,
					startDate: value.startDate,
					endDate: value.endDate,
					reason: value.reason.trim() || undefined,
				});
				form.reset();
				setOpen(false);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					form.reset();
					setSubmitErr(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" size="sm">
					+ Blackout
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>New blackout</DialogTitle>
						<DialogDescription>
							Blocks public booking and walk-up on these dates.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4 py-4">
						<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<form.Field name="startDate">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="b-start">Start *</FieldLabel>
										<Input
											id="b-start"
											type="date"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>
							<form.Field name="endDate">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="b-end">End *</FieldLabel>
										<Input
											id="b-end"
											type="date"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>
						</FieldGroup>
						<form.Field name="reason">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="b-reason">Reason</FieldLabel>
									<Input
										id="b-reason"
										maxLength={MAX_NOTES_LEN}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						{submitErr ? <ErrorBanner message={submitErr} /> : null}
					</FieldGroup>
					<DialogFooter>
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Saving…" : "Create"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
