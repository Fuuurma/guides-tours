import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import { FormActions, FormField } from "../../components/form";

export const Route = createFileRoute("/dashboard/ota")({
	component: OtaIntegrationsPage,
});

const ALL_PROVIDERS = [
	{ id: "viator", label: "Viator" },
	{ id: "getyourguide", label: "GetYourGuide" },
	{ id: "airbnb", label: "Airbnb" },
	{ id: "tripadvisor", label: "TripAdvisor" },
	{ id: "klook", label: "Klook" },
	{ id: "booking", label: "Booking.com" },
	{ id: "expedia", label: "Expedia" },
] as const;

function OtaIntegrationsPage() {
	const { data: integrations, isPending, error } = useQuery(
		convexQuery(api.ota.integrations.list, {}),
	);

	const items = (integrations ?? []) as Array<{
		_id: string;
		provider: string;
		isActive: boolean;
		isSandbox: boolean;
		syncIntervalMinutes: number;
		lastSyncAt?: number;
		lastSyncStatus?: string;
	}>;

	const configured = new Set(items.map((i) => i.provider));
	const available = ALL_PROVIDERS.filter((p) => !configured.has(p.id));

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">OTA integrations</h1>
					<p className="text-muted-foreground text-sm">
						Connect third-party booking platforms to receive reservations via
						webhooks.
					</p>
				</div>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>Active integrations</CardTitle>
					<CardDescription>
						{items.length} of {ALL_PROVIDERS.length} providers connected
					</CardDescription>
				</CardHeader>
				<CardContent>
					{error && (
						<p className="text-destructive text-sm">
							Error: {error.message}
						</p>
					)}
					{isPending ? (
						<p className="text-muted-foreground text-sm">Loading…</p>
					) : items.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No integrations yet. Add one below.
						</p>
					) : (
						<ul className="space-y-3">
							{items.map((i) => (
								<li
									key={i._id}
									className="flex items-center justify-between border rounded-lg p-3"
								>
									<div>
										<p className="font-medium">
											{ALL_PROVIDERS.find((p) => p.id === i.provider)
												?.label ?? i.provider}
										</p>
										<p className="text-muted-foreground text-xs">
											Sync every {i.syncIntervalMinutes}m
											{i.lastSyncAt
												? ` · last sync ${new Date(i.lastSyncAt).toLocaleString()}`
												: ""}
										</p>
									</div>
									<div className="flex items-center gap-2">
										{i.isSandbox && (
											<Badge variant="secondary">Sandbox</Badge>
										)}
										{i.isActive ? (
											<Badge>Active</Badge>
										) : (
											<Badge variant="secondary">Disabled</Badge>
										)}
									</div>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			{available.length > 0 && (
				<NewIntegrationForm
					available={available.map((p) => p.id)}
				/>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Webhook URLs</CardTitle>
					<CardDescription>
						Give these URLs to each OTA to register their webhook callbacks.
						Each provider has its own signature verification in the backend.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2 text-sm font-mono">
						{ALL_PROVIDERS.map((p) => (
							<li key={p.id} className="flex items-center gap-2">
								<span className="w-24 not-italic">{p.label}:</span>
								<code className="bg-muted px-2 py-0.5 rounded text-xs">
									/api/ota/webhooks/{p.id}
								</code>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<footer>
				<Button variant="link" asChild>
					<Link to="/dashboard">← Back to dashboard</Link>
				</Button>
			</footer>
		</div>
	);
}

function NewIntegrationForm({
	available,
}: {
	available: readonly string[];
}) {
	const create = useMutation(api.ota.integrations_mutations.create);
	const [provider, setProvider] = useState<string>(available[0] ?? "");
	const [apiKey, setApiKey] = useState("");
	const [apiSecret, setApiSecret] = useState("");
	const [webhookSecret, setWebhookSecret] = useState("");
	const [isSandbox, setIsSandbox] = useState(true);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);
		try {
			await create({
				provider,
				apiKey,
				apiSecret: apiSecret || undefined,
				webhookSecret: webhookSecret || undefined,
				isSandbox,
			});
			toast.success("Integration created");
			setApiKey("");
			setApiSecret("");
			setWebhookSecret("");
		} catch (err) {
			setError((err as Error).message);
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Add integration</CardTitle>
				<CardDescription>
					Enter the credentials your OTA provider gave you. Secrets are
					encrypted at rest.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<FormField label="Provider" htmlFor="provider">
						<select
							id="provider"
							value={provider}
							onChange={(e) => setProvider(e.target.value)}
							className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
						>
							{available.map((p) => (
								<option key={p} value={p}>
									{ALL_PROVIDERS.find((x) => x.id === p)?.label ?? p}
								</option>
							))}
						</select>
					</FormField>

					<FormField
						label="API key *"
						hint="Encrypted at rest via convex/lib/crypto"
						htmlFor="apiKey"
					>
						<Input
							id="apiKey"
							required
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="abc123…"
						/>
					</FormField>

					<FormField label="API secret" htmlFor="apiSecret">
						<Input
							id="apiSecret"
							type="password"
							value={apiSecret}
							onChange={(e) => setApiSecret(e.target.value)}
							placeholder="(optional)"
						/>
					</FormField>

					<FormField
						label="Webhook secret"
						hint="Used to verify incoming webhook signatures"
						htmlFor="webhookSecret"
					>
						<Input
							id="webhookSecret"
							type="password"
							value={webhookSecret}
							onChange={(e) => setWebhookSecret(e.target.value)}
							placeholder="(optional)"
						/>
					</FormField>

					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={isSandbox}
							onChange={(e) => setIsSandbox(e.target.checked)}
						/>
						Sandbox / test environment
					</label>

					{error && <p className="text-destructive text-sm">{error}</p>}

					<FormActions pending={pending} submitLabel="Create integration" />
				</form>
			</CardContent>
		</Card>
	);
}
