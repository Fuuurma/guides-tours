import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/utils";
import { validateCurrency, validateNonNegativeNumber } from "@/lib/validation";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/dashboard/settings/payments")({
	component: PaymentSettingsPage,
});

type PublicPaymentSettings = {
	stripeEnabled: boolean;
	stripePublishableKey: string;
	stripeIsSandbox: boolean;
	acceptDeposits: boolean;
	depositPercentage: number;
	defaultCurrency: string;
};

type PaymentFormValues = {
	stripeEnabled: boolean;
	stripePublishableKey: string;
	stripeSecretKey: string;
	stripeWebhookSecret: string;
	stripeIsSandbox: boolean;
	acceptDeposits: boolean;
	depositPercentage: string;
	defaultCurrency: string;
};

function metaErrors(
	errors: ReadonlyArray<unknown>,
): Array<{ message?: string }> {
	return errors.map((err) => {
		if (typeof err === "string") return { message: err };
		if (err && typeof err === "object" && "message" in err) {
			const message = (err as { message?: unknown }).message;
			if (typeof message === "string") return { message };
		}
		return { message: String(err) };
	});
}

function PaymentSettingsPage() {
	const { data: settings, isPending } = useQuery(
		convexQuery(api.payments.getPublicSettings, {}),
	);

	if (isPending) {
		return <DetailSkeleton />;
	}

	return (
		<PaymentSettingsForm
			settings={(settings as PublicPaymentSettings) ?? null}
		/>
	);
}

