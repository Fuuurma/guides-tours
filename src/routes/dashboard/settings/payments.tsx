import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "../../../../convex/_generated/api";
import { FormActions, FormField } from "../../../components/form";

export const Route = createFileRoute("/dashboard/settings/payments")({
	component: PaymentSettingsPage,
});

function PaymentSettingsPage() {
	const { data: settings, isPending } = useQuery(
		convexQuery(api.payments.getPublicSettings, {}),
	);
	const upsert = useMutation(api.payments.upsertSettings);

	const [stripeEnabled, setStripeEnabled] = useState(false);
	const [stripePublishableKey, setStripePublishableKey] = useState("");
	const [stripeSecretKey, setStripeSecretKey] = useState("");
	const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
	const [stripeIsSandbox, setStripeIsSandbox] = useState(true);
	const [acceptDeposits, setAcceptDeposits] = useState(false);
	const [depositPercentage, setDepositPercentage] = useState("20");
	const [defaultCurrency, setDefaultCurrency] = useState("USD");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (settings) {
			const s = settings as {
				stripeEnabled: boolean;
				stripePublishableKey: string;
				stripeIsSandbox: boolean;
				acceptDeposits: boolean;
				depositPercentage: number;
				defaultCurrency: string;
			};
			setStripeEnabled(s.stripeEnabled);
			setStripePublishableKey(s.stripePublishableKey);
			setStripeIsSandbox(s.stripeIsSandbox);
			setAcceptDeposits(s.acceptDeposits);
			setDepositPercentage(s.depositPercentage.toString());
			setDefaultCurrency(s.defaultCurrency);
		}
	}, [settings]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);

		const deposit = Number(depositPercentage);
		if (deposit < 0 || deposit > 100) {
			setError("Deposit percentage must be between 0 and 100");
			setPending(false);
			return;
		}

		try {
			await upsert({
				stripeEnabled,
				stripePublishableKey,
				stripeSecretKey: stripeSecretKey || "placeholder-no-change",
				stripeWebhookSecret:
					stripeWebhookSecret || "placeholder-no-change",
				stripeIsSandbox,
				acceptDeposits,
				depositPercentage: deposit,
				defaultCurrency,
			});
			setStripeSecretKey("");
			setStripeWebhookSecret("");
			toast.success("Payment settings saved");
		} catch (err) {
			setError((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	if (isPending) {
		return <p className="text-muted-foreground">Loading...</p>;
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Payment settings</h1>
					<p className="text-muted-foreground text-sm">
						Stripe configuration and deposit policy
					</p>
				</div>
				<Button asChild variant="outline">
					<Link to="/dashboard">← Back</Link>
				</Button>
			</header>

			<form onSubmit={onSubmit} className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Stripe</CardTitle>
						<CardDescription>
							Online card payments via Stripe
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<label className="flex items-center gap-2 text-sm">
							<Checkbox
								checked={stripeEnabled}
								onCheckedChange={(c) => setStripeEnabled(c === true)}
							/>
							Stripe enabled
						</label>
						<div className="flex items-center gap-2">
							<Badge variant={stripeIsSandbox ? "secondary" : "default"}>
								{stripeIsSandbox ? "Sandbox" : "Live"}
							</Badge>
							<label className="text-xs text-muted-foreground flex items-center gap-1">
								<Checkbox
									checked={stripeIsSandbox}
									onCheckedChange={(c) => setStripeIsSandbox(c === true)}
								/>
								Use sandbox/test mode
							</label>
						</div>
						<FormField
							label="Publishable key"
							htmlFor="pubKey"
						>
							<Input
								id="pubKey"
								value={stripePublishableKey}
								onChange={(e) => setStripePublishableKey(e.target.value)}
								placeholder="pk_live_… or pk_test_…"
							/>
						</FormField>
						<FormField
							label="Secret key"
							hint={
								settings
									? "Leave blank to keep existing"
									: "Encrypted at rest"
							}
							htmlFor="secretKey"
						>
							<Input
								id="secretKey"
								type="password"
								value={stripeSecretKey}
								onChange={(e) => setStripeSecretKey(e.target.value)}
								placeholder={settings ? "•••••••" : "sk_live_…"}
							/>
						</FormField>
						<FormField
							label="Webhook secret"
							hint="From Stripe dashboard → Webhooks → Signing secret"
							htmlFor="webhookSecret"
						>
							<Input
								id="webhookSecret"
								type="password"
								value={stripeWebhookSecret}
								onChange={(e) => setStripeWebhookSecret(e.target.value)}
								placeholder={settings ? "•••••••" : "whsec_…"}
							/>
						</FormField>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Deposits</CardTitle>
						<CardDescription>
							Charge a partial amount up-front for bookings
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<label className="flex items-center gap-2 text-sm">
							<Checkbox
								checked={acceptDeposits}
								onCheckedChange={(c) => setAcceptDeposits(c === true)}
							/>
							Accept deposits
						</label>
						<FormField
							label="Deposit percentage"
							hint="0-100, applied to total booking amount"
							htmlFor="deposit"
						>
							<Input
								id="deposit"
								type="number"
								min="0"
								max="100"
								value={depositPercentage}
								onChange={(e) => setDepositPercentage(e.target.value)}
							/>
						</FormField>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Default currency</CardTitle>
						<CardDescription>
							ISO 4217 code, e.g. USD, EUR, GBP
						</CardDescription>
					</CardHeader>
					<CardContent>
						<FormField label="Currency" htmlFor="currency">
							<Input
								id="currency"
								value={defaultCurrency}
								onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
								maxLength={3}
								placeholder="USD"
							/>
						</FormField>
					</CardContent>
				</Card>

				{error && <p className="text-destructive text-sm">{error}</p>}

				<FormActions pending={pending} submitLabel="Save settings" />
			</form>
		</div>
	);
}
