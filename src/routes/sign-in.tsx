import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
	component: SignInPage,
});

const signInSchema = z.object({
	email: z.email("Invalid email"),
	password: z.string().min(1, "Password is required"),
});

type SignInForm = z.infer<typeof signInSchema>;

function SignInPage() {
	const navigate = useNavigate();
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
				setServerError(signInError.message ?? "Sign in failed");
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
		<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
			<Card>
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
					<CardDescription>Welcome back to guides-tours</CardDescription>
				</CardHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<CardContent className="space-y-4">
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
									inputProps={{
										type: "password",
										autoComplete: "current-password",
									}}
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
									disabled={!canSubmit || isSubmitting}
									className="w-full"
								>
									{isSubmitting ? "Signing in..." : "Sign in"}
								</Button>
							)}
						</form.Subscribe>
						<p className="text-muted-foreground text-sm">
							No account yet?{" "}
							<Link to="/sign-up" className="text-foreground underline">
								Create one
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</main>
	);
}
