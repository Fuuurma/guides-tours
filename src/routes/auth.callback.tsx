import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { acceptInvitationForSession } from "@/lib/invitations";

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
		// Invite acceptance carried through OAuth sign-in: the Google
		// button on /sign-in?invitationId=… routes here so the invite is
		// accepted once the session exists (F148).
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

	useEffect(() => {
		if (processed.current) return;
		processed.current = true;

		void (async () => {
			// The crossDomain plugin appends ?ott= to the OAuth redirect;
			// exchanging it here sets the session cookie. The root
			// ConvexBetterAuthProvider also verifies a URL `ott` on mount —
			// whoever's request lands first consumes the one-time token, so
			// a failed exchange is fine when a live session already exists.
			let signedIn = false;
			if (ott) {
				const res = await fetch(
					"/api/auth/cross-domain/one-time-token/verify",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						credentials: "include",
						body: JSON.stringify({ token: ott }),
					},
				);
				signedIn = res.ok;
			}
			if (!signedIn) {
				const { data: session } = await authClient.getSession();
				signedIn = Boolean(session);
			}
			if (!signedIn) {
				await navigate({ to: "/sign-in" });
				return;
			}

			if (invitationId) {
				const accept = await acceptInvitationForSession(invitationId);
				if (!accept.ok) {
					setInviteError(accept.message);
					return;
				}
				await navigate({
					to:
						accept.orgs.length > 0 ? (redirect ?? "/dashboard") : "/onboarding",
				});
				return;
			}

			// Org pinning parity with sign-in (design step 1,
			// docs/DESIGN-authz-active-org.md): Google users were the
			// missed path — without this they hit authz's first-org
			// fallback on every backend query.
			const { data: orgs } = await authClient.organization.list();
			if (orgs && orgs.length === 1) {
				await authClient.organization.setActive({
					organizationId: orgs[0].id,
				});
			}
			await navigate({
				to:
					orgs && orgs.length > 0 ? (redirect ?? "/dashboard") : "/onboarding",
			});
		})().catch(() => {
			void navigate({ to: "/sign-in" });
		});
	}, [ott, redirect, invitationId, navigate]);

	if (inviteError) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center px-4">
				<ErrorBanner
					className="w-full max-w-md"
					message={inviteError}
					hint="You are signed in, but the invitation could not be accepted."
					action={
						invitationId ? (
							<Link
								to="/invite/$invitationId"
								params={{ invitationId }}
								className="font-medium text-foreground underline"
							>
								View invitation
							</Link>
						) : null
					}
				/>
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