function PaymentSettingsForm({
	settings,
}: {
	settings: PublicPaymentSettings | null;
}) {
	const upsert = useMutation(api.payments.upsertSettings);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const stripeWebhookUrl =
		typeof window !== "undefined"
			? `${((import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ?? "").replace(/\/$/, "") || window.location.origin}/api/payments/stripe/webhook`
			: "/api/payments/stripe/webhook";

	const form = useForm({
		defaultValues: {
			stripeEnabled: settings?.stripeEnabled ?? false,
			stripePublishableKey: settings?.stripePublishableKey ?? "",
			stripeSecretKey: "",
			stripeWebhookSecret: "",
			stripeIsSandbox: settings?.stripeIsSandbox ?? true,
			acceptDeposits: settings?.acceptDeposits ?? false,
			depositPercentage: String(settings?.depositPercentage ?? 20),
			defaultCurrency: settings?.defaultCurrency ?? "USD",
		} satisfies PaymentFormValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof PaymentFormValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			const depositErr = validateNonNegativeNumber(
				value.depositPercentage,
				"Deposit percentage",
			);
			if (depositErr) fail("depositPercentage", depositErr);
			else {
				const deposit = Number(value.depositPercentage);
				if (deposit > 100) {
					fail(
						"depositPercentage",
						"Deposit percentage must be between 0 and 100",
					);
				}
			}
			const currencyErr = validateCurrency(value.defaultCurrency);
			if (currencyErr) fail("defaultCurrency", currencyErr);
			if (invalid) return;

			try {
				const secretKey = value.stripeSecretKey.trim();
				const webhookSecret = value.stripeWebhookSecret.trim();
				await upsert({
					stripeEnabled: value.stripeEnabled,
					stripePublishableKey: value.stripePublishableKey.trim(),
					stripeSecretKey:
						secretKey || (settings ? "placeholder-no-change" : ""),
					stripeWebhookSecret:
						webhookSecret || (settings ? "placeholder-no-change" : ""),
					stripeIsSandbox: value.stripeIsSandbox,
					acceptDeposits: value.acceptDeposits,
					depositPercentage: Number(value.depositPercentage),
					defaultCurrency: value.defaultCurrency.trim().toUpperCase(),
				});
				form.setFieldValue("stripeSecretKey", "");
				form.setFieldValue("stripeWebhookSecret", "");
				toast.success("Payment settings saved");
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
				toast.error(getErrorMessage(err));
			}
		},
	});

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<header className="flex items-center justify-between gap-4">
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

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-6">
					<Card>
						<CardHeader>
							<CardTitle>Stripe</CardTitle>
							<CardDescription>Online card payments via Stripe</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="gap-4">
								<form.Field name="stripeEnabled">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="stripe-enabled">
												Stripe enabled
											</FieldLabel>
											<Switch
												id="stripe-enabled"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="stripeIsSandbox">
									{(field) => (
										<Field orientation="horizontal">
											<Badge
												variant={field.state.value ? "secondary" : "default"}
											>
												{field.state.value ? "Sandbox" : "Live"}
											</Badge>
											<FieldLabel htmlFor="stripe-sandbox">
												Use sandbox/test mode
											</FieldLabel>
											<Switch
												id="stripe-sandbox"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="stripePublishableKey">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="pubKey">Publishable key</FieldLabel>
											<Input
												id="pubKey"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="pk_live_… or pk_test_…"
												maxLength={200}
												autoComplete="off"
											/>
											<FieldDescription>
												Required for in-page Payment Element (pk_…)
											</FieldDescription>
										</Field>
									)}
								</form.Field>
								<form.Field name="stripeSecretKey">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="secretKey">Secret key</FieldLabel>
											<Input
												id="secretKey"
												type="password"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder={settings ? "•••••••" : "sk_live_…"}
												maxLength={500}
												autoComplete="off"
											/>
											<FieldDescription>
												{settings
													? "Leave blank to keep existing"
													: "Encrypted at rest"}
											</FieldDescription>
										</Field>
									)}
								</form.Field>
								<form.Field name="stripeWebhookSecret">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="webhookSecret">
												Webhook secret
											</FieldLabel>
											<Input
												id="webhookSecret"
												type="password"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder={settings ? "•••••••" : "whsec_…"}
												maxLength={500}
												autoComplete="off"
											/>
											<FieldDescription>
												From Stripe dashboard → Webhooks → Signing secret
											</FieldDescription>
										</Field>
									)}
								</form.Field>
								<div className="rounded-md border bg-muted/40 p-3 text-sm">
									<p className="mb-1 font-medium">Webhook endpoint</p>
									<p className="mb-2 text-muted-foreground text-xs">
										Point Stripe at this URL (Convex HTTP action).
									</p>
									<code className="block break-all font-mono text-xs">
										{stripeWebhookUrl}
									</code>
									<p className="mt-2 text-muted-foreground text-xs">
										Uses <code className="font-mono">VITE_CONVEX_SITE_URL</code>{" "}
										when set; otherwise falls back to the app origin.
									</p>
								</div>
							</FieldGroup>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Deposits</CardTitle>
							<CardDescription>
								Charge a partial amount up-front for bookings
							</CardDescription>
						</CardHeader>
						<CardContent>
							<FieldGroup className="gap-4">
								<form.Field name="acceptDeposits">
									{(field) => (
										<Field orientation="horizontal">
											<FieldLabel htmlFor="accept-deposits">
												Accept deposits
											</FieldLabel>
											<Switch
												id="accept-deposits"
												checked={field.state.value}
												onCheckedChange={field.handleChange}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="depositPercentage">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="deposit">
												Deposit percentage
											</FieldLabel>
											<Input
												id="deposit"
												type="number"
												min="0"
												max="100"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldDescription>
												0-100, applied to total booking amount
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>
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
							<form.Field name="defaultCurrency">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="currency">Currency</FieldLabel>
										<Input
											id="currency"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) =>
												field.handleChange(e.target.value.toUpperCase())
											}
											maxLength={3}
											placeholder="USD"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>
						</CardContent>
					</Card>

					{submitErr ? <ErrorBanner message={submitErr} /> : null}

					<form.Subscribe
						selector={(state) => [state.canSubmit, state.isSubmitting] as const}
					>
						{([canSubmit, isSubmitting]) => (
							<div className="flex justify-end">
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
									{isSubmitting ? "Saving…" : "Save settings"}
								</Button>
							</div>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>
		</div>
	);
}
