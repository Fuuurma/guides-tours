import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	BarChart3,
	CalendarCheck2,
	CalendarDays,
	Check,
	ChevronRight,
	ClipboardList,
	Globe2,
	LayoutDashboard,
	LifeBuoy,
	LineChart,
	type LucideIcon,
	MapPin,
	Menu,
	MessageCircle,
	Radio,
	ReceiptText,
	Route as RouteIcon,
	ShieldCheck,
	Sparkles,
	UsersRound,
	WalletCards,
	X,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { ALL_PROVIDERS } from "@/components/ota-providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_IMAGES = {
	hero: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1600&q=85",
	coast:
		"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85",
	city: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85",
	guide:
		"https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=1200&q=85",
} as const;

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "guides.tours | Run the day. Sell the experience." },
			{
				name: "description",
				content:
					"The calm operating system for tour operators. Manage tours, bookings, schedules, teams, vehicles, payments, and OTA channels in one connected workspace.",
			},
		],
	}),
	component: Home,
});

function Home() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const closeMobileMenu = () => setMobileMenuOpen(false);
	const scrollToSection = (id: string) => {
		document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
		closeMobileMenu();
	};

	return (
		<main className="min-h-screen overflow-hidden bg-background text-foreground">
			<section className="relative isolate overflow-hidden bg-primary text-primary-foreground">
				<div className="pointer-events-none absolute -left-44 -top-40 size-[34rem] rounded-full bg-chart-1/15 blur-3xl" />
				<div className="pointer-events-none absolute -right-52 top-24 size-[38rem] rounded-full bg-chart-2/10 blur-3xl" />

				<header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
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

					<nav
						aria-label="Primary navigation"
						className="hidden items-center gap-8 text-sm text-primary-foreground/65 md:flex"
					>
						<a
							className="transition-colors hover:text-primary-foreground"
							href="#product"
						>
							Product
						</a>
						<a
							className="transition-colors hover:text-primary-foreground"
							href="#workflow"
						>
							How it works
						</a>
						<a
							className="transition-colors hover:text-primary-foreground"
							href="#features"
						>
							Features
						</a>
					</nav>

					<div className="hidden items-center gap-3 md:flex">
						<Button
							variant="ghost"
							className="text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground"
							asChild
						>
							<Link to="/sign-in">Sign in</Link>
						</Button>
						<Button
							variant="secondary"
							className="rounded-full px-5 shadow-lg shadow-black/10"
							asChild
						>
							<Link to="/sign-up">
								Start free <ArrowRight data-icon="inline-end" />
							</Link>
						</Button>
					</div>

					<Button
						variant="outline"
						size="icon"
						className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground md:hidden"
						aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
						aria-expanded={mobileMenuOpen}
						onClick={() => setMobileMenuOpen((open) => !open)}
					>
						{mobileMenuOpen ? <X /> : <Menu />}
					</Button>
				</header>

				{mobileMenuOpen ? (
					<div className="mx-5 flex flex-col gap-2 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/10 p-3 md:hidden">
						<Button
							variant="ghost"
							className="justify-start rounded-xl px-4 py-3 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
							onClick={() => scrollToSection("product")}
						>
							Product
						</Button>
						<Button
							variant="ghost"
							className="justify-start rounded-xl px-4 py-3 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
							onClick={() => scrollToSection("workflow")}
						>
							How it works
						</Button>
						<Button
							variant="ghost"
							className="justify-start rounded-xl px-4 py-3 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
							onClick={() => scrollToSection("features")}
						>
							Features
						</Button>
						<div className="mt-1 grid grid-cols-2 gap-2 border-t border-primary-foreground/10 pt-3">
							<Button
								variant="outline"
								className="bg-transparent text-primary-foreground"
								asChild
							>
								<Link to="/sign-in" onClick={closeMobileMenu}>
									Sign in
								</Link>
							</Button>
							<Button variant="secondary" asChild>
								<Link to="/sign-up" onClick={closeMobileMenu}>
									Start free
								</Link>
							</Button>
						</div>
					</div>
				) : null}

				<div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12 lg:px-10 lg:pb-32 lg:pt-24">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.55, ease: "easeOut" }}
					>
						<Badge
							variant="outline"
							className="rounded-full border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-primary-foreground/80"
						>
							<Sparkles />
							<span>Tour operations, without the chaos</span>
						</Badge>
						<h1 className="mt-7 max-w-2xl text-pretty text-5xl leading-[0.96] font-semibold tracking-[-0.06em] sm:text-6xl lg:text-[5.35rem]">
							Run the day.
							<br />
							Sell the experience.
						</h1>
						<p className="mt-7 max-w-xl text-lg leading-8 text-primary-foreground/68 sm:text-xl">
							The calm, connected workspace for tour operators who want fewer
							tabs, fewer surprises, and more time with their guests.
						</p>
						<div className="mt-9 flex flex-col gap-3 sm:flex-row">
							<Button
								size="lg"
								variant="secondary"
								className="h-12 rounded-full px-6 text-base shadow-xl shadow-black/15"
								asChild
							>
								<Link to="/sign-up">
									Build your operation <ArrowRight data-icon="inline-end" />
								</Link>
							</Button>
							<Button
								size="lg"
								variant="ghost"
								className="h-12 rounded-full border border-primary-foreground/20 px-6 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
								asChild
							>
								<a href="#product">
									See the workspace <ChevronRight data-icon="inline-end" />
								</a>
							</Button>
						</div>
						<div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-primary-foreground/55">
							<span className="inline-flex items-center gap-2">
								<Check className="size-4 text-chart-2" /> No credit card
								required
							</span>
							<span className="inline-flex items-center gap-2">
								<Check className="size-4 text-chart-2" /> Start with your next
								tour
							</span>
						</div>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 28, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ duration: 0.7, delay: 0.12, ease: "easeOut" }}
						className="relative"
					>
						<HeroVisual />
					</motion.div>
				</div>
			</section>

			<section className="border-b bg-card">
				<div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[1.1fr_2fr] lg:items-center lg:px-10">
					<div>
						<p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
							One connected operation
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							From first booking to final check-in, keep the important details
							in one place.
						</p>
					</div>
					<div className="flex flex-col gap-4">
						<div className="grid grid-cols-3 divide-x">
							<TrustMetric value="7" label="OTA channels" />
							<TrustMetric value="1" label="team workspace" />
							<TrustMetric value="24/7" label="clear visibility" />
						</div>
						<div className="flex flex-wrap items-center gap-2 border-t pt-4">
							<span className="mr-1 text-xs font-medium text-muted-foreground">
								Connected channels
							</span>
							{ALL_PROVIDERS.map((provider) => (
								<Badge
									key={provider.id}
									variant="outline"
									className="px-2 py-0.5 text-[10px] text-muted-foreground"
								>
									{provider.label}
								</Badge>
							))}
						</div>
					</div>
				</div>
			</section>

			<section id="product" className="scroll-mt-8 bg-background">
				<div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
					<SectionIntro
						eyebrow="A better operating rhythm"
						title="The operational layer your guests never have to see."
						description="guides.tours keeps the moving pieces of your business connected, so the experience feels effortless on the outside because the details are handled on the inside."
					/>
					<div className="mt-16 grid gap-5 lg:grid-cols-3">
						<FeatureCard
							icon={LayoutDashboard}
							number="01"
							title="See the whole operation"
							description="Tours, bookings, customers, and revenue stay connected instead of scattered across tabs."
							tone="ocean"
						/>
						<FeatureCard
							icon={CalendarCheck2}
							number="02"
							title="Keep every departure ready"
							description="Assign the right guides and vehicles, spot conflicts early, and give the team a clear plan for the day."
							tone="sun"
						/>
						<FeatureCard
							icon={Globe2}
							number="03"
							title="Turn demand into bookings"
							description="Publish direct booking pages and keep availability consistent across the channels guests already use."
							tone="coral"
						/>
					</div>
				</div>
			</section>

			<section className="bg-muted/35">
				<div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:px-10">
					<div className="relative min-h-[28rem] sm:min-h-[34rem]">
						<div className="absolute inset-x-8 top-0 bottom-8 overflow-hidden rounded-[2rem] border bg-card shadow-xl sm:inset-x-14">
							<img
								src={TOUR_IMAGES.coast}
								alt="A coastal tour boat moving through clear water"
								loading="lazy"
								className="size-full object-cover"
							/>
							<div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent" />
							<div className="absolute inset-x-5 bottom-5 rounded-2xl border border-primary-foreground/20 bg-primary/80 p-4 text-primary-foreground backdrop-blur-md sm:inset-x-7 sm:bottom-7 sm:p-5">
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="text-xs font-medium text-primary-foreground/60">
											Today · 11:00
										</p>
										<p className="mt-1 font-semibold">
											Coastal Kayak · 8 guests
										</p>
									</div>
									<Badge className="border-chart-2/30 bg-chart-2/15 text-chart-2">
										Ready
									</Badge>
								</div>
								<div className="mt-4 flex items-center gap-3 text-xs text-primary-foreground/65">
									<span className="inline-flex items-center gap-1.5">
										<UsersRound className="size-3.5" /> Mia Chen
									</span>
									<span className="size-1 rounded-full bg-primary-foreground/35" />
									<span className="inline-flex items-center gap-1.5">
										<MapPin className="size-3.5" /> Marina · Dock 4
									</span>
								</div>
							</div>
						</div>
						<div className="absolute bottom-0 left-0 w-44 overflow-hidden rounded-2xl border-8 border-muted/80 bg-card shadow-2xl sm:w-56">
							<img
								src={TOUR_IMAGES.guide}
								alt="A guide preparing a group for an outdoor experience"
								loading="lazy"
								className="aspect-[4/5] size-full object-cover"
							/>
						</div>
						<div className="absolute right-0 top-10 rounded-2xl border bg-card p-4 shadow-xl sm:right-1 sm:top-16">
							<div className="flex items-center gap-3">
								<span className="grid size-9 place-items-center rounded-xl bg-chart-2/10 text-chart-2">
									<ShieldCheck className="size-4" />
								</span>
								<div>
									<p className="text-xs font-semibold">No double bookings</p>
									<p className="mt-0.5 text-xs text-muted-foreground">
										One live availability view
									</p>
								</div>
							</div>
						</div>
					</div>

					<div>
						<SectionIntro
							eyebrow="Built around the day you actually run"
							title="The details are where great days are won."
							description="Your team should not need a meeting to understand what is happening next. Make the plan visible, assign ownership, and keep everyone moving."
						/>
						<div className="mt-9 flex flex-col gap-6">
							<BenefitRow
								icon={ClipboardList}
								title="A clear plan for every departure"
								description="Schedules, assignments, guest counts, and pickup details live together."
							/>
							<BenefitRow
								icon={MessageCircle}
								title="Fewer handoffs, better handovers"
								description="Keep guides, drivers, and office staff aligned before the first guest arrives."
							/>
							<BenefitRow
								icon={LineChart}
								title="A business you can read at a glance"
								description="See demand, revenue, and fill rates without rebuilding the spreadsheet."
							/>
						</div>
					</div>
				</div>
			</section>

			<section
				id="workflow"
				className="scroll-mt-8 bg-primary text-primary-foreground"
			>
				<div className="mx-auto grid max-w-7xl gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:px-10">
					<div>
						<SectionIntro
							eyebrow="How it works"
							title="From first click to final wave goodbye."
							description="Every step is designed to make the next one obvious. Your team always knows what is happening, what is next, and who owns it."
							invert
						/>
						<Button
							variant="secondary"
							size="lg"
							className="mt-9 rounded-full px-6"
							asChild
						>
							<Link to="/sign-up">
								Start building <ArrowRight data-icon="inline-end" />
							</Link>
						</Button>
					</div>
					<div className="grid gap-3">
						<FlowStep
							step="01"
							icon={Globe2}
							title="Publish your tours"
							description="Give guests a simple, beautiful way to discover and book your experiences."
						/>
						<FlowStep
							step="02"
							icon={ReceiptText}
							title="Capture every booking"
							description="Keep direct bookings, OTA reservations, payments, and customer details in sync."
						/>
						<FlowStep
							step="03"
							icon={UsersRound}
							title="Run the day with confidence"
							description="Your guides, drivers, vehicles, and schedules are ready before the first guest arrives."
						/>
					</div>
				</div>
			</section>

			<section id="features" className="scroll-mt-8 bg-muted/35">
				<div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
					<div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
						<SectionIntro
							eyebrow="One home for the details"
							title="Everything your team needs to keep moving."
							description="A focused toolkit for the work behind the scenes, from first inquiry to post-tour follow-up."
						/>
						<div className="flex items-center gap-3 text-sm text-muted-foreground">
							<span className="grid size-9 place-items-center rounded-full bg-chart-2/10 text-chart-2">
								<Radio className="size-4" />
							</span>
							<span>Live updates for the whole team</span>
						</div>
					</div>
					<div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<FeatureTile
							icon={BarChart3}
							title="Know what is working"
							description="Understand revenue, demand, and tour performance at a glance."
						/>
						<FeatureTile
							icon={UsersRound}
							title="Coordinate your crew"
							description="Manage guides, drivers, vacations, and availability without guesswork."
						/>
						<FeatureTile
							icon={WalletCards}
							title="Get paid smoothly"
							description="Collect payments through Stripe and keep every transaction attached to its booking."
						/>
						<FeatureTile
							icon={LifeBuoy}
							title="Keep guests informed"
							description="Use notification templates for timely confirmations, reminders, and updates."
						/>
						<FeatureTile
							icon={MapPin}
							title="Stay ready on the road"
							description="Keep vehicle details, assignments, and departure information in one place."
						/>
						<FeatureTile
							icon={LineChart}
							title="Grow with clarity"
							description="Replace operational noise with a system your whole team can trust."
						/>
					</div>
				</div>
			</section>

			<section className="bg-background">
				<div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:px-10">
					<div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
						<WorkspacePreview />
						<div>
							<Badge
								variant="outline"
								className="rounded-full border-chart-1/30 bg-chart-1/5 text-chart-1"
							>
								Sample workspace
							</Badge>
							<h2 className="mt-5 text-4xl leading-tight font-semibold tracking-[-0.05em] sm:text-5xl">
								A workspace your whole team can read in seconds.
							</h2>
							<p className="mt-5 text-lg leading-8 text-muted-foreground">
								Bring the day into focus: what is booked, what needs attention,
								and who is responsible for the next move.
							</p>
							<div className="mt-8 flex flex-col gap-3">
								<ChecklistItem>
									Bookings and payments stay attached
								</ChecklistItem>
								<ChecklistItem>
									Schedules and assignments share one view
								</ChecklistItem>
								<ChecklistItem>
									Customer and tour context is always close by
								</ChecklistItem>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="relative overflow-hidden bg-primary text-primary-foreground">
				<div className="pointer-events-none absolute -right-32 -top-48 size-[36rem] rounded-full border-[3rem] border-chart-1/10" />
				<div className="pointer-events-none absolute -bottom-56 left-1/3 size-[34rem] rounded-full bg-chart-1/10 blur-3xl" />
				<div className="relative mx-auto grid max-w-7xl gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-10">
					<div className="max-w-2xl">
						<Badge className="border-chart-1/30 bg-chart-1/15 text-chart-1">
							Ready when you are
						</Badge>
						<h2 className="mt-5 text-pretty text-4xl leading-tight font-semibold tracking-[-0.05em] sm:text-5xl">
							Your next great season starts with a clearer day.
						</h2>
						<p className="mt-5 max-w-xl text-lg leading-8 text-primary-foreground/68">
							Bring your tours, team, and bookings together. Start free and see
							what your operation feels like when everything is in sync.
						</p>
						<div className="mt-8 flex flex-col gap-3 sm:flex-row">
							<Button
								size="lg"
								variant="secondary"
								className="h-12 rounded-full px-6 text-base shadow-lg shadow-black/10"
								asChild
							>
								<Link to="/sign-up">
									Create your account <ArrowRight data-icon="inline-end" />
								</Link>
							</Button>
							<Button
								size="lg"
								variant="ghost"
								className="h-12 rounded-full px-6 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
								asChild
							>
								<Link to="/sign-in">Already have an account?</Link>
							</Button>
						</div>
					</div>

					<div className="rounded-3xl border border-primary-foreground/10 bg-primary-foreground/5 p-5 shadow-2xl shadow-black/10 backdrop-blur-sm sm:p-6">
						<div className="flex items-start justify-between gap-4 border-b border-primary-foreground/10 pb-5">
							<div>
								<p className="text-xs font-medium text-primary-foreground/50">
									A clearer next step
								</p>
								<p className="mt-1 text-lg font-semibold">
									Ready for tomorrow's departures
								</p>
							</div>
							<span className="grid size-11 place-items-center rounded-2xl bg-chart-2/15 text-chart-2">
								<CalendarCheck2 className="size-5" />
							</span>
						</div>
						<div className="mt-5 flex flex-col gap-3">
							<ReadinessRow icon={UsersRound} label="Guide assignments" />
							<ReadinessRow
								icon={RouteIcon}
								label="Vehicle and route details"
							/>
							<ReadinessRow icon={MessageCircle} label="Guest reminders" />
						</div>
						<div className="mt-5 flex items-center gap-2 rounded-xl bg-primary-foreground/10 px-3 py-2.5 text-xs text-primary-foreground/65">
							<ShieldCheck className="size-4 text-chart-2" />
							Everything important is in one place.
						</div>
					</div>
				</div>
			</section>

			<footer className="border-t">
				<div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
					<div className="flex items-center gap-3">
						<span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
							<MapPin className="size-4" />
						</span>
						<div>
							<p className="text-sm font-semibold">guides.tours</p>
							<p className="text-xs text-muted-foreground">
								The calm behind every great tour.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
						<a className="hover:text-foreground" href="#product">
							Product
						</a>
						<a className="hover:text-foreground" href="#workflow">
							How it works
						</a>
						<a className="hover:text-foreground" href="#features">
							Features
						</a>
						<Link className="hover:text-foreground" to="/sign-in">
							Sign in
						</Link>
						<Link className="hover:text-foreground" to="/sign-up">
							Start free
						</Link>
					</div>
					<p className="text-xs text-muted-foreground">© 2026 guides.tours</p>
				</div>
			</footer>
		</main>
	);
}

