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

export function NewVacationPage() {
	const navigate = useNavigate();
	const create = useMutation(api.vacationRequests.create);
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [reason, setReason] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		if (!startDate || !endDate) {
			setError("Start and end dates are required");
			setPending(false);
			return;
		}
		if (Date.parse(endDate) < Date.parse(startDate)) {
			setError("End date cannot be before start date");
			setPending(false);
			return;
		}

		try {
			const id = await create({
				startDate,
				endDate,
				reason: reason || undefined,
			});
			toast.success("Vacation request submitted");
			void navigate({
				to: "/dashboard/vacations/$vacationId",
				params: { vacationId: id },
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
					<CardTitle>New vacation request</CardTitle>
					<CardDescription>
						Request time off — pending review by an admin
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Start date *" htmlFor="start">
								<Input
									id="start"
									type="date"
									required
									value={startDate}
									onChange={(e) => setStartDate(e.target.value)}
								/>
							</FormField>
							<FormField label="End date *" htmlFor="end">
								<Input
									id="end"
									type="date"
									required
									value={endDate}
									onChange={(e) => setEndDate(e.target.value)}
								/>
							</FormField>
						</div>

						<FormField label="Reason" htmlFor="reason">
							<textarea
								id="reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								rows={3}
								placeholder="Optional — short note for the reviewer"
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
							/>
						</FormField>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<FormActions
							onCancel={() => navigate({ to: "/dashboard/vacations" })}
							pending={pending}
							submitLabel="Submit request"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
