import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { PendingInvitesSection } from "@/components/pending-invites-section";
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
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { organization } from "@/lib/auth-client";
import { getErrorMessage } from "@/lib/utils";
import { MAX_EMAIL_LEN, validateEmail } from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { RoleName } from "../../../convex/authz";

export const Route = createFileRoute("/dashboard/guides")({
	component: GuidesPage,
});

type GuideRow = {
	userId: string;
	name: string;
	email: string;
	role: string;
};

const GUIDE_ROLES = ["guide", "owner", "admin"];

// Roles this dialog may grant — a subset of the org RoleName union
// defined in convex/authz.ts (owner/driver are not invitable here).
type InvitableRole = Extract<RoleName, "guide" | "member" | "admin">;

const columns: DataTableColumn<GuideRow>[] = [
	{
		key: "name",
		header: "Name",
		render: (g) => (
			<Link
				to="/dashboard/guides/$userId"
				params={{ userId: g.userId }}
				className="text-link hover:underline font-medium"
			>
				{g.name}
			</Link>
		),
		searchValue: (g) => g.name,
	},
	{
		key: "email",
		header: "Email",
		render: (g) => g.email || "—",
		searchValue: (g) => g.email,
	},
	{
		key: "role",
		header: "Role",
		render: (g) => <Badge variant="secondary">{g.role}</Badge>,
		searchValue: (g) => g.role,
	},
];

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

// F81: shared invite-role union — the submit path and the ToggleGroup
// options both derive from this list instead of an inline cast.
const INVITE_ROLES = [
	{ value: "guide", label: "Guide" },
	{ value: "member", label: "Member" },
	{ value: "admin", label: "Admin" },
] as const;
type InviteRole = (typeof INVITE_ROLES)[number]["value"];

function InviteGuideDialog({ onInvited }: { onInvited: () => void }) {
	const [open, setOpen] = useState(false);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { email: "", role: "guide" as InviteRole },
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			const emailErr = validateEmail(value.email);
			if (emailErr) {
				form.setFieldMeta("email", (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: emailErr },
				}));
				return;
			}
			const role = value.role as InvitableRole;
			try {
				const { error } = await organization.inviteMember({
					email: value.email.trim().toLowerCase(),
					role,
				});
				if (error) throw new Error(error.message ?? "Invite failed");
				// Only the invitation row is confirmed — the email send runs
				// server-side and never surfaces SES failures to the client, so
				// the UI must not claim the email was sent.
				toast.success(
					`Invitation created for ${value.email.trim().toLowerCase()}`,
					{
						description:
							"Invite email requested — resend it from Pending invites if it doesn't arrive.",
					},
				);
				form.reset();
				setOpen(false);
				onInvited();
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
				<Button size="sm">Invite guide</Button>
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
						<DialogTitle>Invite a guide</DialogTitle>
						<DialogDescription>
							Sends an email with a link to join this organization.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4 py-4">
						<form.Field name="email">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="invite-email">Email *</FieldLabel>
									<Input
										id="invite-email"
										type="email"
										required
										maxLength={MAX_EMAIL_LEN}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="guide@example.com"
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						<form.Field name="role">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="invite-role">Role</FieldLabel>
									<ToggleGroup
										id="invite-role"
										type="single"
										variant="outline"
										size="sm"
										value={field.state.value}
										onValueChange={(v) => {
											if (INVITE_ROLES.some((r) => r.value === v)) {
												field.handleChange(v as InviteRole);
											}
										}}
									>
										{INVITE_ROLES.map((r) => (
											<ToggleGroupItem key={r.value} value={r.value}>
												{r.label}
											</ToggleGroupItem>
										))}
									</ToggleGroup>
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
									{isSubmitting ? "Sending…" : "Send invite"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function GuidesPage() {
	const {
		data: members,
		isPending,
		error,
		refetch: refetchMembers,
	} = useQuery(
		convexQuery(api.organizations.listMembers, { roles: GUIDE_ROLES }),
	);
	const [inviteTick, setInviteTick] = useState(0);

	const guides = (members ?? []) as GuideRow[];
	const itemCount = guides.length;

	return (
		<ListPage
			title="Guides"
			description={`${itemCount} guide-capable member${itemCount === 1 ? "" : "s"} — people who can lead a tour`}
			basePath="/dashboard/guides"
			actions={
				<InviteGuideDialog
					onInvited={() => {
						setInviteTick((n) => n + 1);
						void refetchMembers();
					}}
				/>
			}
			below={<PendingInvitesSection key={inviteTick} />}
		>
			<DataTable
				data={guides}
				columns={columns}
				rowKey={(g) => g.userId}
				isPending={isPending}
				error={error}
				emptyMessage="No guides yet"
				emptyDescription="Invite your team with the guide role so you can assign them to departures."
				emptyAction={
					<InviteGuideDialog
						onInvited={() => {
							setInviteTick((n) => n + 1);
							void refetchMembers();
						}}
					/>
				}
				searchPlaceholder="Search by name, email, or role…"
			/>
		</ListPage>
	);
}