function HeroVisual() {
	return (
		<div className="relative min-h-[28rem] sm:min-h-[35rem]">
			<div className="absolute inset-0 overflow-hidden rounded-[2.5rem] border border-primary-foreground/15 bg-primary-foreground/10 shadow-2xl shadow-black/20">
				<img
					src={TOUR_IMAGES.hero}
					alt="Guests exploring a mountain landscape on a guided tour"
					fetchPriority="high"
					className="size-full object-cover"
				/>
				<div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/15 to-primary/10" />
				<div className="absolute inset-x-5 top-5 flex items-center justify-between gap-4 sm:inset-x-7 sm:top-7">
					<Badge className="border-primary-foreground/20 bg-primary/60 text-primary-foreground backdrop-blur-md">
						<Radio /> Live operation
					</Badge>
					<span className="rounded-full border border-primary-foreground/20 bg-primary/40 px-3 py-1.5 text-[11px] font-medium text-primary-foreground/75 backdrop-blur-md">
						Tuesday · June 24
					</span>
				</div>
				<div className="absolute inset-x-5 bottom-5 max-w-xs sm:inset-x-7 sm:bottom-7">
					<p className="text-sm font-medium text-primary-foreground/65">
						The day at a glance
					</p>
					<p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-primary-foreground sm:text-4xl">
						Beautiful outside. Ready inside.
					</p>
				</div>
			</div>
			<div className="absolute -bottom-5 left-4 w-[92%] overflow-hidden rounded-2xl border bg-card p-3 text-foreground shadow-2xl shadow-black/25 sm:bottom-4 sm:left-[-2rem] sm:w-[78%] sm:p-4">
				<div className="flex items-center justify-between gap-3 border-b pb-3">
					<div className="flex items-center gap-2.5">
						<span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
							<LayoutDashboard className="size-4" />
						</span>
						<div>
							<p className="text-[10px] font-semibold">Operations overview</p>
							<p className="text-[9px] text-muted-foreground">
								Sample workspace
							</p>
						</div>
					</div>
					<Badge variant="outline" className="text-[9px]">
						This week
					</Badge>
				</div>
				<div className="grid grid-cols-3 gap-2 py-3">
					<MiniStat label="Bookings" value="128" trend="+18%" />
					<MiniStat label="Revenue" value="€12.4k" trend="+24%" />
					<MiniStat label="Ready" value="24" trend="Tours live" />
				</div>
				<div className="grid grid-cols-[1.2fr_0.8fr] gap-2">
					<div className="rounded-xl border bg-muted/40 p-3">
						<div className="flex items-center justify-between">
							<p className="text-[10px] font-semibold">Bookings overview</p>
							<BarChart3 className="size-3.5 text-chart-2" />
						</div>
						<div className="mt-4 flex h-12 items-end gap-1">
							{[35, 52, 42, 68, 55, 78, 92].map((height, index) => (
								<div key={height} className="flex h-full flex-1 items-end">
									<div
										className={cn(
											"w-full rounded-t-sm",
											index === 6 ? "bg-chart-1" : "bg-chart-2/65",
										)}
										style={{ height: `${height}%` }}
									/>
								</div>
							))}
						</div>
					</div>
					<div className="rounded-xl border bg-muted/40 p-3">
						<div className="flex items-center justify-between">
							<p className="text-[10px] font-semibold">Today</p>
							<CalendarDays className="size-3.5 text-muted-foreground" />
						</div>
						<div className="mt-3 flex flex-col gap-2.5">
							<ScheduleLine
								title="Old Town Walk"
								time="09:30"
								color="bg-chart-1"
							/>
							<ScheduleLine
								title="Coastal Kayak"
								time="11:00"
								color="bg-chart-2"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function SectionIntro({
	eyebrow,
	title,
	description,
	invert = false,
}: {
	eyebrow: string;
	title: string;
	description: string;
	invert?: boolean;
}) {
	return (
		<motion.div
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="max-w-2xl"
		>
			<p
				className={cn(
					"text-sm font-semibold tracking-[0.18em] uppercase",
					invert ? "text-primary-foreground/55" : "text-chart-1",
				)}
			>
				{eyebrow}
			</p>
			<h2
				className={cn(
					"mt-4 text-pretty text-4xl leading-tight font-semibold tracking-[-0.05em] sm:text-5xl",
					invert && "text-primary-foreground",
				)}
			>
				{title}
			</h2>
			<p
				className={cn(
					"mt-5 text-lg leading-8 text-muted-foreground",
					invert && "text-primary-foreground/65",
				)}
			>
				{description}
			</p>
		</motion.div>
	);
}

function TrustMetric({ value, label }: { value: string; label: string }) {
	return (
		<div className="flex flex-col items-center gap-1 px-3 text-center first:pl-0 last:pr-0">
			<p className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
				{value}
			</p>
			<p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
		</div>
	);
}

function FeatureCard({
	icon: Icon,
	number,
	title,
	description,
	tone,
}: {
	icon: LucideIcon;
	number: string;
	title: string;
	description: string;
	tone: "ocean" | "sun" | "coral";
}) {
	const toneClasses = {
		ocean: "bg-chart-2/10 text-chart-2",
		sun: "bg-chart-4/15 text-chart-4",
		coral: "bg-chart-1/10 text-chart-1",
	} as const;

	return (
		<motion.article
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.2 }}
			transition={{ duration: 0.45, ease: "easeOut" }}
			className="rounded-3xl border bg-card p-7 shadow-sm transition-shadow hover:shadow-xl hover:shadow-primary/5"
		>
			<div className="flex items-start justify-between gap-4">
				<span
					className={cn(
						"grid size-12 place-items-center rounded-2xl",
						toneClasses[tone],
					)}
				>
					<Icon className="size-5" />
				</span>
				<span className="font-mono text-xs text-muted-foreground">
					{number}
				</span>
			</div>
			<h3 className="mt-16 text-xl font-semibold tracking-tight">{title}</h3>
			<p className="mt-3 leading-7 text-muted-foreground">{description}</p>
			<div className="mt-7 flex items-center gap-2 text-sm font-semibold text-primary">
				<Check className="size-4" />
				One clear source of truth
			</div>
		</motion.article>
	);
}

