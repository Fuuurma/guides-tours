import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-up")({
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
				setServerError(signUpError.message ?? "Sign up failed");
				return;
			}
			// First user → land on onboarding to create the company org.
			await navigate({ to: "/onboarding" });
		},
	});

	return (
		<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
			<Card>
				<CardHeader>
					<CardTitle>Create your account</CardTitle>
					<CardDescription>
						Start managing tours with guides-tours
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
						<form.Field name="name">
							{(field) => (
								<FormField
									field={field}
									label="Name"
									inputProps={{
										type: "text",
										autoComplete: "name",
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
									inputProps={{
										type: "password",
										autoComplete: "new-password",
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
									{isSubmitting ? "Creating account..." : "Create account"}
								</Button>
							)}
						</form.Subscribe>
						<p className="text-muted-foreground text-sm">
							Already have an account?{" "}
							<Link to="/sign-in" className="text-foreground underline">
								Sign in
							</Link>
						</p>
					</CardFooter>
				</form>
			</Card>
		</main>
	);
}