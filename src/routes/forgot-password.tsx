import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
	component: ForgotPasswordPage,
});

const forgotSchema = z.object({
	email: z.email("Invalid email"),
});

type ForgotForm = z.infer<typeof forgotSchema>;

function ForgotPasswordPage() {
	const [serverError, setServerError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const form = useForm({
		defaultValues: { email: "" } satisfies ForgotForm,
		validators: { onSubmit: forgotSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			try {
				await authClient.requestPasswordReset({
					email: value.email,
					redirectTo: `${window.location.origin}/reset-password`,
				});
				// Always show the generic success message regardless of
				// whether the account exists — prevents email enumeration.
				setSubmitted(true);
			} catch (error) {
				setServerError(
					error instanceof Error
						? error.message
						: "Something went wrong. Please try again.",
				);
			}
		},
	});

	if (submitted) {
		return (
			<AuthShell
				title="Check your inbox"
				serifAccent=""
				description="We've sent a password reset link if an account exists for that email."
			>
				<div className="flex flex-col items-center gap-4 rounded-xl border bg-muted/40 p-6 text-center">
					<span className="grid size-12 place-items-center rounded-full bg-chart-2/15 text-chart-2">
						<MailCheck className="size-6" />
					</span>
					<p className="text-sm leading-6 text-muted-foreground">
						The reset link expires in 1 hour. If you don't see the email, check
						your spam folder.
					</p>
					<Link
						to="/sign-in"
						className="text-sm font-medium text-foreground underline"
					>
						Back to sign in
					</Link>
				</div>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			title="Reset your password"
			serifAccent=""
			description="Enter your email and we'll send you a link to reset your password."
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
										<Spinner data-icon="inline-start" /> Sending...
									</>
								) : (
									"Send reset link"
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
