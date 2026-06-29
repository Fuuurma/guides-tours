import { type ReactNode, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
	key: string;
	header: string;
	render: (row: T) => ReactNode;
	className?: string;
	/**
	 * Optional custom filter. If provided, this value is what's matched
	 * against the search query (defaults to no filtering if missing).
	 */
	searchValue?: (row: T) => string;
}

interface DataTableProps<T> {
	data: T[] | undefined;
	columns: DataTableColumn<T>[];
	rowKey: (row: T) => string;
	isPending?: boolean;
	error?: Error | null;
	emptyMessage?: string;
	/** Show a search input that filters rows by case-insensitive substring. */
	searchPlaceholder?: string;
}

/**
 * Renders a table with three states:
 *   - isPending: shows "Loading…"
 *   - error: shows the error message
 *   - empty: shows the empty message
 *   - otherwise: shows the rows
 *
 * When `searchPlaceholder` is provided, a search input is shown above
 * the table. Rows are filtered by case-insensitive substring match
 * across all column `searchValue` outputs (joined with space).
 */
export function DataTable<T>({
	data,
	columns,
	rowKey,
	isPending,
	error,
	emptyMessage = "No records yet.",
	searchPlaceholder,
}: DataTableProps<T>) {
	const [query, setQuery] = useState("");

	const filtered = (() => {
		if (!data) return undefined;
		const q = query.trim().toLowerCase();
		if (!q) return data;
		return data.filter((row) => {
			const parts = columns
				.map((c) => (c.searchValue ? c.searchValue(row) : ""))
				.join(" ")
				.toLowerCase();
			return parts.includes(q);
		});
	})();

	if (isPending) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-3/4" />
			</div>
		);
	}
	if (error) {
		return <ErrorBanner message={`Error: ${error.message}`} />;
	}
	if (!data?.length) {
		return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
	}

	const showing = filtered ?? [];
	return (
		<div className="space-y-3">
			{searchPlaceholder && (
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={searchPlaceholder}
					aria-label={searchPlaceholder}
				/>
			)}
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((col) => (
							<TableHead key={col.key} className={col.className}>
								{col.header}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{showing.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className="text-muted-foreground text-sm text-center"
							>
								No matches.
							</TableCell>
						</TableRow>
					) : (
						showing.map((row) => (
							<TableRow key={rowKey(row)}>
								{columns.map((col) => (
									<TableCell key={col.key} className={col.className}>
										{col.render(row)}
									</TableCell>
								))}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
