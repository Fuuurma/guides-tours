import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { FormField } from "@/components/form";
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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { organization } from "@/lib/auth-client";
import { getErrorMessage } from "@/lib/utils";
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

function InviteGuideDialog({ onInvited }: { onInvited: () => void }) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("guide");
	const [pending, setPending] = useState(false);

	const onInvite = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = email.trim().toLowerCase();
		if (!trimmed.includes("@")) {
			toast.error("Enter a valid email");
			return;
		}
		setPending(true);
		try {
			const { error } = await organization.inviteMember({
				email: trimmed,
				role: role as "guide" | "member" | "admin",
			});
			if (error) throw new Error(error.message ?? "Invite failed");
			toast.success(`Invitation sent to ${trimmed}`);
			setEmail("");
			setOpen(false);
			onInvited();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">Invite guide</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={onInvite}>
					<DialogHeader>
						<DialogTitle>Invite a guide</DialogTitle>
						<DialogDescription>
							Sends an email with a link to join this organization.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<FormField label="Email *" htmlFor="invite-email">
							<Input
								id="invite-email"
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="guide@example.com"
							/>
						</FormField>
						<FormField label="Role" htmlFor="invite-role">
							<Select value={role} onValueChange={setRole}>
								<SelectTrigger id="invite-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="guide">Guide</SelectItem>
									<SelectItem value="member">Member</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
								</SelectContent>
							</Select>
						</FormField>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={pending}>
							{pending ? "Sending…" : "Send invite"}
						</Button>
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
		<>
			<ListPage
				title="Guides"
				description={`${itemCount} guide-capable member${itemCount === 1 ? "" : "s"}`}
				actions={
					<InviteGuideDialog
						onInvited={() => {
							setInviteTick((n) => n + 1);
							void refetchMembers();
						}}
					/>
				}
			>
				<DataTable
					data={guides}
					columns={columns}
					rowKey={(g) => g.userId}
					isPending={isPending}
					error={error}
					emptyMessage="No guides yet. Invite members with the guide role."
					searchPlaceholder="Search by name, email, or role…"
				/>
			</ListPage>
			<PendingInvitesSection key={inviteTick} />
		</>
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
		<section className="mt-10 space-y-3">
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
								{busyId === inv.id ? "Cancelling…" : "Cancel"}
							</Button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
