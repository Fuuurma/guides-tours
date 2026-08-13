import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn, getErrorMessage } from "@/lib/utils";
import { MAX_PHONE_LEN, validatePhoneOptional } from "@/lib/validation";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/guides/$userId")({
	component: GuideDetailPage,
});

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function GuideDetailPage() {
	const { userId } = Route.useParams();
	const [monthCursor, setMonthCursor] = useState(() =>
		startOfMonth(new Date()),
	);

	const monthStart = isoDate(monthCursor);
	const monthEnd = isoDate(
		new Date(
			Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 0),
		),
	);

	const { data: members, isPending: membersPending } = useQuery(
		convexQuery(api.organizations.listMembers, {}),
	);
	const { data: contact } = useQuery(
		convexQuery(api.userProfiles.getContact, { userId }),
	);
	const { data: availabilities, isPending: availPending } = useQuery(
		convexQuery(api.availabilities.list, {
			userId,
			dateFrom: monthStart,
			dateTo: monthEnd,
		}),
	);
	const { data: assignments } = useQuery(
		convexQuery(api.assignments.list, {
			guideId: userId,
			dateFrom: monthStart,
			dateTo: monthEnd,
		}),
	);
	const { data: vacations } = useQuery(
		convexQuery(api.vacationRequests.list, {}),
	);

	const upsert = useMutation(api.availabilities.upsert);
	const removeAvail = useMutation(api.availabilities.remove);
	const [pendingDate, setPendingDate] = useState<string | null>(null);

	const member = (members ?? []).find((m) => m.userId === userId);
	const availByDate = useMemo(() => {
		const map = new Map<string, { _id: string; isAvailable: boolean }>();
		for (const a of availabilities ?? []) {
			map.set(a.date, { _id: a._id, isAvailable: a.isAvailable });
		}
		return map;
	}, [availabilities]);

	const guideVacations = (vacations ?? []).filter((v) => v.userId === userId);

	const year = monthCursor.getUTCFullYear();
	const month = monthCursor.getUTCMonth();
	const totalDays = daysInMonth(year, month);
	const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();

	const toggleDay = async (date: string) => {
		setPendingDate(date);
		try {
			const existing = availByDate.get(date);
			if (!existing) {
				await upsert({
					userIdTarget: userId,
					date,
					isAvailable: false,
				});
				toast.success("Marked unavailable");
			} else if (existing.isAvailable === false) {
				await removeAvail({
					availabilityId: existing._id as never,
				});
				toast.success("Cleared availability override");
			} else {
				await upsert({
					userIdTarget: userId,
					date,
					isAvailable: false,
				});
				toast.success("Marked unavailable");
			}
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingDate(null);
		}
	};

	if (membersPending) return <DetailSkeleton />;
	if (!member) {
		return <DetailPage title="Guide not found" backTo="/dashboard/guides" />;
	}

	const monthLabel = monthCursor.toLocaleString("en-US", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

	return (
		<DetailPage
			title={member.name}
			subtitle={`${member.email || "No email"} · ${member.role}`}
			backTo="/dashboard/guides"
		>
			<div className="grid gap-4 md:grid-cols-3">
				<MetricCard label="Role" value={member.role} />
				<MetricCard label="Email" value={member.email || "—"} />
				<MetricCard
					label="Assignments this month"
					value={assignments?.length ?? 0}
				/>
			</div>

			<DetailSection
				title="Contact"
				description="Phone is used for assignment and availability SMS when Twilio is enabled."
			>
				<GuidePhoneForm userId={userId} phone={contact?.phone ?? ""} />
			</DetailSection>

			<DetailSection
				title="Availability"
				description="Click a day to mark unavailable (or clear). Empty days mean available by default."
				actions={
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setMonthCursor((m) => addMonths(m, -1))}
						>
							Prev
						</Button>
						<span className="min-w-[9rem] text-center text-sm font-medium">
							{monthLabel}
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setMonthCursor((m) => addMonths(m, 1))}
						>
							Next
						</Button>
					</div>
				}
			>
				{availPending ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : (
					<div className="grid grid-cols-7 gap-1">
						{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
							<div
								key={d}
								className="text-muted-foreground py-1 text-center text-xs font-medium"
							>
								{d}
							</div>
						))}
						{[...Array(firstDow).keys()].map((pad) => (
							<div key={`empty-${year}-${month}-before-${pad}`} />
						))}
						{Array.from({ length: totalDays }).map((_, i) => {
							const day = i + 1;
							const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
							const avail = availByDate.get(date);
							const unavailable = avail?.isAvailable === false;
							const busy = pendingDate === date;
							return (
								<button
									key={date}
									type="button"
									disabled={busy}
									onClick={() => void toggleDay(date)}
									className={cn(
										"aspect-square rounded-md border text-sm transition-colors",
										unavailable
											? "bg-destructive/15 border-destructive/40 text-destructive"
											: "bg-background hover:bg-muted",
									)}
									title={
										unavailable
											? "Unavailable — click to clear"
											: "Available — click to mark unavailable"
									}
								>
									{day}
								</button>
							);
						})}
					</div>
				)}
				<div className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
					<span className="flex items-center gap-1">
						<span className="bg-background size-3 rounded-sm border" /> Default
						available
					</span>
					<span className="flex items-center gap-1">
						<span className="bg-destructive/15 border-destructive/40 size-3 rounded-sm border" />{" "}
						Unavailable
					</span>
				</div>
			</DetailSection>

			<DetailSection
				title="Assignments this month"
				description="Scheduled work for this guide"
			>
				{(assignments ?? []).length === 0 ? (
					<p className="text-muted-foreground text-sm">No assignments.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{(assignments ?? []).map((a) => (
							<li
								key={a._id}
								className="flex items-center justify-between gap-2"
							>
								<Link
									to="/dashboard/assignments/$assignmentId"
									params={{ assignmentId: a._id }}
									className="text-link hover:underline text-sm"
								>
									{a.date} · {a.startTime}
								</Link>
								<StatusBadge status={a.status} />
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection title="Vacation requests">
				{guideVacations.length === 0 ? (
					<p className="text-muted-foreground text-sm">No vacation requests.</p>
				) : (
					<ul className="flex flex-col gap-2">
						{guideVacations.map((v) => (
							<li
								key={v._id}
								className="flex items-center justify-between gap-2"
							>
								<Link
									to="/dashboard/vacations/$vacationId"
									params={{ vacationId: v._id }}
									className="text-link hover:underline text-sm"
								>
									{v.startDate} → {v.endDate}
								</Link>
								<Badge variant="secondary">{v.status}</Badge>
							</li>
						))}
					</ul>
				)}
			</DetailSection>
		</DetailPage>
	);
}

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

function GuidePhoneForm({ userId, phone }: { userId: string; phone: string }) {
	const updatePhone = useMutation(api.userProfiles.updatePhone);
	const form = useForm({
		defaultValues: { phone },
		onSubmit: async ({ value }) => {
			const err = validatePhoneOptional(value.phone);
			if (err) {
				form.setFieldMeta("phone", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: err },
				}));
				return;
			}
			try {
				await updatePhone({ userId, phone: value.phone.trim() });
				toast.success("Phone updated");
			} catch (e) {
				toast.error(getErrorMessage(e));
			}
		},
	});

	useEffect(() => {
		form.reset({ phone });
	}, [form.reset, phone]);

	return (
		<form
			className="max-w-md"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="flex flex-col gap-3 sm:flex-row sm:items-end">
				<form.Field name="phone">
					{(field) => (
						<Field className="flex-1" data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="guide-phone">Phone</FieldLabel>
							<Input
								id="guide-phone"
								type="tel"
								placeholder="+1 555 0100"
								maxLength={MAX_PHONE_LEN}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								autoComplete="tel"
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) =>
						[state.canSubmit, state.isSubmitting, state.values.phone] as const
					}
				>
					{([canSubmit, isSubmitting, draft]) => (
						<Button
							type="submit"
							disabled={
								!canSubmit || isSubmitting || draft.trim() === phone.trim()
							}
						>
							{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
							{isSubmitting ? "Saving…" : "Save"}
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}
