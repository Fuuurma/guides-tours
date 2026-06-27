import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { NavBar } from "@/components/nav-bar";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/dashboard")({
	component: DashboardLayout,
});

function DashboardLayout() {
	const navigate = useNavigate();
	const { data: user, isPending: userPending } = useQuery(
		convexQuery(api.auth.getCurrentUser, {}),
	);
	const { data: org, isPending: orgPending } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);

	if (userPending || orgPending) {
		return (
			<main className="mx-auto max-w-6xl px-4 py-12">
				<p className="text-muted-foreground">Loading…</p>
			</main>
		);
	}

	if (!user) {
		return (
			<main className="mx-auto max-w-6xl px-4 py-12">
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

	if (!org) {
		return (
			<main className="mx-auto max-w-6xl px-4 py-12">
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
		<div className="min-h-screen">
			<Toaster />
			<NavBar orgName={org.name} userName={user.name} role={org.role} />
			<main className="mx-auto max-w-6xl px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}