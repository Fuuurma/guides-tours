import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
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
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/utils";
import { MAX_NAME_LEN, validateName } from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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
	toggling,
	deleting,
}: {
	category: Category;
	onToggle: (id: string, current: boolean) => void;
	onDelete: (id: string, label: string) => void;
	isBusy: boolean;
	toggling: boolean;
	deleting: boolean;
}) {
	return (
		<div className="flex items-center justify-end gap-1">
			<Button
				size="sm"
				variant="outline"
				onClick={() => onToggle(category._id, category.isActive)}
				disabled={isBusy}
			>
				{toggling ? <Spinner data-icon="inline-start" /> : null}
				{category.isActive ? "Disable" : "Enable"}
			</Button>
			<Button
				size="sm"
				variant="destructive"
				onClick={() => onDelete(category._id, category.name)}
				disabled={isBusy}
			>
				{deleting ? <Spinner data-icon="inline-start" /> : null}
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
	const confirm = useConfirm();
	const [pending, setPending] = useState<{
		id: string;
		kind: "toggle" | "delete";
	} | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPending({ id, kind: "toggle" });
		try {
			await updateCategory({
				categoryId: id as Id<"tourCategories">,
				isActive: !currentActive,
			});
			toast.success(currentActive ? "Category disabled" : "Category enabled");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
		}
	};
	const onDelete = async (id: string, label: string) => {
		const ok = await confirm({
			title: `Delete the "${label}" category?`,
			description: "Tours in this category will be uncategorized.",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setPending({ id, kind: "delete" });
		try {
			await removeCategory({ categoryId: id as Id<"tourCategories"> });
			toast.success("Category deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
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
					isBusy={pending?.id === c._id}
					toggling={pending?.id === c._id && pending.kind === "toggle"}
					deleting={pending?.id === c._id && pending.kind === "delete"}
				/>
			),
		},
	];

	const itemCount = (categories ?? []).length;

	return (
		<ListPage
			title="Tour categories"
			description={`${itemCount} categor${itemCount === 1 ? "y" : "ies"} — group tours in your catalog`}
		>
			<NewCategoryForm />
			<DataTable
				data={categories as Category[] | undefined}
				columns={columns}
				rowKey={(c) => c._id}
				isPending={isPending}
				error={error}
				emptyMessage="No categories yet"
				emptyDescription="Group tours in the catalog so operators can filter and staff by type."
				searchPlaceholder="Search by name or slug…"
			/>
		</ListPage>
	);
}

function slugify(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function metaErrors(
	errors: ReadonlyArray<unknown>,
): Array<{ message?: string }> {
	return errors.map((err) => {
		if (typeof err === "string") return { message: err };
		if (err && typeof err === "object" && "message" in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === "string") return { message };
		}
		return { message: String(err) };
	});
}

/**
 * Quick create form for new categories. Categories are simple —
 * name + slug — so we don't need a dedicated /new route for them.
 */
function NewCategoryForm() {
	const create = useMutation(api.tourCategories.create);
	const [submitErr, setSubmitErr] = useState<string | null>(null);
	const [slugTouched, setSlugTouched] = useState(false);

	const form = useForm({
		defaultValues: { name: "", slug: "", icon: "" },
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: "name" | "slug", message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};
			const nameErr = validateName(value.name);
			if (nameErr) fail("name", nameErr);
			const slug = value.slug.trim() || slugify(value.name);
			if (!slug) fail("slug", "Slug is required");
			else if (slug.length > MAX_NAME_LEN) {
				fail("slug", `Slug is too long (max ${MAX_NAME_LEN} characters)`);
			}
			if (invalid) return;
			try {
				await create({
					name: value.name.trim(),
					slug,
					icon: value.icon.trim() || undefined,
				});
				toast.success("Category created");
				form.reset();
				setSlugTouched(false);
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
				toast.error(getErrorMessage(err));
			}
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Add category</CardTitle>
				<CardDescription>
					Categories group tours in the catalog. Slug must be unique within your
					organization.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<FieldGroup className="gap-4">
						<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-3">
							<form.Field name="name">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="cat-name">Name *</FieldLabel>
										<Input
											id="cat-name"
											required
											maxLength={MAX_NAME_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => {
												field.handleChange(e.target.value);
												if (!slugTouched) {
													form.setFieldValue("slug", slugify(e.target.value));
												}
											}}
											placeholder="Walking Tours"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>
							<form.Field name="slug">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="cat-slug">Slug *</FieldLabel>
										<Input
											id="cat-slug"
											required
											maxLength={MAX_NAME_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => {
												setSlugTouched(true);
												field.handleChange(e.target.value);
											}}
											placeholder="walking-tours"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldDescription>Auto-derived from name</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>
							<form.Field name="icon">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="cat-icon">Icon</FieldLabel>
										<Input
											id="cat-icon"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="🚶"
											maxLength={4}
										/>
										<FieldDescription>Emoji or short text</FieldDescription>
									</Field>
								)}
							</form.Field>
						</FieldGroup>
						{submitErr ? <ErrorBanner message={submitErr} /> : null}
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<div className="flex justify-end">
									<Button type="submit" disabled={!canSubmit || isSubmitting}>
										{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
										{isSubmitting ? "Saving…" : "Add category"}
									</Button>
								</div>
							)}
						</form.Subscribe>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
