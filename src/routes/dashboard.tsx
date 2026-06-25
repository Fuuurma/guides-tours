import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { authClient } from "@/lib/auth-client";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/dashboard")({
	component: DashboardPage,
});

function DashboardPage() {
	const navigate = useNavigate();
	const { data: user, isPending: userPending } = useQuery(
		convexQuery(api.auth.getCurrentUser, {}),
	);
	const { data: org, isPending: orgPending } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					location.assign("/");
				},
			},
		});
	};

	if (userPending) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<p className="text-muted-foreground">Loading...</p>
			</main>
		);
	}

	if (!user) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<Toaster />
				<Card>
					<CardHeader>
						<CardTitle>Not signed in</CardTitle>
						<CardDescription>
							You need to sign in to view the dashboard.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => navigate({ to: "/sign-in" })}>
							Go to sign in
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	if (orgPending) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<Toaster />
				<p className="text-muted-foreground">Loading workspace...</p>
			</main>
		);
	}

	// No active organization — send to onboarding.
	if (!org) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<Toaster />
				<Card>
					<CardHeader>
						<CardTitle>Set up your company</CardTitle>
						<CardDescription>
							Welcome, {user.name}. Create your organization to get started.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => navigate({ to: "/onboarding" })}>
							Set up organization
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
			<Toaster />
			<Card>
				<CardHeader>
					<CardTitle>{org.name}</CardTitle>
					<CardDescription>
						{user.name} ({user.email}) · role:{" "}
						<span className="font-mono">{org.role}</span> · {org.memberCount}{" "}
						member
						{org.memberCount === 1 ? "" : "s"}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="bg-muted rounded-md p-3 font-mono text-xs">
						slug: /{org.slug}
					</div>
					<p className="text-muted-foreground text-sm">
						Phase 4 wired. Phase 5+ will add tour scheduling, guides, OTA
						integrations, and Stripe.
					</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={async () => {
								const invite = await authClient.organization.inviteMember({
									email: window.prompt("Invite email:") ?? "",
									role: "member",
								});
								if (invite.error) {
									toast.error(invite.error.message);
									return;
								}
								toast.success(
									`Invite created (id ${invite.data?.id}). Stub: ${invite.data?.id ? "no email sent yet (Phase 7 wires SES)" : ""}`,
								);
							}}
						>
							Invite member
						</Button>
						<Button variant="outline" onClick={handleSignOut}>
							Sign out
						</Button>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
