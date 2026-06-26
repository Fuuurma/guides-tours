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

export function NewDriverPage() {
	const navigate = useNavigate();
	const create = useMutation(api.drivers.create);
	const [userId, setUserId] = useState("");
	const [licenseInfo, setLicenseInfo] = useState("");
	const [notes, setNotes] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		try {
			const id = await create({
				userId,
				licenseInfo,
				notes: notes || undefined,
			});
			toast.success("Driver created");
			void navigate({
				to: "/dashboard/drivers/$driverId",
				params: { driverId: id },
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
					<CardTitle>New driver</CardTitle>
					<CardDescription>
						Add a driver to your fleet
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="space-y-4">
						<FormField
							label="User ID *"
							hint="Better Auth user ID of the driver"
							htmlFor="userId"
						>
							<Input
								id="userId"
								required
								value={userId}
								onChange={(e) => setUserId(e.target.value)}
								placeholder="user_abc123"
							/>
						</FormField>

						<FormField
							label="License info *"
							hint="License number, class, expiration"
							htmlFor="license"
						>
							<Input
								id="license"
								required
								value={licenseInfo}
								onChange={(e) => setLicenseInfo(e.target.value)}
								placeholder="Class B, expires 2027-06-30"
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
							onCancel={() => navigate({ to: "/dashboard/drivers" })}
							pending={pending}
							submitLabel="Create driver"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
