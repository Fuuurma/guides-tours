import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">
			<div className="space-y-6">
				<div>
					<h1 className="text-4xl font-bold tracking-tight">guides-tours</h1>
					<p className="text-muted-foreground mt-3 text-lg">
						Tour operator SaaS — schedules, guides, vehicles, OTA channels.
					</p>
				</div>
				<div className="flex gap-3">
					<Button asChild>
						<Link to="/sign-up">Create account</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link to="/sign-in">Sign in</Link>
					</Button>
				</div>
				<p className="text-muted-foreground text-xs">
					Multi-tenant tour operator SaaS. Phase 4 complete — org + invite flow
					ready.
				</p>
			</div>
		</main>
	);
}
