import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
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

interface Tour {
	_id: string;
	name: string;
}

interface Vehicle {
	_id: string;
	name: string;
}

interface Driver {
	_id: string;
	userId: string;
}

export function NewAssignmentPage() {
	const navigate = useNavigate();
	const create = useMutation(api.assignments.create);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const { data: vehicles } = useQuery(convexQuery(api.vehicles.list, {}));
	const { data: drivers } = useQuery(convexQuery(api.drivers.list, {}));

	const [tourId, setTourId] = useState("");
	const [guideId, setGuideId] = useState("");
	const [date, setDate] = useState("");
	const [startTime, setStartTime] = useState("");
	const [vehicleId, setVehicleId] = useState("");
	const [driverId, setDriverId] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		if (!tourId) {
			setError("Please select a tour");
			setPending(false);
			return;
		}
		if (!guideId) {
			setError("Guide user ID is required");
			setPending(false);
			return;
		}
		if (!date || !startTime) {
			setError("Date and start time are required");
			setPending(false);
			return;
		}

		try {
			const id = await create({
				tourId: tourId as never,
				guideId,
				date,
				startTime,
				vehicleId: vehicleId ? (vehicleId as never) : undefined,
				driverId: driverId ? (driverId as never) : undefined,
			});
			toast.success("Assignment created");
			void navigate({
				to: "/dashboard/assignments/$assignmentId",
				params: { assignmentId: id },
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
					<CardTitle>New assignment</CardTitle>
					<CardDescription>
						Assign a guide to a tour on a specific date
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="space-y-4">
						<FormField label="Tour *" htmlFor="tour">
							<select
								id="tour"
								required
								value={tourId}
								onChange={(e) => setTourId(e.target.value)}
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							>
								<option value="">Select a tour…</option>
								{(tours as Tour[] | undefined)?.map((t) => (
									<option key={t._id} value={t._id}>
										{t.name}
									</option>
								))}
							</select>
						</FormField>

						<FormField
							label="Guide user ID *"
							hint="Better Auth user ID of the guide (must have 'guide' role)"
							htmlFor="guide"
						>
							<Input
								id="guide"
								required
								value={guideId}
								onChange={(e) => setGuideId(e.target.value)}
								placeholder="user_abc123"
							/>
						</FormField>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Date *" htmlFor="date">
								<Input
									id="date"
									type="date"
									required
									value={date}
									onChange={(e) => setDate(e.target.value)}
								/>
							</FormField>
							<FormField label="Start time *" htmlFor="start">
								<Input
									id="start"
									type="time"
									required
									value={startTime}
									onChange={(e) => setStartTime(e.target.value)}
								/>
							</FormField>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Vehicle (optional)" htmlFor="vehicle">
								<select
									id="vehicle"
									value={vehicleId}
									onChange={(e) => setVehicleId(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									<option value="">None</option>
									{(vehicles as Vehicle[] | undefined)?.map((v) => (
										<option key={v._id} value={v._id}>
											{v.name}
										</option>
									))}
								</select>
							</FormField>

							<FormField label="Driver (optional)" htmlFor="driver">
								<select
									id="driver"
									value={driverId}
									onChange={(e) => setDriverId(e.target.value)}
									className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									<option value="">None</option>
									{(drivers as Driver[] | undefined)?.map((d) => (
										<option key={d._id} value={d._id}>
											{d.userId}
										</option>
									))}
								</select>
							</FormField>
						</div>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<FormActions
							onCancel={() => navigate({ to: "/dashboard/assignments" })}
							pending={pending}
							submitLabel="Create assignment"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
