import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-field";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>) => {
		const token = typeof search.token === "string" ? search.token : undefined;
		const error = typeof search.error === "string" ? search.error : undefined;
		return {
			...(token ? { token } : {}),
			...(error ? { error } : {}),
		};
	},
	component: ResetPasswordPage,
});

const resetSchema = z.object({
	password: z.string().min(8, "Password must be at least 8 characters"),
});

type ResetForm = z.infer<typeof resetSchema>;

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();
	const [serverError, setServerError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const form = useForm({
		defaultValues: { password: "" } satisfies ResetForm,
		validators: { onSubmit: resetSchema },
		onSubmit: async ({ value }) => {
			if (!token) return;
			setServerError(null);
			try {
				const result = await authClient.resetPassword({
					newPassword: value.password,
					token,
				});
				if (result.error) {
					setServerError(
						result.error.message ??
							"Could not reset your password. The link may have expired.",
					);
					return;
				}
				setSuccess(true);
			} catch (e) {
				setServerError(
					e instanceof Error
						? e.message
						: "Could not reset your password. The link may have expired.",
				);
			}
		},
	});

	if (error) {
		return (
			<AuthShell
				title="Reset link invalid"
				serifAccent=""
				description="This password reset link is invalid or has expired."
			>
				<ErrorBanner
					message="Please request a new reset link."
					action={
						<Link to="/forgot-password">
							<Button className="mt-2 w-full rounded-full" size="lg">
								Request a new link
							</Button>
						</Link>
					}
				/>
			</AuthShell>
		);
	}

	if (success) {
		return (
			<AuthShell
				title="Password updated"
				serifAccent=""
				description="Your password has been reset. You can now sign in."
			>
				<Link to="/sign-in">
					<Button className="h-11 w-full rounded-full" size="lg">
						Go to sign in
					</Button>
				</Link>
			</AuthShell>
		);
	}

	if (!token) {
		return (
			<AuthShell
				title="Missing reset token"
				serifAccent=""
				description="This link is missing a valid reset token."
			>
				<Link to="/forgot-password">
					<Button className="h-11 w-full rounded-full" size="lg">
						Request a new link
					</Button>
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			title="Choose a new password"
			serifAccent=""
			description="Pick a strong password for your account."
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-4">
					<form.Field name="password">
						{(field) => (
							<FormField
								field={field}
								label="New password"
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
										<Spinner data-icon="inline-start" /> Resetting...
									</>
								) : (
									"Reset password"
								)}
							</Button>
						)}
					</form.Subscribe>

					<p className="pt-2 text-center text-sm text-muted-foreground">
						Remembered your password?{" "}
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
