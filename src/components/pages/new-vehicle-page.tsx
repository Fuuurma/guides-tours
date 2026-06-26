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

const VEHICLE_TYPES = [
	"minivan",
	"van",
	"bus",
	"car",
	"boat",
	"other",
] as const;

const OWNERSHIP_TYPES = ["owned", "rented", "leased"] as const;

export function NewVehiclePage() {
	const navigate = useNavigate();
	const create = useMutation(api.vehicles.create);
	const [name, setName] = useState("");
	const [vehicleType, setVehicleType] = useState<string>("minivan");
	const [capacity, setCapacity] = useState("8");
	const [licensePlate, setLicensePlate] = useState("");
	const [make, setMake] = useState("");
	const [model, setModel] = useState("");
	const [year, setYear] = useState("");
	const [color, setColor] = useState("");
	const [ownershipType, setOwnershipType] = useState<string>("owned");
	const [notes, setNotes] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const cap = Number(capacity);
		const yr = year ? Number(year) : undefined;
		if (cap <= 0) {
			setError("Capacity must be positive");
			setPending(false);
			return;
		}
		if (yr !== undefined && (yr < 1900 || yr > 2100)) {
			setError("Year must be between 1900 and 2100");
			setPending(false);
			return;
		}

		try {
			const id = await create({
				name,
				vehicleType,
				capacity: cap,
				licensePlate: licensePlate || undefined,
				make: make || undefined,
				model: model || undefined,
				year: yr,
				color: color || undefined,
				ownershipType,
				notes: notes || undefined,
			});
			toast.success("Vehicle created");
			void navigate({
				to: "/dashboard/vehicles/$vehicleId",
				params: { vehicleId: id },
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
					<CardTitle>New vehicle</CardTitle>
					<CardDescription>
						Add a vehicle to your fleet
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
								placeholder="Minivan #1"
							/>
						</FormField>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Type" htmlFor="type">
								<select
									id="type"
									value={vehicleType}
									onChange={(e) => setVehicleType(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									{VEHICLE_TYPES.map((t) => (
										<option key={t} value={t}>
											{t}
										</option>
									))}
								</select>
							</FormField>

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
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="License plate" htmlFor="plate">
								<Input
									id="plate"
									value={licensePlate}
									onChange={(e) => setLicensePlate(e.target.value)}
									placeholder="ABC-1234"
								/>
							</FormField>

							<FormField label="Ownership" htmlFor="own">
								<select
									id="own"
									value={ownershipType}
									onChange={(e) => setOwnershipType(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									{OWNERSHIP_TYPES.map((o) => (
										<option key={o} value={o}>
											{o}
										</option>
									))}
								</select>
							</FormField>
						</div>

						<div className="grid gap-4 md:grid-cols-3">
							<FormField label="Make" htmlFor="make">
								<Input
									id="make"
									value={make}
									onChange={(e) => setMake(e.target.value)}
									placeholder="Mercedes"
								/>
							</FormField>
							<FormField label="Model" htmlFor="model">
								<Input
									id="model"
									value={model}
									onChange={(e) => setModel(e.target.value)}
									placeholder="Sprinter"
								/>
							</FormField>
							<FormField label="Year" htmlFor="year">
								<Input
									id="year"
									type="number"
									min="1900"
									max="2100"
									value={year}
									onChange={(e) => setYear(e.target.value)}
									placeholder="2022"
								/>
							</FormField>
						</div>

						<FormField label="Color" htmlFor="color">
							<Input
								id="color"
								value={color}
								onChange={(e) => setColor(e.target.value)}
								placeholder="White"
							/>
						</FormField>

						<FormField label="Notes" htmlFor="notes">
							<textarea
								id="notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								rows={3}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<FormActions
							onCancel={() => navigate({ to: "/dashboard/vehicles" })}
							pending={pending}
							submitLabel="Create vehicle"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
