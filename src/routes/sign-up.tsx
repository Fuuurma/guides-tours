import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PasswordInput } from "@/components/auth/password-field";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-up")({
	validateSearch: (search: Record<string, unknown>) => {
		// Only allow relative paths to prevent open redirect attacks.
		const redirect =
			typeof search.redirect === "string" &&
			search.redirect.startsWith("/") &&
			!search.redirect.startsWith("//")
				? search.redirect
				: undefined;
		return { ...(redirect ? { redirect } : {}) };
	},
	component: SignUpPage,
});

const signUpSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	email: z.email("Invalid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpForm = z.infer<typeof signUpSchema>;

function SignUpPage() {
	const navigate = useNavigate();
	const { redirect } = Route.useSearch();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" } satisfies SignUpForm,
		validators: { onSubmit: signUpSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error: signUpError } = await authClient.signUp.email({
				email: value.email,
				password: value.password,
				name: value.name,
			});
			if (signUpError) {
				// Generic message — "email already in use" leaks valid emails.
				setServerError("Could not create account. Please try again.");
				return;
			}
			// First user → land on onboarding to create the company org.
			await navigate({
				to: redirect?.startsWith("/") ? (redirect as "/") : "/onboarding",
			});
		},
	});

	return (
		<AuthShell
			title="Create your account"
			serifAccent=""
			description="Start staffing this week's tours, crew, and departures from one board."
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-4">
					<form.Field name="name">
						{(field) => (
							<FormField
								field={field}
								label="Name"
								inputProps={{
									type: "text",
									autoComplete: "name",
									autoFocus: true,
								}}
							/>
						)}
					</form.Field>

					<form.Field name="email">
						{(field) => (
							<FormField
								field={field}
								label="Email"
								inputProps={{
									type: "email",
									autoComplete: "email",
								}}
							/>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<FormField
								field={field}
								label="Password"
								hint="At least 8 characters"
							>
								<PasswordInput
									id="password"
									name="password"
									value={(field.state.value as string) ?? ""}
									onChange={(v) =>
										(field.handleChange as (v: unknown) => void)(v)
									}
									onBlur={field.handleBlur}
									autoComplete="new-password"
									showStrength
									invalid={!field.state.meta.isValid}
									aria-invalid={!field.state.meta.isValid}
								/>
							</FormField>
						)}
					</form.Field>

					{serverError ? <ErrorBanner message={serverError} /> : null}

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
										<Spinner data-icon="inline-start" /> Creating account...
									</>
								) : (
									"Create account"
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

					<GoogleSignInButton callbackURL="/onboarding" />

					<p className="pt-2 text-center text-sm text-muted-foreground">
						Already have an account?{" "}
						<Link
							to="/sign-in"
							className="font-medium text-foreground underline"
						>
							Sign in
						</Link>
					</p>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
