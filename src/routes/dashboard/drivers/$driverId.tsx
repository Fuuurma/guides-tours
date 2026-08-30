import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useOrgMembers } from "@/hooks/use-org-members";
import { localYmd } from "@/lib/calendar-date";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import {
	MAX_LICENSE_LEN,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
	validateNotesOptional,
	validatePhoneOptional,
} from "@/lib/validation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/drivers/$driverId")({
	component: DriverDetailPage,
});

function DriverDetailPage() {
	const { driverId } = Route.useParams();
	const {
		data: driver,
		isPending,
		error,
	} = useQuery(
		convexQuery(api.drivers.get, { driverId: driverId as Id<"drivers"> }),
	);
	const { displayName, members } = useOrgMembers();
	const today = localYmd();
	const { data: upcoming } = useQuery(
		convexQuery(
			api.assignments.list,
			driver
				? {
						driverId: driver._id,
						dateFrom: today,
						status: "scheduled" as const,
					}
				: "skip",
		),
	);
	const { data: contact } = useQuery(
		convexQuery(
			api.userProfiles.getContact,
			driver ? { userId: driver.userId } : "skip",
		),
	);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const tourNameById = new Map(
		(tours ?? []).map((t) => [String(t._id), t.name]),
	);

	const setActive = useMutation(api.drivers.setActive);
	const [activeSaving, setActiveSaving] = useState(false);

	const toggleActive = async (next: boolean) => {
		if (!driver) return;
		setActiveSaving(true);
		try {
			await setActive({ driverId: driver._id, isActive: next });
			toast.success(next ? "Driver activated" : "Driver deactivated");
		} catch (e) {
			toast.error(getErrorMessage(e));
		} finally {
			setActiveSaving(false);
		}
	};

	if (isPending) {
		return <DetailSkeleton />;
	}
	if (error) return <ErrorBanner message={getSafeDisplayMessage(error)} />;
	if (!driver)
		return <DetailPage title="Driver not found" backTo="/dashboard/drivers" />;

	const name = displayName(driver.userId);
	const member = members.find((m) => m.userId === driver.userId);
	const upcomingItems = upcoming ?? [];
	const phone = (contact?.phone ?? member?.phone ?? "").trim();
	const smsReady = phone.length > 0;

	return (
		<DetailPage title={name} subtitle="Driver" backTo="/dashboard/drivers">
			<div className="grid gap-4 md:grid-cols-3">
				<MetricCard
					label="Status"
					value={driver.isActive ? "Active" : "Inactive"}
				>
					<StatusBadge status={driver.isActive ? "active" : "inactive"} />
				</MetricCard>
				<MetricCard label="License" value={driver.licenseInfo || "—"} />
				<MetricCard
					label="Assignment SMS"
					value={smsReady ? "Ready" : "No phone"}
				>
					<Badge variant={smsReady ? "secondary" : "outline"}>
						{smsReady ? "Phone on file" : "Add phone"}
					</Badge>
				</MetricCard>
			</div>

			<DetailSection
				title="Contact"
				description="Phone is used for driving assignment SMS when Twilio is enabled."
			>
				<DriverPhoneForm userId={driver.userId} phone={contact?.phone ?? ""} />
				{member && (
					<p className="text-muted-foreground mt-2 text-sm">
						Email: {member.email || "—"} ·{" "}
						<Link
							to="/dashboard/guides/$userId"
							params={{ userId: driver.userId }}
							className="text-link hover:underline"
						>
							Open guide profile
						</Link>
					</p>
				)}
			</DetailSection>

			<DetailSection
				title="Driver profile"
				description="License and notes shown on assignments and fleet views."
			>
				<FieldGroup className="max-w-md gap-4">
					<Field orientation="horizontal">
						<FieldLabel htmlFor="driver-active">Available to assign</FieldLabel>
						<Switch
							id="driver-active"
							checked={driver.isActive}
							disabled={activeSaving}
							onCheckedChange={(checked) => void toggleActive(checked)}
						/>
						<FieldDescription>
							Inactive drivers stay on file but cannot be assigned to new
							departures.
						</FieldDescription>
					</Field>
				</FieldGroup>
				<DriverProfileForm
					driverId={driver._id}
					licenseInfo={driver.licenseInfo ?? ""}
					notes={driver.notes ?? ""}
				/>
			</DetailSection>

			<DetailSection
				title="Upcoming assignments"
				description={
					smsReady
						? "Scheduled departures — this driver will get email/SMS on changes when assignment notify is on."
						: "Scheduled departures — add a phone above to enable SMS alerts."
				}
			>
				{upcomingItems.length === 0 ? (
					<Empty className="min-h-0 border-dashed p-6 md:p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<CalendarClock />
							</EmptyMedia>
							<EmptyTitle>No upcoming assignments</EmptyTitle>
							<EmptyDescription>
								Assign this driver when a departure needs a vehicle.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<ul className="flex flex-col gap-2">
						{upcomingItems.slice(0, 20).map((a) => (
							<li key={a._id} className="text-sm">
								<Link
									to="/dashboard/assignments/$assignmentId"
									params={{ assignmentId: a._id }}
									className="text-link hover:underline"
								>
									{a.date} · {a.startTime}
								</Link>
								<span className="text-muted-foreground">
									{" "}
									· {tourNameById.get(a.tourId) ?? "Tour"}
								</span>
							</li>
						))}
					</ul>
				)}
			</DetailSection>

			<DetailSection title="Metadata" description="System fields">
				<DetailRow label="Driver ID" value={driver._id} mono />
				<DetailRow label="Member" value={name} />
				<DetailRow
					label="Created at"
					value={new Date(driver.createdAt).toLocaleString()}
				/>
				<DetailRow
					label="Updated at"
					value={new Date(driver.updatedAt).toLocaleString()}
				/>
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

function DriverPhoneForm({ userId, phone }: { userId: string; phone: string }) {
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
							<FieldLabel htmlFor="driver-phone">Phone</FieldLabel>
							<Input
								id="driver-phone"
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

function DriverProfileForm({
	driverId,
	licenseInfo,
	notes,
}: {
	driverId: Id<"drivers">;
	licenseInfo: string;
	notes: string;
}) {
	const updateDriver = useMutation(api.drivers.update);
	const form = useForm({
		defaultValues: { licenseInfo, notes },
		onSubmit: async ({ value }) => {
			const license = value.licenseInfo.trim();
			if (!license) {
				form.setFieldMeta("licenseInfo", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: "License info is required" },
				}));
				return;
			}
			if (license.length > MAX_LICENSE_LEN) {
				form.setFieldMeta("licenseInfo", (prev) => ({
					...prev,
					errorMap: {
						...prev.errorMap,
						onSubmit: `License info is too long (max ${MAX_LICENSE_LEN} characters)`,
					},
				}));
				return;
			}
			const notesErr = validateNotesOptional(value.notes);
			if (notesErr) {
				form.setFieldMeta("notes", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: notesErr },
				}));
				return;
			}
			try {
				await updateDriver({
					driverId,
					licenseInfo: license,
					notes: value.notes.trim(),
				});
				toast.success("Driver profile updated");
			} catch (e) {
				toast.error(getErrorMessage(e));
			}
		},
	});

	useEffect(() => {
		form.reset({ licenseInfo, notes });
	}, [form.reset, licenseInfo, notes]);

	return (
		<form
			className="mt-4 max-w-md"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="gap-4">
				<form.Field name="licenseInfo">
					{(field) => (
						<Field data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="driver-license">License info *</FieldLabel>
							<Input
								id="driver-license"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Class B · expires 2028"
								maxLength={MAX_LICENSE_LEN}
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Field name="notes">
					{(field) => (
						<Field data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="driver-notes">Notes</FieldLabel>
							<Textarea
								id="driver-notes"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Optional"
								rows={3}
								maxLength={MAX_NOTES_LEN}
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) =>
						[
							state.canSubmit,
							state.isSubmitting,
							state.values.licenseInfo,
							state.values.notes,
						] as const
					}
				>
					{([canSubmit, isSubmitting, licenseDraft, notesDraft]) => (
						<Button
							type="submit"
							disabled={
								!canSubmit ||
								isSubmitting ||
								(licenseDraft.trim() === licenseInfo.trim() &&
									notesDraft.trim() === notes.trim())
							}
						>
							{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
							{isSubmitting ? "Saving…" : "Save profile"}
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}
