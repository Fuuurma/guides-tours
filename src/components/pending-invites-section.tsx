import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { organization } from "@/lib/auth-client";
import { isInviteExpired, planInvitationResend } from "@/lib/invitations";
import { getErrorMessage } from "@/lib/utils";
import type { RoleName } from "../../convex/authz";

export type InviteRow = {
	id: string;
	email: string;
	role: string;
	status: string;
	expiresAt?: Date | string | number;
};

type PendingAction = "resend" | "cancel";

export function PendingInvitesSection() {
	const [invites, setInvites] = useState<InviteRow[] | null>(null);
	const [loading, setLoading] = useState(true);
	// Per-invitation in-flight action — a second click on another row must
	// not re-enable this row's buttons while its request is still running.
	const [pending, setPending] = useState<Record<string, PendingAction>>({});

	const setRowPending = (id: string, action: PendingAction | null) =>
		setPending((prev) => {
			const next = { ...prev };
			if (action) next[id] = action;
			else delete next[id];
			return next;
		});

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
		setRowPending(invitationId, "cancel");
		try {
			const { error } = await organization.cancelInvitation({ invitationId });
			if (error) throw new Error(error.message ?? "Cancel failed");
			toast.success("Invitation cancelled");
			await refresh();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setRowPending(invitationId, null);
		}
	};

	const onResend = async (inv: InviteRow) => {
		setRowPending(inv.id, "resend");
		try {
			// Better Auth's resend only matches NON-expired pending rows, so
			// resending an expired invite would silently create a duplicate
			// beside the stale one. Cancel every expired same-email row first
			// (there may be several if this bug already proliferated), then let
			// `resend: true` extend the surviving live row or create a fresh
			// one — either way the list ends with one pending invite per email.
			for (const staleId of planInvitationResend(invites ?? [], inv)) {
				const { error } = await organization.cancelInvitation({
					invitationId: staleId,
				});
				if (error)
					throw new Error(error.message ?? "Failed to clear stale invite");
			}
			const { error } = await organization.inviteMember({
				email: inv.email,
				// Pass the stored role through verbatim — resend re-uses the
				// invitation's own role server-side; the request value only has
				// to pass validation, and any stored role is a RoleName by
				// construction (invites are created with these roles).
				role: inv.role as RoleName,
				resend: true,
			});
			if (error) throw new Error(error.message ?? "Resend failed");
			// Email delivery is unconfirmable from here (the send callback
			// runs server-side and never surfaces failures) — claim only what
			// actually happened: the resend was requested.
			toast.success(`Resend requested for ${inv.email}`, {
				description: "Invite email delivery is best-effort.",
			});
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setRowPending(inv.id, null);
			await refresh();
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
										? isInviteExpired(inv)
											? " · expired"
											: ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`
										: ""}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={pending[inv.id] !== undefined}
									onClick={() => void onResend(inv)}
								>
									{pending[inv.id] === "resend" ? (
										<Spinner data-icon="inline-start" />
									) : null}
									{pending[inv.id] === "resend" ? "Resending…" : "Resend"}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={pending[inv.id] !== undefined}
									onClick={() => void onCancel(inv.id)}
								>
									{pending[inv.id] === "cancel" ? (
										<Spinner data-icon="inline-start" />
									) : null}
									{pending[inv.id] === "cancel" ? "Cancelling…" : "Cancel"}
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