function BenefitRow({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="flex gap-4">
			<span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
				<Icon className="size-5" />
			</span>
			<div>
				<h3 className="font-semibold">{title}</h3>
				<p className="mt-1.5 leading-6 text-muted-foreground">{description}</p>
			</div>
		</div>
	);
}

function FlowStep({
	step,
	icon: Icon,
	title,
	description,
}: {
	step: string;
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="group flex gap-5 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-5 transition-colors hover:bg-primary-foreground/10 sm:items-center">
			<div className="flex shrink-0 flex-col items-center gap-2">
				<span className="grid size-12 place-items-center rounded-2xl bg-primary-foreground text-primary">
					<Icon className="size-5" />
				</span>
				<span className="font-mono text-[10px] text-primary-foreground/40">
					{step}
				</span>
			</div>
			<div>
				<h3 className="font-semibold">{title}</h3>
				<p className="mt-1 text-sm leading-6 text-primary-foreground/60">
					{description}
				</p>
			</div>
			<ArrowRight className="mt-1 ml-auto hidden size-5 shrink-0 text-primary-foreground/40 transition-transform group-hover:translate-x-1 sm:block" />
		</div>
	);
}

function FeatureTile({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-2xl border bg-card p-6 transition-colors hover:border-primary/20 hover:bg-background">
			<span className="grid size-10 place-items-center rounded-xl bg-primary/5 text-primary">
				<Icon className="size-5" />
			</span>
			<h3 className="mt-5 font-semibold">{title}</h3>
			<p className="mt-2 text-sm leading-6 text-muted-foreground">
				{description}
			</p>
		</div>
	);
}

