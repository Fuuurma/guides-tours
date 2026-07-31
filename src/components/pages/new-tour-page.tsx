import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
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
import { Textarea } from "@/components/ui/textarea";
import { resolveTourStaffing, TOUR_TYPES, VEHICLE_TYPES } from "@/lib/staffing";
import {
	MAX_DESCRIPTION_LEN,
	MAX_NAME_LEN,
	parseUsdToCents,
	validatePositiveInteger,
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
	requiredGuides: string;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string;
	staffingOverride: boolean;
}

const INITIAL: FormValues = {
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
	requiredGuides: "1",
	requiresVehicle: false,
	requiresDriver: false,
	requiredVehicleType: "",
	staffingOverride: false,
};

export function NewTourPage() {
	const create = useMutation(api.tours.create);
	const { data: categories } = useQuery(
		convexQuery(api.tourCategories.list, {}),
	);

	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const priceCents = parseUsdToCents(v.priceUsd);
			if (v.priceUsd && priceCents === null) {
				throw new Error("Invalid price amount");
			}
			const inferred = resolveTourStaffing({
				tourType: v.tourType,
				requiredGuides: Number(v.requiredGuides) || 1,
				requiresVehicle: v.staffingOverride ? v.requiresVehicle : undefined,
				requiresDriver: v.staffingOverride ? v.requiresDriver : undefined,
				requiredVehicleType: v.staffingOverride
					? v.requiredVehicleType || undefined
					: undefined,
			});
			const id = await create({
				name: v.name,
				description: v.description || undefined,
				tourType: v.tourType,
				categoryId: v.categoryId
					? (v.categoryId as Id<"tourCategories">)
					: undefined,
				durationHours: Number(v.durationHours),
				capacity: Number(v.capacity),
				minGuests: Number(v.minGuests),
				maxGuests: Number(v.maxGuests),
				basePriceCents: priceCents ?? undefined,
				languages: v.languages
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
				requiredGuides: Number(v.requiredGuides) || 1,
				requiresVehicle: v.staffingOverride ? v.requiresVehicle : undefined,
				requiresDriver: v.staffingOverride ? v.requiresDriver : undefined,
				requiredVehicleType:
					v.staffingOverride && inferred.requiresVehicle
						? v.requiredVehicleType || undefined
						: undefined,
			});
			return id;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			const durErr = validatePositiveInteger(v.durationHours, "Duration");
			if (durErr) errs.durationHours = durErr;
			const capErr = validatePositiveInteger(v.capacity, "Capacity");
			if (capErr) errs.capacity = capErr;
			const minGErr = validatePositiveInteger(v.minGuests, "Min guests");
			if (minGErr) errs.minGuests = minGErr;
			const maxGErr = validatePositiveInteger(v.maxGuests, "Max guests");
			if (maxGErr) errs.maxGuests = maxGErr;
			if (!minGErr && !maxGErr && Number(v.minGuests) > Number(v.maxGuests)) {
				errs.minGuests = "Min guests cannot exceed max guests";
				errs.maxGuests = "Min guests cannot exceed max guests";
			}
			return Object.keys(errs).length > 0 ? errs : null;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/tours/${id}`,
		successMessage: "Tour created",
	});

	const activeCategories = (categories ?? []).filter(
		(c: { isActive: boolean }) => c.isActive,
	);

	return (
		<EntityFormPage
			form={form}
			title="New tour"
			description="Create a new tour that customers can book"
			backTo="/dashboard/tours"
			submitLabel="Create tour"
		>
			<FormField label="Name *" htmlFor="name">
				<Input
					id="name"
					required
					maxLength={MAX_NAME_LEN}
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
					placeholder="Old Town Walk"
				/>
			</FormField>

			<FormField label="Description" htmlFor="desc">
				<Textarea
					id="desc"
					maxLength={MAX_DESCRIPTION_LEN}
					value={form.values.description}
					onChange={(e) => form.set("description", e.target.value)}
					rows={3}
					placeholder="Optional"
				/>
			</FormField>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Type" htmlFor="type">
					<Select
						value={form.values.tourType}
						onValueChange={(v) => form.set("tourType", v)}
					>
						<SelectTrigger id="type">
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
					htmlFor="category"
					hint="Group tours on the public booking page"
				>
					<Select
						value={form.values.categoryId}
						onValueChange={(v) => form.set("categoryId", v)}
					>
						<SelectTrigger id="category">
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

				<FormField
					label="Duration (hours) *"
					htmlFor="dur"
					error={form.fieldErrors.durationHours}
				>
					<Input
						id="dur"
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
					htmlFor="cap"
					error={form.fieldErrors.capacity}
				>
					<Input
						id="cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => form.set("capacity", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Min guests"
					htmlFor="min"
					error={form.fieldErrors.minGuests}
				>
					<Input
						id="min"
						type="number"
						min="1"
						value={form.values.minGuests}
						onChange={(e) => form.set("minGuests", e.target.value)}
					/>
				</FormField>
				<FormField
					label="Max guests"
					htmlFor="max"
					error={form.fieldErrors.maxGuests}
				>
					<Input
						id="max"
						type="number"
						min="1"
						value={form.values.maxGuests}
						onChange={(e) => form.set("maxGuests", e.target.value)}
					/>
				</FormField>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<FormField
					label="Base price (USD)"
					hint="Per person, in dollars"
					htmlFor="price"
				>
					<Input
						id="price"
						type="number"
						step="0.01"
						min="0"
						value={form.values.priceUsd}
						onChange={(e) => form.set("priceUsd", e.target.value)}
						placeholder="49.00"
					/>
				</FormField>

				<FormField
					label="Languages"
					hint="Comma-separated codes (en, es, fr)"
					htmlFor="langs"
				>
					<Input
						id="langs"
						maxLength={100}
						value={form.values.languages}
						onChange={(e) => form.set("languages", e.target.value)}
						placeholder="en, es"
					/>
				</FormField>
			</div>

			<div className="space-y-4 rounded-md border p-4">
				<div>
					<p className="text-sm font-medium">Staffing</p>
					<p className="text-muted-foreground text-xs">
						How many guides and whether this tour needs a vehicle/driver.
						Transport types default to requiring both.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<FormField label="Required guides" htmlFor="req-guides">
						<Input
							id="req-guides"
							type="number"
							min="1"
							max="10"
							value={form.values.requiredGuides}
							onChange={(e) => form.set("requiredGuides", e.target.value)}
						/>
					</FormField>
					<label
						htmlFor="staffing-override"
						className="flex items-center gap-2 text-sm pt-6"
					>
						<Checkbox
							id="staffing-override"
							checked={form.values.staffingOverride}
							onCheckedChange={(c) => {
								const on = c === true;
								form.set("staffingOverride", on);
								if (!on) return;
								const inferred = resolveTourStaffing({
									tourType: form.values.tourType,
								});
								form.set("requiresVehicle", inferred.requiresVehicle);
								form.set("requiresDriver", inferred.requiresDriver);
								form.set(
									"requiredVehicleType",
									inferred.requiredVehicleType ?? "",
								);
							}}
						/>
						Customize vehicle/driver rules
					</label>
				</div>
				{form.values.staffingOverride ? (
					<div className="grid gap-4 md:grid-cols-3">
						<label
							htmlFor="requires-vehicle"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="requires-vehicle"
								checked={form.values.requiresVehicle}
								onCheckedChange={(c) => form.set("requiresVehicle", c === true)}
							/>
							Requires vehicle
						</label>
						<label
							htmlFor="requires-driver"
							className="flex items-center gap-2 text-sm"
						>
							<Checkbox
								id="requires-driver"
								checked={form.values.requiresDriver}
								onCheckedChange={(c) => form.set("requiresDriver", c === true)}
							/>
							Requires driver
						</label>
						<FormField label="Required vehicle type" htmlFor="req-vtype">
							<Select
								value={form.values.requiredVehicleType || "__any__"}
								onValueChange={(v) =>
									form.set("requiredVehicleType", v === "__any__" ? "" : v)
								}
							>
								<SelectTrigger id="req-vtype">
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
		</EntityFormPage>
	);
}
