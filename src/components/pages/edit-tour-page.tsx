import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { FormField } from "../form";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const TOUR_TYPES = ["walking", "car", "minivan", "bus", "boat", "other"] as const;

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
	const navigate = useNavigate();
	const tour = useConvexQuery(api.tours.get, { tourId: tourId as never });
	const update = useMutation(api.tours.update);
	const { data: categories } = useTanstackQuery(
		convexQuery(api.tourCategories.list, {}),
	);
	const [loaded, setLoaded] = useState(false);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const dur = Number(v.durationHours);
			const cap = Number(v.capacity);
			const minG = Number(v.minGuests);
			const maxG = Number(v.maxGuests);
			if (dur <= 0 || cap <= 0 || minG <= 0 || maxG <= 0) {
				throw new Error("Numeric fields must be positive");
			}
			if (minG > maxG) {
				throw new Error("minGuests cannot exceed maxGuests");
			}
			await update({
				tourId: tourId as never,
				name: v.name,
				description: v.description || undefined,
				tourType: v.tourType,
				categoryId: v.categoryId
					? (v.categoryId as Id<"tourCategories">)
					: undefined,
				durationHours: dur,
				capacity: cap,
				minGuests: minG,
				maxGuests: maxG,
				isActive: v.isActive,
				basePriceCents:
					v.priceUsd && Number(v.priceUsd) > 0
						? BigInt(Math.round(Number(v.priceUsd) * 100))
						: undefined,
				languages: v.languages
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			});
			return tourId;
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
			form.set(
				"priceUsd",
				t.basePriceCents !== undefined
					? (Number(t.basePriceCents) / 100).toFixed(2)
					: "",
			);
			form.set("languages", (t.languages ?? ["en"]).join(", "));
			setLoaded(true);
		}
	}, [tour, loaded, form]);

	if (tour === undefined) {
		return <p className="text-muted-foreground">Loading…</p>;
	}
	if (tour === null) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Tour not found.</p>
				<button
					type="button"
					className="text-blue-600 hover:underline"
					onClick={() => navigate({ to: "/dashboard/tours" })}
				>
					← Back to tours
				</button>
			</div>
		);
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
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
				/>
			</FormField>

			<FormField label="Description" htmlFor="edit-desc">
				<Textarea
					id="edit-desc"
					value={form.values.description}
					onChange={(e) => form.set("description", e.target.value)}
					rows={3}
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

				<FormField label="Category" htmlFor="edit-category" hint="Group tours on the public booking page">
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
				<FormField label="Duration (hours) *" htmlFor="edit-dur">
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
				<FormField label="Capacity *" htmlFor="edit-cap">
					<Input
						id="edit-cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => form.set("capacity", e.target.value)}
					/>
				</FormField>
				<FormField label="Min guests" htmlFor="edit-min">
					<Input
						id="edit-min"
						type="number"
						min="1"
						value={form.values.minGuests}
						onChange={(e) => form.set("minGuests", e.target.value)}
					/>
				</FormField>
				<FormField label="Max guests" htmlFor="edit-max">
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

			<label className="flex items-center gap-2 text-sm">
				<Checkbox
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
