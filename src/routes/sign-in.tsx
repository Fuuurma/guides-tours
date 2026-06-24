import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<SignInForm>({
		resolver: zodResolver(signInSchema),
	});

	const onSubmit = handleSubmit(async (values) => {
		setError(null);
		setSubmitting(true);
		const { error: signInError } = await authClient.signIn.email({
			email: values.email,
			password: values.password,
		});
		setSubmitting(false);
		if (signInError) {
			setError(signInError.message ?? "Sign in failed");
			return;
		}
		await navigate({ to: "/dashboard" });
	});

	return (
		<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
			<Card>
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
					<CardDescription>Welcome back to guides-tours</CardDescription>
				</CardHeader>
				<form onSubmit={onSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								{...register("email")}
							/>
							{errors.email ? (
								<p className="text-destructive text-sm">
									{errors.email.message}
								</p>
							) : null}
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								{...register("password")}
							/>
							{errors.password ? (
								<p className="text-destructive text-sm">
									{errors.password.message}
								</p>
							) : null}
						</div>
						{error ? (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						) : null}
					</CardContent>
					<CardFooter className="flex flex-col gap-3">
						<Button type="submit" disabled={submitting} className="w-full">
							{submitting ? "Signing in..." : "Sign in"}
						</Button>
						<p className="text-muted-foreground text-sm">
							No account yet?{" "}
							<a href="/sign-up" className="text-foreground underline">
								Create one
							</a>
						</p>
					</CardFooter>
				</form>
			</Card>
		</main>
	);
}
