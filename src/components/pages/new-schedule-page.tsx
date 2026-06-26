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

export function NewSchedulePage() {
	const navigate = useNavigate();
	const create = useMutation(api.tourSchedules.create);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));

	const [tourId, setTourId] = useState("");
	const [date, setDate] = useState("");
	const [startTime, setStartTime] = useState("");
	const [endTime, setEndTime] = useState("");
	const [capacityTotal, setCapacityTotal] = useState("10");
	const [notes, setNotes] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const cap = Number(capacityTotal);
		if (!tourId) {
			setError("Please select a tour");
			setPending(false);
			return;
		}
		if (!date || !startTime || !endTime) {
			setError("Date and times are required");
			setPending(false);
			return;
		}
		if (cap <= 0) {
			setError("Capacity must be positive");
			setPending(false);
			return;
		}

		try {
			const id = await create({
				tourId: tourId as never,
				date,
				startTime,
				endTime,
				capacityTotal: cap,
				notes: notes || undefined,
			});
			toast.success("Schedule created");
			void navigate({
				to: "/dashboard/schedules/$scheduleId",
				params: { scheduleId: id },
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
					<CardTitle>New tour schedule</CardTitle>
					<CardDescription>
						Schedule a concrete tour instance
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

						<FormField label="Date *" htmlFor="date">
							<Input
								id="date"
								type="date"
								required
								value={date}
								onChange={(e) => setDate(e.target.value)}
							/>
						</FormField>

						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Start time *" htmlFor="start">
								<Input
									id="start"
									type="time"
									required
									value={startTime}
									onChange={(e) => setStartTime(e.target.value)}
								/>
							</FormField>
							<FormField label="End time *" htmlFor="end">
								<Input
									id="end"
									type="time"
									required
									value={endTime}
									onChange={(e) => setEndTime(e.target.value)}
								/>
							</FormField>
						</div>

						<FormField label="Capacity *" htmlFor="cap">
							<Input
								id="cap"
								type="number"
								min="1"
								required
								value={capacityTotal}
								onChange={(e) => setCapacityTotal(e.target.value)}
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
							onCancel={() => navigate({ to: "/dashboard/schedules" })}
							pending={pending}
							submitLabel="Create schedule"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
