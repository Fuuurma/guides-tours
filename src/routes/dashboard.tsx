import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async ({ context }) => {
		// Route-level auth guard — prevents unauthenticated users from
		// accessing any dashboard sub-route. The root route sets
		// `isAuthenticated` from the server-side token check.
		if (!context.isAuthenticated) {
			throw redirect({ to: "/sign-in" });
		}
	},
	component: DashboardLayout,
});

function DashboardLayout() {
	const navigate = useNavigate();
	const {
		data: user,
		isPending: userPending,
		error: userError,
	} = useQuery(convexQuery(api.auth.getCurrentUser, {}));
	const {
		data: org,
		isPending: orgPending,
		error: orgError,
	} = useQuery(convexQuery(api.organizations.activeOrganization, {}));

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
			<div className="min-h-screen lg:pl-64">
				<header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
					<Skeleton className="size-9 rounded-lg" />
					<Skeleton className="h-5 w-28" />
				</header>
				<aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-sidebar lg:flex">
					<div className="px-5 py-5">
						<Skeleton className="h-9 w-full rounded-lg" />
					</div>
					<div className="flex flex-1 flex-col gap-2 px-3">
						{["a", "b", "c", "d", "e", "f", "g", "h"].map((k) => (
							<Skeleton key={k} className="h-8 w-full rounded-lg" />
						))}
					</div>
				</aside>
				<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
					<div className="flex flex-col gap-4">
						<Skeleton className="h-8 w-1/3" />
						<Skeleton className="h-4 w-1/2" />
						<Skeleton className="h-32 w-full" />
					</div>
				</main>
			</div>
		);
	}

	if (userError || orgError) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-20">
				<ErrorBanner
					message="We couldn't load your dashboard."
					hint="Refresh the page to try again."
					action={
						<Button onClick={() => window.location.reload()}>Reload</Button>
					}
				/>
			</div>
		);
	}

	if (!user) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-20">
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
			</div>
		);
	}

	if (!org) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-20">
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
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-muted/20">
			<AppSidebar
				orgName={org.name}
				userName={user.name}
				role={org.role}
				onSignOut={handleSignOut}
			/>
			<div className="lg:pl-64">
				<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
