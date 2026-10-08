import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/auth/callback")({
	validateSearch: (search: Record<string, unknown>) => ({
		ott: typeof search.ott === "string" ? search.ott : undefined,
		// Only allow relative paths to prevent open redirect attacks.
		redirect:
			typeof search.redirect === "string" &&
			search.redirect.startsWith("/") &&
			!search.redirect.startsWith("//")
				? search.redirect
				: undefined,
		invitationId:
			typeof search.invitationId === "string" ? search.invitationId : undefined,
	}),
	component: AuthCallback,
});

function AuthCallback() {
	const { ott, redirect, invitationId } = Route.useSearch();
	const navigate = useNavigate();
	const processed = useRef(false);
	const [inviteError, setInviteError] = useState<string | null>(null);

	const verifyOtt = useMutation({
		mutationFn: async () => {
			const res = await fetch("/api/auth/cross-domain/one-time-token/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ token: ott }),
			});
			if (!res.ok) throw new Error("one-time token verify failed");
		},
		onSuccess: async () => {
			if (invitationId) {
				// OAuth sign-in from an invite link — accept before
				// routing, and surface failures instead of dropping
				// the user on a page they have no org for.
				const { error: acceptError } =
					await authClient.organization.acceptInvitation({
						invitationId,
					});
				if (acceptError) {
					setInviteError(acceptError.message ?? "Could not accept invitation");
					return;
				}
			}
			// Org pinning parity with sign-in (design step 1,
			// docs/DESIGN-authz-active-org.md): Google users were the
			// missed path — without this they hit authz's first-org
			// fallback on every backend query.
			// F425: pinning is BEST-EFFORT — the token above has
			// already been exchanged, so the session is valid. A
			// transient list()/setActive() failure must not bounce an
			// authenticated user back to sign-in (authz falls back to
			// the first org unpinned).
			let orgs: Array<{ id: string }> | undefined;
			let orgListFailed = false;
			try {
				const { data } = await authClient.organization.list();
				orgs = data ?? undefined;
				if (orgs && orgs.length === 1) {
					await authClient.organization.setActive({
						organizationId: orgs[0].id,
					});
				}
			} catch (err) {
				// F435: on failure we DON'T KNOW the org count — treating
				// that as zero sent provisioned users to /onboarding,
				// whose form creates a duplicate org. Only a successful
				// empty list routes to onboarding; a failed list routes
				// to the destination (authz first-org fallback covers
				// queries either way).
				orgListFailed = true;
				console.warn("org pinning failed; continuing without pinning", err);
			}
			void navigate({
				to:
					orgListFailed || (orgs && orgs.length > 0)
						? (redirect ?? "/dashboard")
						: "/onboarding",
			});
		},
		onError: () => {
			void navigate({ to: "/sign-in" });
		},
	});

	useEffect(() => {
		if (processed.current || !ott) return;
		processed.current = true;
		verifyOtt.mutate();
	}, [ott, verifyOtt.mutate]);

	if (inviteError) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
				<div className="w-full max-w-sm" role="alert">
					<ErrorBanner message={inviteError} />
				</div>
				<a
					href={`/invite/${invitationId}`}
					className="font-medium text-foreground text-sm underline"
				>
					Back to invitation
				</a>
			</div>
		);
	}

	return (
		<div
			className="flex min-h-screen flex-col items-center justify-center gap-3"
			role="status"
			aria-live="polite"
		>
			<Spinner className="size-8" />
			<p className="text-muted-foreground text-sm">
				{ott ? "Completing sign in..." : "Redirecting..."}
			</p>
		</div>
	);
}
