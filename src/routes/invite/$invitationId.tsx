import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// Fetch the invitation metadata so we know the email + org name.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const { data } = await authClient.organization.getInvitation({
				query: { id: invitationId },
			});
			if (cancelled) return;
			if (!data) {
				setError("Invitation not found or already used.");
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

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<SignUpForm>({
		resolver: zodResolver(signUpSchema),
	});

	const onSubmit = handleSubmit(async (values) => {
		setError(null);
		if (!invite) {
			setError("Invitation not loaded yet");
			return;
		}
		setSubmitting(true);
		try {
			// Sign up first (matches the invite's email).
			const signUp = await authClient.signUp.email({
				email: invite.email,
				password: values.password,
				name: values.name,
			});
			if (signUp.error) {
				setError(signUp.error.message ?? "Sign up failed");
				setSubmitting(false);
				return;
			}
			// Then accept the invite.
			const accept = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (accept.error) {
				setError(accept.error.message ?? "Could not accept invitation");
				setSubmitting(false);
				return;
			}
			window.location.assign("/dashboard");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to accept invite");
			setSubmitting(false);
		}
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
							: (error ?? "Loading invitation...")}
					</CardDescription>
				</CardHeader>
				<form onSubmit={onSubmit}>
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
						<div className="space-y-2">
							<Label htmlFor="name">Your name</Label>
							<Input id="name" type="text" {...register("name")} />
							{errors.name ? (
								<p className="text-destructive text-sm">
									{errors.name.message}
								</p>
							) : null}
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input id="password" type="password" {...register("password")} />
							{errors.password ? (
								<p className="text-destructive text-sm">
									{errors.password.message}
								</p>
							) : null}
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirm">Confirm password</Label>
							<Input id="confirm" type="password" {...register("confirm")} />
							{errors.confirm ? (
								<p className="text-destructive text-sm">
									{errors.confirm.message}
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
						<Button
							type="submit"
							disabled={submitting || !invite}
							className="w-full"
						>
							{submitting ? "Creating account..." : "Accept invitation"}
						</Button>
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
