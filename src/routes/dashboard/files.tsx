import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/files")({
	component: FilesPage,
});

type FileRow = {
	_id: Id<"files">;
	filename: string;
	contentType: string;
	size: number;
	purpose: string;
	uploadedBy?: string;
	createdAt: number;
	url: string | null;
};

function formatBytes(size: number): string {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FilesPage() {
	const [purpose, setPurpose] = useState("all");
	const [pendingId, setPendingId] = useState<string | null>(null);
	const {
		data: files,
		isPending,
		error,
	} = useQuery(convexQuery(api.files.list, {}));
	const removeFile = useMutation(api.files.remove);

	const items = (files ?? []) as FileRow[];

	const purposes = useMemo(() => {
		const set = new Set<string>(["tour-image"]);
		for (const f of items) {
			if (f.purpose) set.add(f.purpose);
		}
		return Array.from(set).sort();
	}, [items]);

	const visible = useMemo(() => {
		if (purpose === "all") return items;
		return items.filter((f) => f.purpose === purpose);
	}, [items, purpose]);

	const onDelete = async (id: Id<"files">, label: string) => {
		if (
			!window.confirm(
				`Delete "${label}"? This removes the stored file and linked gallery images.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeFile({ fileId: id });
			toast.success("File deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

	const columns: DataTableColumn<FileRow>[] = [
		{
			key: "filename",
			header: "File",
			render: (f) =>
				f.url ? (
					<a
						href={f.url}
						target="_blank"
						rel="noreferrer"
						className="font-medium text-link hover:underline"
					>
						{f.filename}
					</a>
				) : (
					<span className="font-medium">{f.filename}</span>
				),
			searchValue: (f) => f.filename,
		},
		{
			key: "purpose",
			header: "Purpose",
			render: (f) => <Badge variant="secondary">{f.purpose}</Badge>,
			searchValue: (f) => f.purpose,
		},
		{
			key: "type",
			header: "Type",
			render: (f) => (
				<span className="text-muted-foreground text-xs">{f.contentType}</span>
			),
			searchValue: (f) => f.contentType,
		},
		{
			key: "size",
			header: "Size",
			render: (f) => formatBytes(f.size),
		},
		{
			key: "created",
			header: "Uploaded",
			render: (f) => (
				<span className="font-mono text-xs">
					{new Date(f.createdAt).toLocaleString()}
				</span>
			),
		},
		{
			key: "actions",
			header: "",
			render: (f) => (
				<div className="flex justify-end gap-2">
					{f.url ? (
						<Button asChild size="sm" variant="outline">
							<a href={f.url} target="_blank" rel="noreferrer">
								Open
							</a>
						</Button>
					) : null}
					<Button
						size="sm"
						variant="destructive"
						disabled={pendingId === f._id}
						onClick={() => void onDelete(f._id, f.filename)}
					>
						Delete
					</Button>
				</div>
			),
		},
	];

	return (
		<ListPage
			title="Files"
			description={`${visible.length} uploaded file${visible.length === 1 ? "" : "s"}`}
			actions={
				<Select value={purpose} onValueChange={setPurpose}>
					<SelectTrigger className="w-[180px]" aria-label="Filter by purpose">
						<SelectValue placeholder="All purposes" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All purposes</SelectItem>
						{purposes.map((p) => (
							<SelectItem key={p} value={p}>
								{p}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			}
		>
			{error ? <ErrorBanner message={error.message} /> : null}
			{isPending ? (
				<p className="text-muted-foreground text-sm">Loading files…</p>
			) : (
				<DataTable
					columns={columns}
					data={visible}
					rowKey={(f) => f._id}
					emptyMessage="No uploaded files yet. Tour gallery uploads will appear here."
					searchPlaceholder="Search files…"
				/>
			)}
		</ListPage>
	);
}
