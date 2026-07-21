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
import { TOUR_TYPES, VEHICLE_TYPES, resolveTourStaffing } from "@/lib/staffing";
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
	requiredGuides: string;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string;
	staffingOverride: boolean;
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
				requiredGuides: Number(v.requiredGuides) || 1,
				requiresVehicle: v.staffingOverride ? v.requiresVehicle : undefined,
				requiresDriver: v.staffingOverride ? v.requiresDriver : undefined,
				requiredVehicleType:
					v.staffingOverride && v.requiresVehicle
						? v.requiredVehicleType || undefined
						: undefined,
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
			requiredGuides: "1",
			requiresVehicle: false,
			requiresDriver: false,
			requiredVehicleType: "",
			staffingOverride: false,
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
				requiredGuides?: number;
				requiresVehicle?: boolean;
				requiresDriver?: boolean;
				requiredVehicleType?: string;
			};
			form.set("name", t.name);
			form.set("description", t.description ?? "");
			form.set("tourType", t.tourType === "walkable" ? "walking" : t.tourType);
			form.set("categoryId", t.categoryId ?? "");
			form.set("durationHours", String(t.durationHours));
			form.set("capacity", String(t.capacity));
			form.set("minGuests", String(t.minGuests));
			form.set("maxGuests", String(t.maxGuests));
			form.set("isActive", t.isActive);
			form.set("priceUsd", centsToInputValue(t.basePriceCents));
			form.set("languages", (t.languages ?? ["en"]).join(", "));
			form.set("requiredGuides", String(t.requiredGuides ?? 1));
			const hasOverride =
				t.requiresVehicle !== undefined ||
				t.requiresDriver !== undefined ||
				Boolean(t.requiredVehicleType);
			form.set("staffingOverride", hasOverride);
			const inferred = resolveTourStaffing(t);
			form.set("requiresVehicle", t.requiresVehicle ?? inferred.requiresVehicle);
			form.set("requiresDriver", t.requiresDriver ?? inferred.requiresDriver);
			form.set(
				"requiredVehicleType",
				t.requiredVehicleType ?? inferred.requiredVehicleType ?? "",
			);
			setLoaded(true);
		}
	}, [tour, loaded, form.set]);

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

			<div className="space-y-4 rounded-md border p-4">
				<div>
					<p className="text-sm font-medium">Staffing</p>
					<p className="text-muted-foreground text-xs">
						Guides required per departure, and fleet rules for this tour.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<FormField label="Required guides" htmlFor="edit-req-guides">
						<Input
							id="edit-req-guides"
							type="number"
							min="1"
							max="10"
							value={form.values.requiredGuides}
							onChange={(e) => form.set("requiredGuides", e.target.value)}
						/>
					</FormField>
					<label htmlFor="edit-staffing-override" className="flex items-center gap-2 text-sm pt-6">
						<Checkbox
							id="edit-staffing-override"
							checked={form.values.staffingOverride}
							onCheckedChange={(c) => form.set("staffingOverride", c === true)}
						/>
						Customize vehicle/driver rules
					</label>
				</div>
				{form.values.staffingOverride ? (
					<div className="grid gap-4 md:grid-cols-3">
						<label htmlFor="edit-requires-vehicle" className="flex items-center gap-2 text-sm">
							<Checkbox
								id="edit-requires-vehicle"
								checked={form.values.requiresVehicle}
								onCheckedChange={(c) =>
									form.set("requiresVehicle", c === true)
								}
							/>
							Requires vehicle
						</label>
						<label htmlFor="edit-requires-driver" className="flex items-center gap-2 text-sm">
							<Checkbox
								id="edit-requires-driver"
								checked={form.values.requiresDriver}
								onCheckedChange={(c) =>
									form.set("requiresDriver", c === true)
								}
							/>
							Requires driver
						</label>
						<FormField label="Required vehicle type" htmlFor="edit-req-vtype">
							<Select
								value={form.values.requiredVehicleType || "__any__"}
								onValueChange={(v) =>
									form.set("requiredVehicleType", v === "__any__" ? "" : v)
								}
							>
								<SelectTrigger id="edit-req-vtype">
									<SelectValue placeholder="Any" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__any__">Any</SelectItem>
									{VEHICLE_TYPES.map((t) => (
										<SelectItem key={t} value={t}>
											{t}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
					</div>
				) : (
					<p className="text-muted-foreground text-xs">
						{(() => {
							const r = resolveTourStaffing({
								tourType: form.values.tourType,
							});
							return r.requiresVehicle
								? `Inferred: needs ${r.requiredVehicleType ?? "a vehicle"} + driver`
								: "Inferred: walking / no fleet required";
						})()}
					</p>
				)}
			</div>

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
