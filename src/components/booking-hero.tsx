// Public booking hero: org identity masthead above the booking form.
// Photography leads (DESIGN.md) — the band is deterministic placeholder
// photography per org slug until operators can upload cover photos, so
// it is aria-hidden decor, never captioned as the operator's own.
// The metric strip reuses TrustMetric with numbers derived from the
// org's real tour list — no invented proof.
import { TrustMetric } from "@/components/trust-metric";
import {
	type BookingHeroTour,
	deriveBookingHeroStats,
} from "@/lib/booking-hero-stats";

export function BookingHero({
	organizationName,
	slug,
	tours,
}: {
	organizationName: string;
	slug: string;
	tours: BookingHeroTour[];
}) {
	const stats = deriveBookingHeroStats(tours);
	return (
		<header className="mb-8">
			<div
				aria-hidden="true"
				className="relative mb-6 overflow-hidden rounded-2xl border"
			>
				<img
					src={`https://picsum.photos/seed/guides-tours-${encodeURIComponent(slug)}/1600/500`}
					alt=""
					loading="eager"
					className="h-44 w-full object-cover sm:h-56"
				/>
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
			</div>
			<p className="text-xs font-semibold tracking-[0.2em] text-chart-1 uppercase">
				Direct booking
			</p>
			<h1 className="mt-2 font-display text-3xl font-normal tracking-tight sm:text-4xl">
				Book with{" "}
				<span className="italic text-chart-1">{organizationName}</span>
			</h1>
			<p className="mt-2 max-w-xl text-base text-muted-foreground">
				Request a tour — no account required. The operator confirms before it is
				final.
			</p>
			{stats.tourCount > 0 && stats.maxGroup !== null ? (
				<div className="mt-6 grid grid-cols-3 divide-x rounded-xl border bg-card py-4">
					<TrustMetric
						value={stats.tourCount}
						label={stats.tourCount === 1 ? "tour offered" : "tours offered"}
					/>
					<TrustMetric
						valueText={stats.fromPrice ?? "Prices vary"}
						label="starting price per guest"
					/>
					<TrustMetric value={stats.maxGroup} label="largest group welcome" />
				</div>
			) : null}
		</header>
	);
}
