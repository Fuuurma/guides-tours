import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import { FormActions, FormField } from "../form";

const TOUR_TYPES = [
	"walking",
	"car",
	"minivan",
	"bus",
	"boat",
	"other",
] as const;

export function NewTemplatePage() {
	const navigate = useNavigate();
	const create = useMutation(api.tourTemplates.create);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [tourType, setTourType] = useState<string>("walking");
	const [durationHours, setDurationHours] = useState("2");
	const [capacity, setCapacity] = useState("10");
	const [minGuests, setMinGuests] = useState("1");
	const [maxGuests, setMaxGuests] = useState("10");
	const [languages, setLanguages] = useState("en");
	const [inclusions, setInclusions] = useState("");
	const [exclusions, setExclusions] = useState("");
	const [highlights, setHighlights] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			const id = await create({
				name,
				description: description || undefined,
				tourType,
				durationHours: dur,
				capacity: cap,
				minGuests: minG,
				maxGuests: maxG,
				languages: languages
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
				inclusions: inclusions
					.split("\n")
					.map((s) => s.trim())
					.filter(Boolean),
				exclusions: exclusions
					.split("\n")
					.map((s) => s.trim())
					.filter(Boolean),
				highlights: highlights
					.split("\n")
					.map((s) => s.trim())
					.filter(Boolean),
			});
			toast.success("Template created");
			void navigate({
				to: "/dashboard/templates/$templateId",
				params: { templateId: id },
			});
		} catch (err) {
			setError((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="mx-auto max-w-2xl">
			<Card>
				<CardHeader>
					<CardTitle>New tour template</CardTitle>
					<CardDescription>
						Reusable defaults for spinning up tours
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="space-y-4">
						<FormField label="Name *" htmlFor="name">
							<Input
								id="name"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="City Highlights"
							/>
						</FormField>

						<FormField label="Description" htmlFor="desc">
							<textarea
								id="desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={3}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Type" htmlFor="type">
								<select
									id="type"
									value={tourType}
									onChange={(e) => setTourType(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									{TOUR_TYPES.map((t) => (
										<option key={t} value={t}>
											{t}
										</option>
									))}
								</select>
							</FormField>

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

						<FormField
							label="Languages"
							hint="Comma-separated codes"
							htmlFor="langs"
						>
							<Input
								id="langs"
								value={languages}
								onChange={(e) => setLanguages(e.target.value)}
								placeholder="en, es, fr"
							/>
						</FormField>

						<FormField
							label="Inclusions"
							hint="One per line"
							htmlFor="incl"
						>
							<textarea
								id="incl"
								value={inclusions}
								onChange={(e) => setInclusions(e.target.value)}
								rows={3}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						<FormField
							label="Exclusions"
							hint="One per line"
							htmlFor="excl"
						>
							<textarea
								id="excl"
								value={exclusions}
								onChange={(e) => setExclusions(e.target.value)}
								rows={3}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						<FormField
							label="Highlights"
							hint="One per line"
							htmlFor="high"
						>
							<textarea
								id="high"
								value={highlights}
								onChange={(e) => setHighlights(e.target.value)}
								rows={3}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<FormActions
							onCancel={() => navigate({ to: "/dashboard/templates" })}
							pending={pending}
							submitLabel="Create template"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
