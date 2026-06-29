import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { ALL_PROVIDERS, providerLabel } from "@/components/ota-providers";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCentsCompact } from "@/lib/format";
import { defaultDateRange } from "@/lib/date-range";
import { api } from "../../../convex/_generated/api";
import type { Booking } from "@/types/entities";

export const Route = createFileRoute("/dashboard/bookings")({
	component: BookingsPage,
});

const columns: DataTableColumn<Booking>[] = [
	{
		key: "date",
		header: "Date",
		render: (b) => b.date,
		searchValue: (b) => b.date,
	},
	{
		key: "tour",
		header: "Tour",
		render: (b) => (
			<Link
				to="/dashboard/bookings/$bookingId"
				params={{ bookingId: b._id }}
				className="text-link hover:underline"
			>
				{b.date} · {b.guests} guests
			</Link>
		),
		searchValue: (b) => `${b.date} ${b.guests}`,
	},
	{ key: "guests", header: "Guests", render: (b) => b.guests },
	{
		key: "amount",
		header: "Amount",
		render: (b) => formatCentsCompact(b.totalAmountCents),
	},
	{
		key: "source",
		header: "Source",
		render: (b) => <Badge variant="outline">{b.source}</Badge>,
		searchValue: (b) => b.source,
	},
	{
		key: "status",
		header: "Status",
		render: (b) => <StatusBadge status={b.status} />,
		searchValue: (b) => b.status,
	},
];

function BookingsPage() {
	const [source, setSource] = useState<string | null>(null);
	const [range, setRange] = useState(defaultDateRange);

	const args: {
		source?: string;
		dateFrom?: string;
		dateTo?: string;
	} = {};
	if (source) args.source = source;
	if (range.from) args.dateFrom = range.from;
	if (range.to) args.dateTo = range.to;

	const {
		data: bookings,
		isPending,
		error,
	} = useQuery(convexQuery(api.bookings.list, args));
	const itemCount = bookings?.items?.length ?? 0;
	const filtersActive = source !== null || range.from !== defaultDateRange().from;

	return (
		<ListPage
			title="Bookings"
			description={`${itemCount} booking${itemCount === 1 ? "" : "s"}${
				source || filtersActive
					? ` · filtered${source ? ` by ${source}` : ""}${
							range.from
								? ` from ${range.from}${range.to ? ` to ${range.to}` : ""}`
								: ""
						}`
					: ""
			}`}
			newTo="/dashboard/bookings/new"
			newLabel="+ New booking"
		>
			<div className="mb-4 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Source:</span>
					{["direct", ...ALL_PROVIDERS.map((p) => p.id)].map((s) => (
						<Button
							key={s}
							variant={source === s ? "default" : "outline"}
							size="sm"
							onClick={() => setSource(source === s ? null : s)}
							aria-pressed={source === s}
						>
							{s === "direct" ? "Direct" : providerLabel(s)}
						</Button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm">Date range:</span>
					<Input
						type="date"
						value={range.from}
						onChange={(e) => setRange({ ...range, from: e.target.value })}
						className="w-auto"
					/>
					<span className="text-muted-foreground text-sm">→</span>
					<Input
						type="date"
						value={range.to}
						onChange={(e) => setRange({ ...range, to: e.target.value })}
						className="w-auto"
					/>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setRange(defaultDateRange())}
					>
						Last 30 days
					</Button>
					{filtersActive && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setSource(null);
								setRange(defaultDateRange());
							}}
						>
							Clear all
						</Button>
					)}
				</div>
			</div>
			<DataTable
				data={bookings?.items as Booking[] | undefined}
				columns={columns}
				rowKey={(b) => b._id}
				isPending={isPending}
				error={error}
				emptyMessage={
					source
						? `No bookings from ${source} in this date range.`
						: "No bookings yet."
				}
				searchPlaceholder="Search by date, status, or source…"
			/>
		</ListPage>
	);
}
