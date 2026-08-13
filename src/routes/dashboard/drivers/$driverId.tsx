import { convexQuery } from "@convex-dev/react-query";
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

	const updatePhone = useMutation(api.userProfiles.updatePhone);
	const updateDriver = useMutation(api.drivers.update);
	const setActive = useMutation(api.drivers.setActive);
	const [phoneDraft, setPhoneDraft] = useState("");
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [phoneSaving, setPhoneSaving] = useState(false);
	const [licenseDraft, setLicenseDraft] = useState("");
	const [notesDraft, setNotesDraft] = useState("");
	const [licenseError, setLicenseError] = useState<string | null>(null);
	const [notesError, setNotesError] = useState<string | null>(null);
	const [profileSaving, setProfileSaving] = useState(false);
	const [activeSaving, setActiveSaving] = useState(false);

	useEffect(() => {
		if (contact) setPhoneDraft(contact.phone);
	}, [contact]);

	useEffect(() => {
		if (!driver) return;
		setLicenseDraft(driver.licenseInfo ?? "");
		setNotesDraft(driver.notes ?? "");
	}, [driver]);

	const savePhone = async () => {
		if (!driver) return;
		const err = validatePhoneOptional(phoneDraft);
		if (err) {
			setPhoneError(err);
			return;
		}
		setPhoneError(null);
		setPhoneSaving(true);
		try {
			await updatePhone({ userId: driver.userId, phone: phoneDraft.trim() });
			toast.success("Phone updated");
		} catch (e) {
			toast.error(getErrorMessage(e));
		} finally {
			setPhoneSaving(false);
		}
	};

	const saveProfile = async () => {
		if (!driver) return;
		const license = licenseDraft.trim();
		if (!license) {
			setLicenseError("License info is required");
			return;
		}
		if (license.length > MAX_LICENSE_LEN) {
			setLicenseError(
				`License info is too long (max ${MAX_LICENSE_LEN} characters)`,
			);
			return;
		}
		const notesErr = validateNotesOptional(notesDraft);
		if (notesErr) {
			setNotesError(notesErr);
			return;
		}
		setLicenseError(null);
		setNotesError(null);
		setProfileSaving(true);
		try {
			await updateDriver({
				driverId: driver._id,
				licenseInfo: license,
				notes: notesDraft.trim(),
			});
			toast.success("Driver profile updated");
		} catch (e) {
			toast.error(getErrorMessage(e));
		} finally {
			setProfileSaving(false);
		}
	};

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
	const profileDirty =
		licenseDraft.trim() !== (driver.licenseInfo ?? "") ||
		notesDraft.trim() !== (driver.notes ?? "");

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
				<FieldGroup className="max-w-md">
					<Field data-invalid={Boolean(phoneError)}>
						<FieldLabel htmlFor="driver-phone">Phone</FieldLabel>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
							<Input
								id="driver-phone"
								type="tel"
								placeholder="+1 555 0100"
								value={phoneDraft}
								onChange={(e) => {
									setPhoneDraft(e.target.value);
									if (phoneError) setPhoneError(null);
								}}
								autoComplete="tel"
								aria-invalid={Boolean(phoneError)}
								className="flex-1"
							/>
							<Button
								type="button"
								onClick={() => void savePhone()}
								disabled={
									phoneSaving || phoneDraft.trim() === (contact?.phone ?? "")
								}
							>
								{phoneSaving ? <Spinner data-icon="inline-start" /> : null}
								{phoneSaving ? "Saving…" : "Save"}
							</Button>
						</div>
						{phoneError ? <FieldError>{phoneError}</FieldError> : null}
					</Field>
				</FieldGroup>
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
					<Field data-invalid={Boolean(licenseError)}>
						<FieldLabel htmlFor="driver-license">License info *</FieldLabel>
						<Input
							id="driver-license"
							value={licenseDraft}
							onChange={(e) => {
								setLicenseDraft(e.target.value);
								if (licenseError) setLicenseError(null);
							}}
							placeholder="Class B · expires 2028"
							maxLength={MAX_LICENSE_LEN}
							aria-invalid={Boolean(licenseError)}
						/>
						{licenseError ? <FieldError>{licenseError}</FieldError> : null}
					</Field>
					<Field data-invalid={Boolean(notesError)}>
						<FieldLabel htmlFor="driver-notes">Notes</FieldLabel>
						<Textarea
							id="driver-notes"
							value={notesDraft}
							onChange={(e) => {
								setNotesDraft(e.target.value);
								if (notesError) setNotesError(null);
							}}
							placeholder="Optional"
							rows={3}
							maxLength={MAX_NOTES_LEN}
							aria-invalid={Boolean(notesError)}
						/>
						{notesError ? <FieldError>{notesError}</FieldError> : null}
					</Field>
					<Button
						type="button"
						onClick={() => void saveProfile()}
						disabled={profileSaving || !profileDirty}
					>
						{profileSaving ? <Spinner data-icon="inline-start" /> : null}
						{profileSaving ? "Saving…" : "Save profile"}
					</Button>
				</FieldGroup>
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
