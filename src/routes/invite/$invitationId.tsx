import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AUTH_PANEL, AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-field";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/invite/$invitationId")({
	component: AcceptInvitePage,
});

const signUpSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpForm = z.infer<typeof signUpSchema>;

function AcceptInvitePage() {
	const { invitationId } = Route.useParams();
	const navigate = useNavigate();
	const [invite, setInvite] = useState<{
		email: string;
		organizationName: string;
		role: string;
	} | null>(null);
	const [inviteError, setInviteError] = useState<string | null>(null);
	const [serverError, setServerError] = useState<string | null>(null);

	// Fetch the invitation metadata so we know the email + org name.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const { data } = await authClient.organization.getInvitation({
					query: { id: invitationId },
				});
				if (cancelled) return;
				if (!data) {
					setInviteError("Invitation not found or already used.");
					return;
				}
				setInvite({
					email: data.email,
					organizationName: data.organizationName,
					role: data.role,
				});
			} catch {
				if (!cancelled) {
					setInviteError("Could not load invitation. Please try again.");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [invitationId]);

	// Owners are already members — redirect them into the dashboard
	// instead of showing a sign-up form. Done in an effect so we never
	// navigate during render.
	useEffect(() => {
		if (invite && invite.role === "owner") {
			void navigate({ to: "/dashboard" });
		}
	}, [invite, navigate]);

	const form = useForm({
		defaultValues: {
			name: "",
			password: "",
		} satisfies SignUpForm,
		validators: { onSubmit: signUpSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			if (!invite) {
				setServerError("Invitation not loaded yet");
				return;
			}
			try {
				// Sign up first (matches the invite's email).
				const signUp = await authClient.signUp.email({
					email: invite.email,
					password: value.password,
					name: value.name,
				});
				if (signUp.error) {
					setServerError(signUp.error.message ?? "Sign up failed");
					return;
				}
				// Then accept the invite.
				const accept = await authClient.organization.acceptInvitation({
					invitationId,
				});
				if (accept.error) {
					setServerError(accept.error.message ?? "Could not accept invitation");
					return;
				}
				window.location.assign("/dashboard");
			} catch (e) {
				setServerError(getErrorMessage(e));
			}
		},
	});

	const loading = !invite && !inviteError;

	return (
		<AuthShell
			title={invite ? `Join ${invite.organizationName}` : "Accept invitation"}
			serifAccent=""
			description={
				invite
					? `You've been invited to join as ${invite.role}. Create your account to accept.`
					: "Loading invitation details..."
			}
			image={AUTH_PANEL.invite}
		>
			{loading ? (
				<div className="flex flex-col gap-4" aria-hidden="true">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-11 w-full rounded-full" />
				</div>
			) : inviteError ? (
				<ErrorBanner message={inviteError} />
			) : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<FieldGroup className="gap-4">
						<Field>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								type="email"
								value={invite?.email ?? ""}
								readOnly
								disabled
							/>
						</Field>

						<form.Field name="name">
							{(field) => (
								<FormField
									field={field}
									label="Your name"
									inputProps={{ autoComplete: "name", autoFocus: true }}
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
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
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
										"Accept invitation"
									)}
								</Button>
							)}
						</form.Subscribe>

						<p className="pt-2 text-center text-sm text-muted-foreground">
							Already have an account?{" "}
							<a
								href={`/sign-in?invitationId=${invitationId}`}
								className="font-medium text-foreground underline"
							>
								Sign in to accept
							</a>
						</p>
					</FieldGroup>
				</form>
			)}
		</AuthShell>
	);
}
