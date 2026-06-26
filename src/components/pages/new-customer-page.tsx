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

export function NewCustomerPage() {
	const navigate = useNavigate();
	const create = useMutation(api.customers.create);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [preferredLanguage, setPreferredLanguage] = useState("en");
	const [notes, setNotes] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);
		try {
			const id = await create({
				name,
				email,
				phone: phone || undefined,
				preferredLanguage: preferredLanguage || "en",
				notes: notes || undefined,
			});
			toast.success("Customer created");
			void navigate({
				to: "/dashboard/customers/$customerId",
				params: { customerId: id },
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
					<CardTitle>New customer</CardTitle>
					<CardDescription>
						Add a customer to your organization
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
								placeholder="Jane Doe"
							/>
						</FormField>

						<FormField label="Email *" htmlFor="email">
							<Input
								id="email"
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="jane@example.com"
							/>
						</FormField>

						<FormField label="Phone" htmlFor="phone">
							<Input
								id="phone"
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder="+1 555 555 5555"
							/>
						</FormField>

						<FormField label="Preferred language" htmlFor="lang">
							<Input
								id="lang"
								value={preferredLanguage}
								onChange={(e) => setPreferredLanguage(e.target.value)}
								placeholder="en"
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
							onCancel={() => navigate({ to: "/dashboard/customers" })}
							pending={pending}
							submitLabel="Create customer"
						/>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}