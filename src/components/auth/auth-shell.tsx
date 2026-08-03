import { Link } from "@tanstack/react-router";
import { Check, MapPin } from "lucide-react";
import type * as React from "react";

// Shared split-screen shell for all auth pages (sign-in, sign-up,
// onboarding, invite, forgot/reset password).
//
// Desktop: dark brand panel on the left (bg-primary + landing imagery +
// serif accent + trust bullets) and a calm light form panel on the right.
// Mobile: brand collapses to a slim bar above the form.
//
// The design mirrors src/routes/index.tsx (landing page) so the auth
// experience feels like part of the same product, not a bare form.

const BRAND_IMAGE = "/landing/hero.jpg";

const TRUST_BULLETS = [
	"Live availability shared with every channel",
	"Assignments your whole team can read",
	"Payments tied to each booking",
];

export function AuthShell({
	title,
	serifAccent,
	description,
	children,
	backToLanding = true,
}: {
	title: string;
	serifAccent?: string;
	description?: string;
	children: React.ReactNode;
	backToLanding?: boolean;
}) {
	return (
		<main className="min-h-screen bg-background font-landing text-foreground antialiased lg:grid lg:grid-cols-[1fr_1fr]">
			{/* Brand panel — desktop only */}
			<section className="relative isolate hidden overflow-hidden bg-primary text-primary-foreground lg:block">
				<img
					src={BRAND_IMAGE}
					alt=""
					aria-hidden
					className="absolute inset-0 size-full object-cover"
					loading="lazy"
					width={1600}
					height={1067}
				/>
				<div
					aria-hidden
					className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/85 to-primary/60"
				/>
				<div
					aria-hidden
					className="absolute inset-0 bg-gradient-to-t from-primary/90 via-transparent to-primary/40"
				/>

				<div className="relative z-10 flex h-full flex-col justify-between p-10">
					<div>
						<Link
							to="/"
							className="flex items-center gap-3"
							aria-label="guides.tours home"
						>
							<span className="grid size-10 place-items-center rounded-xl bg-primary-foreground text-primary shadow-lg shadow-black/10">
								<MapPin className="size-5" strokeWidth={2.5} />
							</span>
							<span className="text-base font-semibold tracking-tight">
								guides<span className="text-chart-1">.</span>tours
							</span>
						</Link>

						<h2 className="mt-14 max-w-md text-pretty text-4xl leading-[1.05] font-semibold tracking-[-0.05em]">
							The calm behind every{" "}
							<span className="font-display font-normal italic tracking-normal text-chart-1">
								great tour.
							</span>
						</h2>
						<p className="mt-5 max-w-sm text-base leading-7 text-primary-foreground/70">
							Run tours, bookings, schedules, and your whole team from one
							connected workspace.
						</p>
					</div>

					<ul className="flex flex-col gap-3">
						{TRUST_BULLETS.map((bullet) => (
							<li
								key={bullet}
								className="flex items-center gap-2.5 text-sm text-primary-foreground/75"
							>
								<span className="grid size-5 shrink-0 place-items-center rounded-full bg-chart-2/20 text-chart-2">
									<Check className="size-3" strokeWidth={3} />
								</span>
								{bullet}
							</li>
						))}
					</ul>
				</div>
			</section>

			{/* Form panel */}
			<section className="flex min-h-screen flex-col">
				{/* Slim brand bar — mobile only */}
				<div className="flex items-center justify-between px-5 py-4 lg:hidden">
					<Link
						to="/"
						className="flex items-center gap-2.5"
						aria-label="guides.tours home"
					>
						<span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
							<MapPin className="size-4" strokeWidth={2.5} />
						</span>
						<span className="text-sm font-semibold tracking-tight">
							guides<span className="text-chart-1">.</span>tours
						</span>
					</Link>
					{backToLanding && (
						<Link
							to="/"
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Back to home
						</Link>
					)}
				</div>

				<div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
					<div className="w-full max-w-sm">
						<div className="mb-7">
							<h1 className="text-3xl font-semibold tracking-[-0.05em]">
								{title}{" "}
								{serifAccent ? (
									<span className="font-display font-normal italic tracking-normal text-chart-1">
										{serifAccent}
									</span>
								) : null}
							</h1>
							{description ? (
								<p className="mt-2.5 text-base leading-6 text-muted-foreground">
									{description}
								</p>
							) : null}
						</div>
						{children}
					</div>
				</div>

				{/* Footer — desktop back-to-home */}
				{backToLanding && (
					<div className="hidden px-8 pb-8 lg:block">
						<Link
							to="/"
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							← Back to home
						</Link>
					</div>
				)}
			</section>
		</main>
	);
}
