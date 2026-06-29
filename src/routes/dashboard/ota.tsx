import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ALL_PROVIDERS } from "@/components/ota-providers";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import { FormActions, FormField } from "../../components/form";

export const Route = createFileRoute("/dashboard/ota")({
	component: OtaIntegrationsPage,
});

function OtaIntegrationsPage() {
	const {
		data: integrations,
		isPending,
		error,
	} = useQuery(convexQuery(api.ota.integrations.list, {}));
	const updateIntegration = useMutation(api.ota.integrations_mutations.update);
	const removeIntegration = useMutation(api.ota.integrations_mutations.remove);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPendingId(id);
		try {
			await updateIntegration({
				integrationId: id as Id<"otaIntegrations">,
				isActive: !currentActive,
			});
			toast.success(
				currentActive ? "Integration disabled" : "Integration enabled",
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};
	const onRemove = async (id: string, label: string) => {
		if (
			!window.confirm(
				`Delete the ${label} integration? Webhooks will stop being accepted.`,
			)
		) {
			return;
		}
		setPendingId(id);
		try {
			await removeIntegration({ integrationId: id as Id<"otaIntegrations"> });
			toast.success("Integration deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPendingId(null);
		}
	};

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
						<p className="text-destructive text-sm">Error: {error.message}</p>
					)}
					{isPending ? (
						<div className="space-y-2">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : items.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No integrations yet. Add one below.
						</p>
					) : (
						<ul className="space-y-3">
							{items.map((i) => {
								const label =
									ALL_PROVIDERS.find((p) => p.id === i.provider)?.label ??
									i.provider;
								const isBusy = pendingId === i._id;
								return (
									<li
										key={i._id}
										className="flex items-center justify-between gap-3 border rounded-lg p-3"
									>
										<div className="min-w-0 flex-1">
											<p className="font-medium">{label}</p>
											<p className="text-muted-foreground text-xs">
												Sync every {i.syncIntervalMinutes}m
												{i.lastSyncAt
													? ` · last sync ${new Date(i.lastSyncAt).toLocaleString()}`
													: ""}
											</p>
										</div>
										<div className="flex items-center gap-2 flex-shrink-0">
											{i.isSandbox && (
												<Badge variant="secondary">Sandbox</Badge>
											)}
											{i.isActive ? (
												<Badge>Active</Badge>
											) : (
												<Badge variant="secondary">Disabled</Badge>
											)}
											<Button
												size="sm"
												variant="outline"
												onClick={() => toggleActive(i._id, i.isActive)}
												disabled={isBusy}
											>
												{i.isActive ? "Disable" : "Enable"}
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() => onRemove(i._id, label)}
												disabled={isBusy}
											>
												Delete
											</Button>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>

			{available.length > 0 && (
				<NewIntegrationForm available={available.map((p) => p.id)} />
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

function NewIntegrationForm({ available }: { available: readonly string[] }) {
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

		// Trim API key — browsers don't always trim required fields.
		const apiKeyTrimmed = apiKey.trim();
		if (!apiKeyTrimmed) {
			setError("API key is required");
			setPending(false);
			return;
		}

		try {
			await create({
				provider,
				apiKey: apiKeyTrimmed,
				apiSecret: apiSecret.trim() || undefined,
				webhookSecret: webhookSecret.trim() || undefined,
				isSandbox,
			});
			toast.success("Integration created");
			setApiKey("");
			setApiSecret("");
			setWebhookSecret("");
		} catch (err) {
			setError(getErrorMessage(err));
			toast.error(getErrorMessage(err));
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
						<Select value={provider} onValueChange={setProvider}>
							<SelectTrigger id="provider">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{available.map((p) => (
									<SelectItem key={p} value={p}>
										{ALL_PROVIDERS.find((x) => x.id === p)?.label ?? p}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FormField>

					<FormField
						label="API key *"
						hint="Encrypted at rest via convex/lib/crypto"
						htmlFor="apiKey"
					>
						<Input
							id="apiKey"
							required
							maxLength={500}
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="abc123…"
						/>
					</FormField>

					<FormField label="API secret" htmlFor="apiSecret">
						<Input
							id="apiSecret"
							type="password"
							maxLength={500}
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
							maxLength={500}
							value={webhookSecret}
							onChange={(e) => setWebhookSecret(e.target.value)}
							placeholder="(optional)"
						/>
					</FormField>

					<label
						htmlFor="ota-sandbox"
						className="flex items-center gap-2 text-sm"
					>
						<Checkbox
							id="ota-sandbox"
							checked={isSandbox}
							onCheckedChange={(c) => setIsSandbox(c === true)}
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
