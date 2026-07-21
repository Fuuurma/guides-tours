import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { FormField } from "@/components/form";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { cn, getErrorMessage } from "@/lib/utils";
import { validatePhoneOptional } from "@/lib/validation";
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
	const updatePhone = useMutation(api.userProfiles.updatePhone);
	const [pendingDate, setPendingDate] = useState<string | null>(null);
	const [phoneDraft, setPhoneDraft] = useState("");
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [phoneSaving, setPhoneSaving] = useState(false);

	useEffect(() => {
		if (contact) setPhoneDraft(contact.phone);
	}, [contact]);

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

	const savePhone = async () => {
		const err = validatePhoneOptional(phoneDraft);
		if (err) {
			setPhoneError(err);
			return;
		}
		setPhoneError(null);
		setPhoneSaving(true);
		try {
			await updatePhone({ userId, phone: phoneDraft.trim() });
			toast.success("Phone updated");
		} catch (e) {
			toast.error(getErrorMessage(e));
		} finally {
			setPhoneSaving(false);
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
				<div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
					<div className="flex-1">
						<FormField
							label="Phone"
							htmlFor="guide-phone"
							error={phoneError ?? undefined}
						>
							<Input
								id="guide-phone"
								type="tel"
								placeholder="+1 555 0100"
								value={phoneDraft}
								onChange={(e) => {
									setPhoneDraft(e.target.value);
									if (phoneError) setPhoneError(null);
								}}
								autoComplete="tel"
							/>
						</FormField>
					</div>
					<Button
						type="button"
						onClick={() => void savePhone()}
						disabled={
							phoneSaving || phoneDraft.trim() === (contact?.phone ?? "")
						}
					>
						{phoneSaving ? "Saving…" : "Save"}
					</Button>
				</div>
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
