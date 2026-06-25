import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
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

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					location.assign("/");
				},
			},
		});
	};

	if (userPending || orgPending) {
		return (
			<main className="mx-auto max-w-6xl px-4 py-12">
				<p className="text-muted-foreground">Loading...</p>
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
			<nav className="border-b bg-white">
				<div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
					<Link to="/dashboard" className="text-lg font-semibold">
						{org.name}
					</Link>
					<div className="flex gap-1">
						<Link
							to="/dashboard"
							className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
							activeOptions={{ exact: true }}
							activeProps={{ className: "bg-gray-100 font-medium" }}
						>
							Home
						</Link>
						<Link
							to="/dashboard/tours"
							className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
							activeProps={{ className: "bg-gray-100 font-medium" }}
						>
							Tours
						</Link>
						<Link
							to="/dashboard/bookings"
							className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
							activeProps={{ className: "bg-gray-100 font-medium" }}
						>
							Bookings
						</Link>
						<Link
							to="/dashboard/customers"
							className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
							activeProps={{ className: "bg-gray-100 font-medium" }}
						>
							Customers
						</Link>
						<Link
							to="/dashboard/vehicles"
							className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
							activeProps={{ className: "bg-gray-100 font-medium" }}
						>
							Vehicles
						</Link>
						<Link
							to="/dashboard/drivers"
							className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100"
							activeProps={{ className: "bg-gray-100 font-medium" }}
						>
							Drivers
						</Link>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<span className="text-muted-foreground text-sm">
							{user.name} · {org.role}
						</span>
						<Button variant="outline" size="sm" onClick={handleSignOut}>
							Sign out
						</Button>
					</div>
				</div>
			</nav>
			<main className="mx-auto max-w-6xl px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}
