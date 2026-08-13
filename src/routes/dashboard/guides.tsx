import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
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

function InviteGuideDialog({ onInvited }: { onInvited: () => void }) {
	const [open, setOpen] = useState(false);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { email: "", role: "guide" },
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
			const role = value.role as "guide" | "member" | "admin";
			try {
				const { error } = await organization.inviteMember({
					email: value.email.trim().toLowerCase(),
					role,
				});
				if (error) throw new Error(error.message ?? "Invite failed");
				toast.success(`Invitation sent to ${value.email.trim().toLowerCase()}`);
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
											if (v) field.handleChange(v);
										}}
									>
										<ToggleGroupItem value="guide">Guide</ToggleGroupItem>
										<ToggleGroupItem value="member">Member</ToggleGroupItem>
										<ToggleGroupItem value="admin">Admin</ToggleGroupItem>
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

type InviteRow = {
	id: string;
	email: string;
	role: string;
	status: string;
	expiresAt?: Date | string | number;
};

function PendingInvitesSection() {
	const [invites, setInvites] = useState<InviteRow[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setLoading(true);
			try {
				const { data, error } = await organization.listInvitations();
				if (error) throw new Error(error.message ?? "Failed to load invites");
				if (cancelled) return;
				const rows = (data ?? []) as InviteRow[];
				setInvites(rows.filter((i) => i.status === "pending"));
			} catch (err) {
				if (cancelled) return;
				toast.error(getErrorMessage(err));
				setInvites([]);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	const refresh = async () => {
		setLoading(true);
		try {
			const { data, error } = await organization.listInvitations();
			if (error) throw new Error(error.message ?? "Failed to load invites");
			const rows = (data ?? []) as InviteRow[];
			setInvites(rows.filter((i) => i.status === "pending"));
		} catch (err) {
			toast.error(getErrorMessage(err));
			setInvites([]);
		} finally {
			setLoading(false);
		}
	};

	const onCancel = async (invitationId: string) => {
		setBusyId(invitationId);
		try {
			const { error } = await organization.cancelInvitation({ invitationId });
			if (error) throw new Error(error.message ?? "Cancel failed");
			toast.success("Invitation cancelled");
			await refresh();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setBusyId(null);
		}
	};

	return (
		<section className="mt-10 flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<div>
					<h2 className="text-lg font-semibold">Pending invites</h2>
					<p className="text-muted-foreground text-sm">
						Invitations that haven't been accepted yet
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => void refresh()}
					disabled={loading}
				>
					Refresh
				</Button>
			</div>
			{loading && invites === null ? (
				<p className="text-muted-foreground text-sm">Loading…</p>
			) : !invites || invites.length === 0 ? (
				<p className="text-muted-foreground text-sm">No pending invites.</p>
			) : (
				<ul className="divide-y rounded-md border">
					{invites.map((inv) => (
						<li
							key={inv.id}
							className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
						>
							<div>
								<p className="font-medium">{inv.email}</p>
								<p className="text-muted-foreground text-xs">
									Role: {inv.role}
									{inv.expiresAt
										? ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`
										: ""}
								</p>
							</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={busyId === inv.id}
								onClick={() => void onCancel(inv.id)}
							>
								{busyId === inv.id ? (
									<Spinner data-icon="inline-start" />
								) : null}
								{busyId === inv.id ? "Cancelling…" : "Cancel"}
							</Button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
