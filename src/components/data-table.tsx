import type { ReactNode } from "react";
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
}

interface DataTableProps<T> {
	data: T[] | undefined;
	columns: DataTableColumn<T>[];
	rowKey: (row: T) => string;
	isPending?: boolean;
	error?: Error | null;
	emptyMessage?: string;
}

/**
 * Renders a table with three states:
 *   - isPending: shows "Loading…"
 *   - error: shows the error message
 *   - empty: shows the empty message
 *   - otherwise: shows the rows
 */
export function DataTable<T>({
	data,
	columns,
	rowKey,
	isPending,
	error,
	emptyMessage = "No records yet.",
}: DataTableProps<T>) {
	if (isPending) {
		return (
			<p className="text-muted-foreground text-sm">Loading…</p>
		);
	}
	if (error) {
		return (
			<p className="text-destructive text-sm">
				Error: {error.message}
			</p>
		);
	}
	if (!data?.length) {
		return (
			<p className="text-muted-foreground text-sm">{emptyMessage}</p>
		);
	}
	return (
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
				{data.map((row) => (
					<TableRow key={rowKey(row)}>
						{columns.map((col) => (
							<TableCell key={col.key} className={col.className}>
								{col.render(row)}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}