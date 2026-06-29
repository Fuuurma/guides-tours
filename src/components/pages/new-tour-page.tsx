import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
};

export function NewTourPage() {
	const create = useMutation(api.tours.create);
	const { data: categories } = useQuery(
		convexQuery(api.tourCategories.list, {}),
	);

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
			const id = await create({
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
				basePriceCents:
					v.priceUsd && Number(v.priceUsd) > 0
						? BigInt(Math.round(Number(v.priceUsd) * 100))
						: undefined,
				languages: v.languages
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			});
			return id;
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
					value={form.values.name}
					onChange={(e) => form.set("name", e.target.value)}
					placeholder="Old Town Walk"
				/>
			</FormField>

			<FormField label="Description" htmlFor="desc">
				<Textarea
					id="desc"
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

				<FormField label="Duration (hours) *" htmlFor="dur">
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
				<FormField label="Capacity *" htmlFor="cap">
					<Input
						id="cap"
						type="number"
						min="1"
						required
						value={form.values.capacity}
						onChange={(e) => form.set("capacity", e.target.value)}
					/>
				</FormField>
				<FormField label="Min guests" htmlFor="min">
					<Input
						id="min"
						type="number"
						min="1"
						value={form.values.minGuests}
						onChange={(e) => form.set("minGuests", e.target.value)}
					/>
				</FormField>
				<FormField label="Max guests" htmlFor="max">
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
						value={form.values.languages}
						onChange={(e) => form.set("languages", e.target.value)}
						placeholder="en, es"
					/>
				</FormField>
			</div>
		</EntityFormPage>
	);
}
