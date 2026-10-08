import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
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
	loaderDeps: ({ search }) => ({
		ott: search.ott,
		redirect: search.redirect,
		invitationId: search.invitationId,
	}),
	// SPA mode: the one-time-token exchange and the authClient calls below
	// must run against the browser's own cookie jar, so this route's loader
	// executes client-side — SSR would fetch with the wrong credentials.
	ssr: false,
	loader: async ({ deps: { ott, redirect: redirectTo, invitationId } }) => {
		if (!ott) return { inviteError: null, invitationId, ott };

		let res: Response;
		try {
			res = await fetch("/api/auth/cross-domain/one-time-token/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ token: ott }),
			});
		} catch {
			throw redirect({ to: "/sign-in" });
		}
		if (!res.ok) {
			throw redirect({ to: "/sign-in" });
		}

		try {
			if (invitationId) {
				// OAuth sign-in from an invite link — accept before
				// routing, and surface failures instead of dropping
				// the user on a page they have no org for.
				const { error: acceptError } =
					await authClient.organization.acceptInvitation({
						invitationId,
					});
				if (acceptError) {
					return {
						inviteError:
							acceptError.message ?? "Could not accept invitation",
						invitationId,
						ott,
					};
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
			throw redirect({
				to:
					orgListFailed || (orgs && orgs.length > 0)
						? (redirectTo ?? "/dashboard")
						: "/onboarding",
			});
		} catch (err) {
			if (isRedirect(err)) throw err;
			throw redirect({ to: "/sign-in" });
		}
	},
	pendingComponent: () => <CallbackSpinner label="Completing sign in..." />,
	component: AuthCallback,
});

function CallbackSpinner({ label }: { label: string }) {
	return (
		<div
			className="flex min-h-screen flex-col items-center justify-center gap-3"
			role="status"
			aria-live="polite"
		>
			<Spinner className="size-8" />
			<p className="text-muted-foreground text-sm">{label}</p>
		</div>
	);
}

function AuthCallback() {
	const { inviteError, invitationId, ott } = Route.useLoaderData();

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

	// Reached only without an OTT — a completed exchange always throws a
	// redirect above, so this is the "no token to consume" fallback.
	return <CallbackSpinner label={ott ? "Completing sign in..." : "Redirecting..."} />;
}
