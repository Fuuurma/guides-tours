import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PublicBookingLinkBar({ slug }: { slug: string }) {
	// F114: the first render must be identical on server and client.
	// Computing the URL behind a `typeof window` check made SSR print
	// an empty input with a disabled Copy button; patching only the
	// server branch left render output environment-dependent (a
	// hydration mismatch if this ever SSRs with org data). Render the
	// stable relative path first — a real, resolvable link — then
	// upgrade to the absolute URL after mount so copies are shareable.
	const [origin, setOrigin] = useState("");
	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);
	const url = `${origin}/book/${slug}`;
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success("Link copied");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Could not copy — please copy manually");
		}
	};

	return (
		<div className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<CalendarDays className="size-4 shrink-0 text-muted-foreground" />
				<span className="shrink-0 font-medium">Direct booking link</span>
			</div>
			<Input
				readOnly
				value={url}
				onClick={(e) => e.currentTarget.select()}
				className="min-w-0 font-mono text-xs"
				aria-label="Direct booking URL"
			/>
			<div className="flex shrink-0 gap-2">
				<Button onClick={handleCopy} disabled={!url} size="sm">
					{copied ? "Copied" : "Copy"}
				</Button>
				<Button variant="outline" asChild size="sm">
					<Link to="/book/$slug" params={{ slug }}>
						Open
					</Link>
				</Button>
			</div>
		</div>
	);
}
