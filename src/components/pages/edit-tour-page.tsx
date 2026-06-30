import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { useQuery as useConvexQuery, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { DetailPage } from "@/components/detail-page";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { centsToInputValue } from "@/lib/format";
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	parseUsdToCents,
	validateDescriptionOptional,
	validatePositiveInteger,
	validatePositiveNumber,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormField } from "../form";

const TOUR_TYPES = [
	"walking",
	"car",
	"minivan",
	"bus",
	"boat",
	"other",
] as const;

interface FormValues extends Record<string, unknown> {
	name: string;
	description: string;
	tourType: string;
	categoryId: string;
	durationHours: string;
	capacity: string;
	minGuests: string;
	maxGuests: string;
	priceUsd: string;
	languages: string;
	isActive: boolean;
}

interface EditTourPageProps {
	tourId: string;
}

export function EditTourPage({ tourId }: EditTourPageProps) {
	const tour = useConvexQuery(api.tours.get, { tourId: tourId as Id<"tours"> });
	const update = useMutation(api.tours.update);
	const { data: categories } = useTanstackQuery(
		convexQuery(api.tourCategories.list, {}),
	);
	const [loaded, setLoaded] = useState(false);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const minG = Number(v.minGuests);
			const maxG = Number(v.maxGuests);
			if (minG > maxG) {
				throw new Error("minGuests cannot exceed maxGuests");
			}
			const priceCents = v.priceUsd.trim() ? parseUsdToCents(v.priceUsd) : null;
			if (v.priceUsd.trim() && priceCents === null) {
				throw new Error("Price must be a non-negative number");
			}
			await update({
				tourId: tourId as Id<"tours">,
				name: v.name.trim(),
				description: v.description.trim() || undefined,
				tourType: v.tourType,
				categoryId: v.categoryId
					? (v.categoryId as Id<"tourCategories">)
					: undefined,
				durationHours: Number(v.durationHours),
				capacity: Number(v.capacity),
				minGuests: minG,
				maxGuests: maxG,
				isActive: v.isActive,
				basePriceCents: priceCents ?? undefined,
				languages: v.languages
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			});
			return tourId;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			const durErr = validatePositiveNumber(v.durationHours, "Duration");
			if (durErr) errs.durationHours = durErr;
			const capErr = validatePositiveInteger(v.capacity, "Capacity");
			if (capErr) errs.capacity = capErr;
			const minErr = validatePositiveInteger(v.minGuests, "Min guests");
			if (minErr) errs.minGuests = minErr;
			const maxErr = validatePositiveInteger(v.maxGuests, "Max guests");
			if (maxErr) errs.maxGuests = maxErr;
			if (!minErr && !maxErr && Number(v.minGuests) > Number(v.maxGuests)) {
				errs.minGuests = "minGuests cannot exceed maxGuests";
				errs.maxGuests = "minGuests cannot exceed maxGuests";
			}
			const descErr = validateDescriptionOptional(v.description);
			if (descErr) errs.description = descErr;
			return Object.keys(errs).length > 0 ? errs : null;
		},
		initialValues: {
			name: "",
			description: "",
			tourType: "walking",
			categoryId: "",
			durationHours: "2",
			capacity: "10",
			minGuests: "1",
			maxGuests: "10",
			priceUsd: "",
			languages: "en",
			isActive: true,
		},
		redirectTo: (id) => `/dashboard/tours/${id}`,
		successMessage: "Tour updated",
	});

	// Populate form from server data once it loads.
	useEffect(() => {
		if (tour && !loaded) {
			const t = tour as unknown as {
				name: string;
				description?: string;
				tourType: string;
				categoryId?: string;
				durationHours: number;
				capacity: number;
				minGuests: number;
				maxGuests: number;
				isActive: boolean;
				basePriceCents?: number;
				languages: string[];
			};
			form.set("name", t.name);
			form.set("description", t.description ?? "");
			form.set("tourType", t.tourType);
			form.set("categoryId", t.categoryId ?? "");
			form.set("durationHours", String(t.durationHours));
			form.set("capacity", String(t.capacity));
			form.set("minGuests", String(t.minGuests));
			form.set("maxGuests", String(t.maxGuests));
			form.set("isActive", t.isActive);
			form.set("priceUsd", centsToInputValue(t.basePriceCents));
			form.set("languages", (t.languages ?? ["en"]).join(", "));
			setLoaded(true);
		}
	}, [tour, loaded, form]);

	if (tour === undefined) {
		return <DetailSkeleton />;
	}
	if (tour === null) {
		return <DetailPage title="Tour not found" backTo="/dashboard/tours" />;
	}

	const activeCategories = (categories ?? []).filter(
		(c: { isActive: boolean }) => c.isActive,
	);

	return (
		<EntityFormPage
			form={form}
			title={`Edit ${(tour as { name: string }).name}`}
			description="Update tour configuration"
			backTo={`/dashboard/tours/${tourId}`}
			submitLabel="Save changes"
		>
			<FormField label="Name *" htmlFor="edit-name">
				<Input
					id="edit-name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
				/>
			</FormField>

			<FormField
				label="Description"
				htmlFor="edit-desc"
				error={form.fieldErrors.description}
			>
				<Textarea
					id="edit-desc"
					value={form.values.description}
					onChange={(e) => form.set("description", e.target.value)}
					rows={3}
					maxLength={MAX_DESCRIPTION_LEN}
					placeholder="Optional"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="edit-type">
					<Select
						value={form.values.tourType}
						onValueChange={(v) => form.set("tourType", v)}
					>
						<SelectTrigger id="edit-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TOUR_TYPES.map((t) => (
								<SelectItem key={t} value={t}>
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>

				<FormField
					label="Category"
					htmlFor="edit-category"
					hint="Group tours on the public booking page"
				>
					<Select
						value={form.values.categoryId}
						onValueChange={(v) => form.set("categoryId", v)}
					>
						<SelectTrigger id="edit-category">
							<SelectValue placeholder="No category" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">No category</SelectItem>
							{activeCategories.map(
								(c: { _id: string; name: string; icon: string }) => (
									<SelectItem key={c._id} value={c._id}>
										{c.icon ? `${c.icon} ${c.name}` : c.name}
									</SelectItem>
								),
							)}
						</SelectContent>
					</Select>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField
					label="Duration (hours) *"
					htmlFor="edit-dur"
					error={form.fieldErrors.durationHours}
				>
					<Input
						id="edit-dur"
						type="number"
						step="0.5"
						min="0.5"
						required
						value={form.values.durationHours}
						onChange={(e) => form.set("durationHours", e.target.value)}
					/>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<FormField
					label="Capacity *"
					htmlFor="edit-cap"
					error={form.fieldErrors.capacity}
				>
					<Input
						id="edit-cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => form.set("capacity", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Min guests"
					htmlFor="edit-min"
					error={form.fieldErrors.minGuests}
				>
					<Input
						id="edit-min"
						type="number"
						min="1"
						value={form.values.minGuests}
						onChange={(e) => form.set("minGuests", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Max guests"
					htmlFor="edit-max"
					error={form.fieldErrors.maxGuests}
				>
					<Input
						id="edit-max"
						type="number"
						min="1"
						value={form.values.maxGuests}
						onChange={(e) => form.set("maxGuests", e.target.value)}
					/>
				</FormField>
			</div>

			<FormField label="Base price (USD)" htmlFor="edit-price">
				<Input
					id="edit-price"
					type="number"
					step="0.01"
					min="0"
					value={form.values.priceUsd}
					onChange={(e) => form.set("priceUsd", e.target.value)}
				/>
			</FormField>

			<FormField
				label="Languages"
				hint="Comma-separated codes (en, es, fr)"
				htmlFor="edit-langs"
			>
				<Input
					id="edit-langs"
					value={form.values.languages}
					onChange={(e) => form.set("languages", e.target.value)}
					placeholder="en, es"
				/>
			</FormField>

			<label
				htmlFor="edit-tour-active"
				className="flex items-center gap-2 text-sm"
			>
				<Checkbox
					id="edit-tour-active"
					checked={form.values.isActive}
					onCheckedChange={(c) => form.set("isActive", c === true)}
				/>
				Active (visible to customers)
			</label>
		</EntityFormPage>
	);
}

// Route declaration lives in src/routes/dashboard/tours/$tourId/edit.tsx
// to keep page components decoupled from the TanStack Router wiring.
