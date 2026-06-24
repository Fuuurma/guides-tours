import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<SignUpForm>({
		resolver: zodResolver(signUpSchema),
	});

	const onSubmit = handleSubmit(async (values) => {
		setError(null);
		setSubmitting(true);
		const { error: signUpError } = await authClient.signUp.email({
			email: values.email,
			password: values.password,
			name: values.name,
		});
		setSubmitting(false);
		if (signUpError) {
			setError(signUpError.message ?? "Sign up failed");
			return;
		}
		await navigate({ to: "/dashboard" });
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
				<form onSubmit={onSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								type="text"
								autoComplete="name"
								{...register("name")}
							/>
							{errors.name ? (
								<p className="text-destructive text-sm">
									{errors.name.message}
								</p>
							) : null}
						</div>
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
								autoComplete="new-password"
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
							{submitting ? "Creating account..." : "Create account"}
						</Button>
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
