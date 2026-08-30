import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";

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
	}),
	component: AuthCallback,
});

function AuthCallback() {
	const { ott, redirect } = Route.useSearch();
	const navigate = useNavigate();
	const processed = useRef(false);

	useEffect(() => {
		if (processed.current || !ott) return;
		processed.current = true;

		void fetch("/api/auth/cross-domain/one-time-token/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ token: ott }),
		})
			.then((res) => {
				if (res.ok) {
					void navigate({ to: redirect ?? "/dashboard" });
				} else {
					void navigate({ to: "/sign-in" });
				}
			})
			.catch(() => {
				void navigate({ to: "/sign-in" });
			});
	}, [ott, redirect, navigate]);

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
