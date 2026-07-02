import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/invite/$invitationId")({
	component: AcceptInvitePage,
});

const signUpSchema = z
	.object({
		name: z.string().min(2, "Name must be at least 2 characters"),
		password: z.string().min(8, "Password must be at least 8 characters"),
		confirm: z.string(),
	})
	.refine((d) => d.password === d.confirm, {
		message: "Passwords don't match",
		path: ["confirm"],
	});

type SignUpForm = z.infer<typeof signUpSchema>;

function AcceptInvitePage() {
	const { invitationId } = Route.useParams();
	const [invite, setInvite] = useState<{
		email: string;
		organizationName: string;
		role: string;
	} | null>(null);
	const [serverError, setServerError] = useState<string | null>(null);

	// Fetch the invitation metadata so we know the email + org name.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const { data } = await authClient.organization.getInvitation({
				query: { id: invitationId },
			});
			if (cancelled) return;
			if (!data) {
				setServerError("Invitation not found or already used.");
				return;
			}
			setInvite({
				email: data.email,
				organizationName: data.organizationName,
				role: data.role,
			});
		})();
		return () => {
			cancelled = true;
		};
	}, [invitationId]);

	const form = useForm({
		defaultValues: {
			name: "",
			password: "",
			confirm: "",
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

	if (invite && invite.role === "owner") {
		window.location.assign("/dashboard");
		return null;
	}

	return (
		<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
			<Card>
				<CardHeader>
					<CardTitle>
						{invite ? `Join ${invite.organizationName}` : "Accept invitation"}
					</CardTitle>
					<CardDescription>
						{invite
							? `You've been invited to join as ${invite.role}. Create your account to accept.`
							: (serverError ?? "Loading invitation...")}
					</CardDescription>
				</CardHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								value={invite?.email ?? ""}
								readOnly
								disabled
							/>
						</div>

						<form.Field name="name">
							{(field) => <FormField field={field} label="Your name" />}
						</form.Field>

						<form.Field name="password">
							{(field) => (
								<FormField
									field={field}
									label="Password"
									inputProps={{ type: "password" }}
								/>
							)}
						</form.Field>

						<form.Field name="confirm">
							{(field) => (
								<FormField
									field={field}
									label="Confirm password"
									inputProps={{ type: "password" }}
								/>
							)}
						</form.Field>

						{serverError ? (
							<p className="text-destructive text-sm" role="alert">
								{serverError}
							</p>
						) : null}
					</CardContent>
					<CardFooter className="flex flex-col gap-3">
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button
									type="submit"
									disabled={!canSubmit || isSubmitting || !invite}
									className="w-full"
								>
									{isSubmitting ? "Creating account..." : "Accept invitation"}
								</Button>
							)}
						</form.Subscribe>
						<p className="text-muted-foreground text-xs">
							Already have an account?{" "}
							<a
								href={`/sign-in?invitationId=${invitationId}`}
								className="text-foreground underline"
							>
								Sign in to accept
							</a>
						</p>
					</CardFooter>
				</form>
			</Card>
		</main>
	);
}
