import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/dashboard")({
	component: DashboardPage,
});

function DashboardPage() {
	const navigate = useNavigate();
	const { data: user, isPending } = useQuery(
		convexQuery(api.auth.getCurrentUser, {}),
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

	if (isPending) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
				<p className="text-muted-foreground">Loading...</p>
			</main>
		);
	}

	if (!user) {
		return (
			<main className="mx-auto max-w-2xl px-4 py-12">
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

	return (
		<main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
			<Card>
				<CardHeader>
					<CardTitle>Welcome, {user.name}</CardTitle>
					<CardDescription>{user.email}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Auth roundtrip working. Phase 2 complete.
					</p>
					<Button variant="outline" onClick={handleSignOut}>
						Sign out
					</Button>
				</CardContent>
			</Card>
		</main>
	);
}
