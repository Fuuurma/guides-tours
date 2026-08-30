import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AUTH_PANEL, AuthShell } from "@/components/auth/auth-shell";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>) => {
		const redirect =
			typeof search.redirect === "string" &&
			search.redirect.startsWith("/") &&
			!search.redirect.startsWith("//")
				? search.redirect
				: undefined;
		const invitationId =
			typeof search.invitationId === "string" ? search.invitationId : undefined;
		return {
			...(redirect ? { redirect } : {}),
			...(invitationId ? { invitationId } : {}),
		};
	},
	component: SignInPage,
});

const signInSchema = z.object({
	email: z.email("Invalid email"),
	password: z.string().min(1, "Password is required"),
});

type SignInForm = z.infer<typeof signInSchema>;

function SignInPage() {
	const navigate = useNavigate();
	const { redirect, invitationId } = Route.useSearch();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { email: "", password: "" } satisfies SignInForm,
		validators: { onSubmit: signInSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error: signInError } = await authClient.signIn.email({
				email: value.email,
				password: value.password,
			});
			if (signInError) {
				// Generic message to prevent email enumeration via
				// distinct "user not found" vs "wrong password" errors.
				setServerError("Invalid email or password");
				return;
			}

			if (invitationId) {
				// Coming from the invite "sign in to accept" link — accept
				// the invitation after a successful sign-in.
				await authClient.organization.acceptInvitation({ invitationId });
				await navigate({ to: "/dashboard" });
				return;
			}

			if (redirect) {
				await navigate({ to: redirect });
				return;
			}

			// After sign-in, peek at whether the user has any org. If not,
			// route them through onboarding. Otherwise straight to dashboard.
			const { data: orgs } = await authClient.organization.list();
			await navigate({
				to: orgs && orgs.length > 0 ? "/dashboard" : "/onboarding",
			});
		},
	});

	return (
		<AuthShell
			title="Welcome back"
			serifAccent=""
			description="Sign in to staff this week's departures from one board."
			image={AUTH_PANEL.signIn}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-4">
					<form.Field name="email">
						{(field) => (
							<FormField
								field={field}
								label="Email"
								inputProps={{
									type: "email",
									autoComplete: "email",
									autoFocus: true,
								}}
							/>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<FormField
								field={field}
								label="Password"
								inputProps={{
									type: "password",
									autoComplete: "current-password",
								}}
							/>
						)}
					</form.Field>

					{serverError ? <ErrorBanner message={serverError} /> : null}

					<div className="flex items-center justify-between pt-1">
						<Link
							to="/forgot-password"
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Forgot password?
						</Link>
						{invitationId ? (
							<span className="text-xs text-muted-foreground">
								Signing in to accept invite
							</span>
						) : null}
					</div>

					<form.Subscribe
						selector={(state) => [state.canSubmit, state.isSubmitting] as const}
					>
						{([canSubmit, isSubmitting]) => (
							<Button
								type="submit"
								size="lg"
								className="h-11 w-full rounded-full"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? (
									<>
										<Spinner data-icon="inline-start" /> Signing in...
									</>
								) : (
									"Sign in"
								)}
							</Button>
						)}
					</form.Subscribe>

					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<span className="w-full border-t" />
						</div>
						<div className="relative flex justify-center">
							<span className="bg-background px-3 text-xs text-muted-foreground">
								or
							</span>
						</div>
					</div>

					<GoogleSignInButton
						callbackURL={
							redirect ? `${window.location.origin}${redirect}` : "/dashboard"
						}
					/>

					<p className="pt-2 text-center text-sm text-muted-foreground">
						No account yet?{" "}
						<Link
							to="/sign-up"
							className="font-medium text-foreground underline"
						>
							Create one
						</Link>
					</p>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
