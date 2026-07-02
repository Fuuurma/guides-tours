import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

// Landing page.
//
// Motion usage:
//   - hero block fades + slides up on mount (initial → in view)
//   - CTA buttons stagger in slightly after the hero
//   - footer line fades in last
// Keeps the motion subtle and short so it never blocks the user from
// clicking sign-up / sign-in.
function Home() {
	return (
		<main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">
			<div className="space-y-6">
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				>
					<h1 className="text-4xl font-bold tracking-tight">guides-tours</h1>
					<p className="text-muted-foreground mt-3 text-lg">
						Tour operator SaaS — schedules, guides, vehicles, OTA channels.
					</p>
				</motion.div>

				<motion.div
					className="flex gap-3"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
				>
					<Button asChild>
						<Link to="/sign-up">Create account</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link to="/sign-in">Sign in</Link>
					</Button>
				</motion.div>

				<motion.p
					className="text-muted-foreground text-xs"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.3, delay: 0.2 }}
				>
					Multi-tenant tour operator SaaS. Phase 4 complete — org + invite flow
					ready.
				</motion.p>
			</div>
		</main>
	);
}
