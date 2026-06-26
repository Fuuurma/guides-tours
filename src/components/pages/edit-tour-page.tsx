import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import { FormActions, FormField } from "../form";

interface EditTourPageProps {
	tourId: string;
}

export function EditTourPage({ tourId }: EditTourPageProps) {
	const navigate = useNavigate();
	const tour = useQuery(api.tours.get, { tourId: tourId as never });
	const update = useMutation(api.tours.update);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [durationHours, setDurationHours] = useState("2");
	const [capacity, setCapacity] = useState("10");
	const [minGuests, setMinGuests] = useState("1");
	const [maxGuests, setMaxGuests] = useState("10");
	const [isActive, setIsActive] = useState(true);
	const [priceUsd, setPriceUsd] = useState("");
	const [loaded, setLoaded] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (tour && !loaded) {
			const t = tour as unknown as {
				name: string;
				description: string;
				tourType: string;
				durationHours: number;
				capacity: number;
				minGuests: number;
				maxGuests: number;
				isActive: boolean;
				basePriceCents?: number;
			};
			setName(t.name);
			setDescription(t.description ?? "");
			setDurationHours(String(t.durationHours));
			setCapacity(String(t.capacity));
			setMinGuests(String(t.minGuests));
			setMaxGuests(String(t.maxGuests));
			setIsActive(t.isActive);
			if (t.basePriceCents !== undefined) {
				setPriceUsd((Number(t.basePriceCents) / 100).toFixed(2));
			}
			setLoaded(true);
		}
	}, [tour, loaded]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const dur = Number(durationHours);
		const cap = Number(capacity);
		const minG = Number(minGuests);
		const maxG = Number(maxGuests);
		if (dur <= 0 || cap <= 0 || minG <= 0 || maxG <= 0) {
			setError("Numeric fields must be positive");
			setPending(false);
			return;
		}
		if (minG > maxG) {
			setError("minGuests cannot exceed maxGuests");
			setPending(false);
			return;
		}

		try {
			await update({
				tourId: tourId as never,
				name,
				description: description || undefined,
				durationHours: dur,
				capacity: cap,
				minGuests: minG,
				maxGuests: maxG,
				isActive,
				basePriceCents:
					priceUsd && Number(priceUsd) > 0
						? BigInt(Math.round(Number(priceUsd) * 100))
						: undefined,
			});
			toast.success("Tour updated");
			void navigate({
				to: "/dashboard/tours/$tourId",
				params: { tourId },
			});
		} catch (err) {
			setError((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

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

	return (
		<div className="mx-auto max-w-2xl">
			<Card>
				<CardHeader>
					<CardTitle>Edit tour</CardTitle>
					<CardDescription>Update tour configuration</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="space-y-4">
						<FormField label="Name *" htmlFor="name">
							<Input
								id="name"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</FormField>

						<FormField label="Description" htmlFor="desc">
							<Textarea
								id="desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={3}
								placeholder="Optional"
							/>
						</FormField>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Duration (hours) *" htmlFor="dur">
								<Input
									id="dur"
									type="number"
									step="0.5"
									min="0.5"
									required
									value={durationHours}
									onChange={(e) => setDurationHours(e.target.value)}
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
									value={capacity}
									onChange={(e) => setCapacity(e.target.value)}
								/>
							</FormField>
							<FormField label="Min guests" htmlFor="min">
								<Input
									id="min"
									type="number"
									min="1"
									value={minGuests}
									onChange={(e) => setMinGuests(e.target.value)}
								/>
							</FormField>
							<FormField label="Max guests" htmlFor="max">
								<Input
									id="max"
									type="number"
									min="1"
									value={maxGuests}
									onChange={(e) => setMaxGuests(e.target.value)}
								/>
							</FormField>
						</div>

						<FormField label="Base price (USD)" htmlFor="price">
							<Input
								id="price"
								type="number"
								step="0.01"
								min="0"
								value={priceUsd}
								onChange={(e) => setPriceUsd(e.target.value)}
							/>
						</FormField>

						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={isActive}
								onChange={(e) => setIsActive(e.target.checked)}
							/>
							Active (visible to customers)
						</label>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<FormActions
							onCancel={() =>
								navigate({
									to: "/dashboard/tours/$tourId",
									params: { tourId },
								})
							}
							pending={pending}
							submitLabel="Save changes"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}