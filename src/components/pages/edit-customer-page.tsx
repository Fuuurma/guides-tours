import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "@tanstack/react-router";
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
import { api } from "../../../convex/_generated/api";
import { FormActions, FormField } from "../form";

export function EditCustomerPage() {
	const { customerId } = useParams({ strict: false }) as { customerId: string };
	const navigate = useNavigate();
	const customer = useQuery(api.customers.get, { customerId: customerId as never });
	const update = useMutation(api.customers.update);

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [preferredLanguage, setPreferredLanguage] = useState("en");
	const [notes, setNotes] = useState("");
	const [vipStatus, setVipStatus] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (customer && !loaded) {
			const c = customer as unknown as {
				name: string;
				email: string;
				phone: string;
				preferredLanguage: string;
				notes: string;
				vipStatus: boolean;
			};
			setName(c.name);
			setEmail(c.email);
			setPhone(c.phone ?? "");
			setPreferredLanguage(c.preferredLanguage ?? "en");
			setNotes(c.notes ?? "");
			setVipStatus(!!c.vipStatus);
			setLoaded(true);
		}
	}, [customer, loaded]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);
		try {
			await update({
				customerId: customerId as never,
				name,
				email,
				phone: phone || undefined,
				preferredLanguage: preferredLanguage || "en",
				notes: notes || undefined,
				vipStatus,
			});
			toast.success("Customer updated");
			void navigate({
				to: "/dashboard/customers/$customerId",
				params: { customerId },
			});
		} catch (err) {
			setError((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	if (customer === undefined) {
		return <p className="text-muted-foreground">Loading…</p>;
	}
	if (customer === null) {
		return (
			<div className="space-y-4">
				<p className="text-muted-foreground">Customer not found.</p>
				<button
					type="button"
					className="text-blue-600 hover:underline"
					onClick={() => navigate({ to: "/dashboard/customers" })}
				>
					← Back to customers
				</button>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-2xl">
			<Card>
				<CardHeader>
					<CardTitle>Edit customer</CardTitle>
					<CardDescription>Update customer profile</CardDescription>
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

						<FormField label="Email *" htmlFor="email">
							<Input
								id="email"
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</FormField>

						<FormField label="Phone" htmlFor="phone">
							<Input
								id="phone"
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
							/>
						</FormField>

						<FormField label="Preferred language" htmlFor="lang">
							<Input
								id="lang"
								value={preferredLanguage}
								onChange={(e) => setPreferredLanguage(e.target.value)}
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

						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={vipStatus}
								onChange={(e) => setVipStatus(e.target.checked)}
							/>
							VIP customer
						</label>

						{error && <p className="text-destructive text-sm">{error}</p>}

						<FormActions
							onCancel={() =>
								navigate({
									to: "/dashboard/customers/$customerId",
									params: { customerId },
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