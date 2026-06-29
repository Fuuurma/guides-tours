import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ListPage } from "@/components/list-page";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormActions, FormField } from "../../components/form";

export const Route = createFileRoute("/dashboard/categories")({
	component: CategoriesPage,
});

interface Category {
	_id: string;
	name: string;
	slug: string;
	description: string;
	icon: string;
	color: string;
	displayOrder: number;
	isActive: boolean;
}

function ActionsCell({
	category,
	onToggle,
	onDelete,
	isBusy,
}: {
	category: Category;
	onToggle: (id: string, current: boolean) => void;
	onDelete: (id: string, label: string) => void;
	isBusy: boolean;
}) {
	return (
		<div className="flex items-center gap-1 justify-end">
			<Button
				size="sm"
				variant="outline"
				onClick={() => onToggle(category._id, category.isActive)}
				disabled={isBusy}
			>
				{category.isActive ? "Disable" : "Enable"}
			</Button>
			<Button
				size="sm"
				variant="destructive"
				onClick={() => onDelete(category._id, category.name)}
				disabled={isBusy}
			>
				Delete
			</Button>
		</div>
	);
}

function CategoriesPage() {
	const {
		data: categories,
		isPending,
		error,
	} = useQuery(convexQuery(api.tourCategories.list, {}));
	const updateCategory = useMutation(api.tourCategories.update);
	const removeCategory = useMutation(api.tourCategories.remove);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPendingId(id);
		try {
			await updateCategory({
				categoryId: id as Id<"tourCategories">,
				isActive: !currentActive,
			});
			toast.success(currentActive ? "Category disabled" : "Category enabled");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		if (
			!window.confirm(
				`Delete the "${label}" category? Tours in this category will be uncategorized.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeCategory({ categoryId: id as Id<"tourCategories"> });
			toast.success("Category deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

	const columns: DataTableColumn<Category>[] = [
		{
			key: "name",
			header: "Name",
			render: (c) => (
				<div className="flex items-center gap-2">
					<span className="text-lg">{c.icon || "📁"}</span>
					<div>
						<p className="font-medium">{c.name}</p>
						<p className="text-muted-foreground text-xs font-mono">{c.slug}</p>
					</div>
				</div>
			),
			searchValue: (c) => `${c.name} ${c.slug}`,
		},
		{ key: "order", header: "Order", render: (c) => c.displayOrder },
		{
			key: "status",
			header: "Status",
			render: (c) => (
				<StatusBadge status={c.isActive ? "active" : "inactive"} />
			),
			searchValue: (c) => (c.isActive ? "active" : "inactive"),
		},
		{
			key: "actions",
			header: "",
			render: (c) => (
				<ActionsCell
					category={c}
					onToggle={toggleActive}
					onDelete={onDelete}
					isBusy={pendingId === c._id}
				/>
			),
		},
	];

	const itemCount = (categories ?? []).length;

	return (
		<ListPage
			title="Tour categories"
			description={`${itemCount} category${itemCount === 1 ? "" : "ies"} — group tours for the public booking page.`}
		>
			<NewCategoryForm />
			<DataTable
				data={categories as Category[] | undefined}
				columns={columns}
				rowKey={(c) => c._id}
				isPending={isPending}
				error={error}
				emptyMessage="No categories yet. Add one below."
				searchPlaceholder="Search by name or slug…"
			/>
		</ListPage>
	);
}

/**
 * Quick create form for new categories. Categories are simple —
 * name + slug — so we don't need a dedicated /new route for them.
 * Operators can iterate quickly from the list page.
 */
function NewCategoryForm() {
	const create = useMutation(api.tourCategories.create);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [icon, setIcon] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Auto-derive slug from name when user hasn't typed one yet
	const slugValue =
		slug ||
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);
		try {
			await create({
				name,
				slug: slugValue,
				icon: icon || undefined,
			});
			toast.success("Category created");
			setName("");
			setSlug("");
			setIcon("");
		} catch (err) {
			setError(getErrorMessage(err));
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Add category</CardTitle>
				<CardDescription>
					Categories appear as filter chips on the public booking page. Slug
					must be unique within your organization.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<div className="grid gap-4 md:grid-cols-3">
						<FormField label="Name *" htmlFor="cat-name">
							<Input
								id="cat-name"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Walking Tours"
							/>
						</FormField>
						<FormField
							label="Slug *"
							htmlFor="cat-slug"
							hint="Auto-derived from name"
						>
							<Input
								id="cat-slug"
								required
								value={slugValue}
								onChange={(e) => setSlug(e.target.value)}
								placeholder="walking-tours"
							/>
						</FormField>
						<FormField
							label="Icon"
							htmlFor="cat-icon"
							hint="Emoji or short text"
						>
							<Input
								id="cat-icon"
								value={icon}
								onChange={(e) => setIcon(e.target.value)}
								placeholder="🚶"
								maxLength={4}
							/>
						</FormField>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<FormActions pending={pending} submitLabel="Add category" />
				</form>
			</CardContent>
		</Card>
	);
}
