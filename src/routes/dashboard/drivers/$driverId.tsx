import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DetailPage, DetailSection } from "@/components/detail-page";
import { FormField } from "@/components/form";
import { DetailRow, MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { useOrgMembers } from "@/hooks/use-org-members";
import { localYmd } from "@/lib/calendar-date";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { validatePhoneOptional } from "@/lib/validation";
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
	const [phoneDraft, setPhoneDraft] = useState("");
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [phoneSaving, setPhoneSaving] = useState(false);
	const [licenseDraft, setLicenseDraft] = useState("");
	const [notesDraft, setNotesDraft] = useState("");
	const [profileSaving, setProfileSaving] = useState(false);

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
		setProfileSaving(true);
		try {
			await updateDriver({
				driverId: driver._id,
				licenseInfo: licenseDraft.trim(),
				notes: notesDraft.trim(),
			});
			toast.success("Driver profile updated");
		} catch (e) {
			toast.error(getErrorMessage(e));
		} finally {
			setProfileSaving(false);
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
				<div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
					<div className="flex-1">
						<FormField
							label="Phone"
							htmlFor="driver-phone"
							error={phoneError ?? undefined}
						>
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
				<div className="max-w-md space-y-3">
					<FormField label="License info" htmlFor="driver-license">
						<Input
							id="driver-license"
							value={licenseDraft}
							onChange={(e) => setLicenseDraft(e.target.value)}
							placeholder="Class B · expires 2028"
							maxLength={200}
						/>
					</FormField>
					<FormField label="Notes" htmlFor="driver-notes">
						<Input
							id="driver-notes"
							value={notesDraft}
							onChange={(e) => setNotesDraft(e.target.value)}
							placeholder="Optional"
							maxLength={2000}
						/>
					</FormField>
					<Button
						type="button"
						onClick={() => void saveProfile()}
						disabled={
							profileSaving ||
							(licenseDraft.trim() === (driver.licenseInfo ?? "") &&
								notesDraft.trim() === (driver.notes ?? ""))
						}
					>
						{profileSaving ? "Saving…" : "Save profile"}
					</Button>
				</div>
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
					<p className="text-muted-foreground text-sm italic">
						No upcoming assignments
					</p>
				) : (
					<ul className="space-y-2">
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