function ReadinessRow({
	icon: Icon,
	label,
}: {
	icon: LucideIcon;
	label: string;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-primary-foreground/10 bg-primary-foreground/5 px-3 py-3">
			<span className="grid size-8 place-items-center rounded-lg bg-primary-foreground/10 text-primary-foreground/75">
				<Icon className="size-4" />
			</span>
			<span className="text-sm font-medium text-primary-foreground/80">
				{label}
			</span>
			<span className="ml-auto inline-flex items-center gap-1.5 text-xs text-chart-2">
				<Check className="size-3.5" /> Ready
			</span>
		</div>
	);
}

function WorkspacePreview() {
	return (
		<div className="overflow-hidden rounded-[2rem] border bg-primary p-3 shadow-2xl shadow-primary/15 sm:p-4">
			<div className="flex items-center justify-between px-2 pb-3 sm:px-3">
				<div className="flex items-center gap-2.5">
					<span className="grid size-8 place-items-center rounded-lg bg-primary-foreground/10 text-primary-foreground">
						<MapPin className="size-4" />
					</span>
					<div>
						<p className="text-[10px] font-semibold text-primary-foreground/80">
							Good morning, Alex
						</p>
						<p className="text-[9px] text-primary-foreground/45">
							Your operation at a glance
						</p>
					</div>
				</div>
				<span className="inline-flex items-center gap-1.5 text-[9px] text-primary-foreground/55">
					<span className="size-1.5 rounded-full bg-chart-2" /> Live workspace
				</span>
			</div>
			<div className="overflow-hidden rounded-2xl bg-background">
				<div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
					<div>
						<p className="text-[10px] font-medium text-muted-foreground">
							Tuesday, June 24
						</p>
						<p className="mt-0.5 text-sm font-semibold">Operations overview</p>
					</div>
					<Badge
						variant="outline"
						className="hidden text-[10px] sm:inline-flex"
					>
						This week
					</Badge>
				</div>
				<div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
					<PreviewMetric label="Bookings" value="128" trend="+18%" />
					<PreviewMetric label="Revenue" value="€12.4k" trend="+24%" />
					<PreviewMetric label="Tours live" value="24" trend="Ready" />
					<PreviewMetric label="Fill rate" value="86%" trend="+8%" />
				</div>
				<div className="grid gap-3 px-3 pb-3 sm:grid-cols-[1.25fr_0.75fr] sm:px-4 sm:pb-4">
					<div className="rounded-xl border bg-card p-3 sm:p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs font-semibold">Bookings overview</p>
								<p className="mt-1 text-[10px] text-muted-foreground">
									Last 7 days
								</p>
							</div>
							<BarChart3 className="size-4 text-chart-2" />
						</div>
						<div className="mt-5 flex h-24 items-end gap-1.5 sm:gap-2">
							{[38, 52, 45, 68, 58, 78, 92].map((height, index) => (
								<div key={height} className="flex h-full flex-1 items-end">
									<div
										className={cn(
											"w-full rounded-t-md",
											index === 6 ? "bg-chart-1" : "bg-chart-2/65",
										)}
										style={{ height: `${height}%` }}
									/>
								</div>
							))}
						</div>
						<div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
							<span>Mon</span>
							<span>Tue</span>
							<span>Wed</span>
							<span>Thu</span>
							<span>Fri</span>
							<span>Sat</span>
							<span>Sun</span>
						</div>
					</div>
					<div className="rounded-xl border bg-card p-3 sm:p-4">
						<div className="flex items-center justify-between">
							<p className="text-xs font-semibold">Today</p>
							<CalendarDays className="size-4 text-muted-foreground" />
						</div>
						<div className="mt-4 flex flex-col gap-3">
							<ScheduleLine
								title="Old Town Walk"
								time="09:30"
								color="bg-chart-1"
							/>
							<ScheduleLine
								title="Coastal Kayak"
								time="11:00"
								color="bg-chart-2"
							/>
							<ScheduleLine
								title="Wine Country"
								time="15:30"
								color="bg-chart-4"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function MiniStat({
	label,
	value,
	trend,
}: {
	label: string;
	value: string;
	trend: string;
}) {
	return (
		<div className="rounded-xl border bg-muted/35 p-2.5">
			<p className="text-[9px] text-muted-foreground">{label}</p>
			<p className="mt-0.5 text-sm font-semibold tracking-tight">{value}</p>
			<p className="mt-0.5 text-[9px] font-medium text-chart-2">{trend}</p>
		</div>
	);
}

function PreviewMetric({
	label,
	value,
	trend,
}: {
	label: string;
	value: string;
	trend: string;
}) {
	return (
		<div className="rounded-xl border bg-card p-3">
			<p className="text-[10px] text-muted-foreground">{label}</p>
			<p className="mt-1 text-base font-semibold tracking-tight sm:text-lg">
				{value}
			</p>
			<p className="mt-1 text-[9px] font-medium text-chart-2">{trend}</p>
		</div>
	);
}

function ScheduleLine({
	title,
	time,
	color,
}: {
	title: string;
	time: string;
	color: string;
}) {
	return (
		<div className="flex items-center gap-2.5">
			<span className={cn("size-2 shrink-0 rounded-full", color)} />
			<div className="min-w-0">
				<p className="truncate text-[10px] font-semibold">{title}</p>
				<p className="mt-0.5 text-[9px] text-muted-foreground">
					{time} · 8 guests
				</p>
			</div>
		</div>
	);
}

function ChecklistItem({ children }: { children: string }) {
	return (
		<div className="flex items-center gap-3 text-sm text-muted-foreground">
			<span className="grid size-6 place-items-center rounded-full bg-chart-2/10 text-chart-2">
				<Check className="size-3.5" />
			</span>
			{children}
		</div>
	);
}
