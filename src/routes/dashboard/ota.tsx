import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { ALL_PROVIDERS } from "@/components/ota-providers";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
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
					{error && <ErrorBanner message={getSafeDisplayMessage(error)} />}
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
							{items.map((i, index) => {
								const label =
									ALL_PROVIDERS.find((p) => p.id === i.provider)?.label ??
									i.provider;
								const isBusy = pendingId === i._id;
								return (
									// Stagger each integration card in by 40ms so the
									// list feels responsive when it mounts. Stops
									// looking like a flash of unstyled content.
									<motion.li
										key={i._id}
										className="flex items-center justify-between gap-3 border rounded-lg p-3"
										initial={{ opacity: 0, y: 4 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{
											duration: 0.2,
											delay: index * 0.04,
											ease: "easeOut",
										}}
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
									</motion.li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>

			{available.length > 0 && (
				<NewIntegrationForm available={available.map((p) => p.id)} />
			)}

			<OtaProductsSection integrations={items} />

			<WebhookDeliveriesSection />

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

function OtaProductsSection({
	integrations,
}: {
	integrations: Array<{ _id: string; provider: string }>;
}) {
	const { data: products, isPending } = useQuery(
		convexQuery(api.otaProducts.list, {}),
	);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const createProduct = useMutation(api.otaProducts.create);
	const updateProduct = useMutation(api.otaProducts.update);
	const removeProduct = useMutation(api.otaProducts.remove);

	const [open, setOpen] = useState(false);
	const [editId, setEditId] = useState<Id<"otaProducts"> | null>(null);
	const [tourId, setTourId] = useState("");
	const [integrationId, setIntegrationId] = useState("");
	const [otaProductId, setOtaProductId] = useState("");
	const [otaProductCode, setOtaProductCode] = useState("");
	const [commissionRate, setCommissionRate] = useState("0.2");
	const [syncStatus, setSyncStatus] = useState("synced");
	const [pending, setPending] = useState(false);

	const tourName = (id: string) =>
		(tours ?? []).find((t) => t._id === id)?.name ?? id;
	const providerLabel = (id: string) => {
		const integ = integrations.find((i) => i._id === id);
		return (
			ALL_PROVIDERS.find((p) => p.id === integ?.provider)?.label ??
			integ?.provider ??
			id
		);
	};

	const onCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		try {
			const rate = Number(commissionRate);
			if (!tourId || !integrationId || !otaProductId.trim()) {
				throw new Error("Tour, integration, and OTA product ID are required");
			}
			if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
				throw new Error("Commission rate must be between 0 and 1");
			}
			if (editId) {
				await updateProduct({
					productId: editId,
					otaProductCode: otaProductCode.trim() || undefined,
					commissionRate: rate,
					syncStatus: syncStatus || undefined,
				});
				toast.success("OTA product updated");
			} else {
				await createProduct({
					tourId: tourId as Id<"tours">,
					integrationId: integrationId as Id<"otaIntegrations">,
					otaProductId: otaProductId.trim(),
					otaProductCode: otaProductCode.trim() || undefined,
					commissionRate: rate,
				});
				toast.success("OTA product linked");
			}
			setOpen(false);
			setEditId(null);
			setOtaProductId("");
			setOtaProductCode("");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	const openEdit = (p: {
		_id: Id<"otaProducts">;
		tourId: string;
		integrationId: string;
		otaProductId: string;
		otaProductCode?: string;
		commissionRate: number;
		syncStatus: string;
	}) => {
		setEditId(p._id);
		setTourId(p.tourId);
		setIntegrationId(p.integrationId);
		setOtaProductId(p.otaProductId);
		setOtaProductCode(p.otaProductCode ?? "");
		setCommissionRate(String(p.commissionRate));
		setSyncStatus(p.syncStatus || "synced");
		setOpen(true);
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div>
					<CardTitle>OTA products</CardTitle>
					<CardDescription>
						Link external listings to your tours for webhook matching
					</CardDescription>
				</div>
				<Button
					type="button"
					size="sm"
					disabled={integrations.length === 0}
					onClick={() => {
						setEditId(null);
						setIntegrationId(integrations[0]?._id ?? "");
						setTourId((tours ?? [])[0]?._id ?? "");
						setOtaProductId("");
						setOtaProductCode("");
						setCommissionRate("0.2");
						setSyncStatus("synced");
						setOpen(true);
					}}
				>
					+ Product
				</Button>
			</CardHeader>
			<CardContent>
				{isPending ? (
					<Skeleton className="h-12 w-full" />
				) : (products?.length ?? 0) === 0 ? (
					<p className="text-muted-foreground text-sm">
						No OTA products linked yet.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{(products ?? []).map((p) => (
							<li
								key={p._id}
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
							>
								<div className="text-sm min-w-0">
									<p className="font-medium truncate">
										{p.otaTitle || p.otaProductId}
									</p>
									<p className="text-muted-foreground text-xs">
										{providerLabel(p.integrationId)} · {tourName(p.tourId)} ·{" "}
										{p.syncStatus}
										{p.otaProductCode ? ` · ${p.otaProductCode}` : ""}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="secondary">
										{(p.commissionRate * 100).toFixed(0)}%
									</Badge>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => openEdit(p)}
									>
										Edit
									</Button>
									<Button
										type="button"
										size="sm"
										variant="destructive"
										onClick={async () => {
											if (!window.confirm("Delete this OTA product link?")) {
												return;
											}
											try {
												await removeProduct({ productId: p._id });
												toast.success("Product deleted");
											} catch (err) {
												toast.error(getErrorMessage(err));
											}
										}}
									>
										Delete
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}

				{open && (
					<form
						onSubmit={onCreate}
						className="mt-4 flex flex-col gap-3 border-t pt-4"
					>
						<p className="text-sm font-medium">
							{editId ? "Edit OTA product" : "Link OTA product"}
						</p>
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Tour *" htmlFor="ota-tour">
								<Select
									value={tourId}
									onValueChange={setTourId}
									disabled={Boolean(editId)}
								>
									<SelectTrigger id="ota-tour">
										<SelectValue placeholder="Select tour" />
									</SelectTrigger>
									<SelectContent>
										{(tours ?? []).map((t) => (
											<SelectItem key={t._id} value={t._id}>
												{t.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormField>
							<FormField label="Integration *" htmlFor="ota-integ">
								<Select
									value={integrationId}
									onValueChange={setIntegrationId}
									disabled={Boolean(editId)}
								>
									<SelectTrigger id="ota-integ">
										<SelectValue placeholder="Select integration" />
									</SelectTrigger>
									<SelectContent>
										{integrations.map((i) => (
											<SelectItem key={i._id} value={i._id}>
												{providerLabel(i._id)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormField>
						</div>
						<FormField label="OTA product ID *" htmlFor="ota-pid">
							<Input
								id="ota-pid"
								maxLength={500}
								value={otaProductId}
								onChange={(e) => setOtaProductId(e.target.value)}
								placeholder="Provider product / activity ID"
								disabled={Boolean(editId)}
							/>
						</FormField>
						<div className="grid gap-3 md:grid-cols-3">
							<FormField label="Product code" htmlFor="ota-code">
								<Input
									id="ota-code"
									maxLength={100}
									value={otaProductCode}
									onChange={(e) => setOtaProductCode(e.target.value)}
								/>
							</FormField>
							<FormField
								label="Commission rate"
								hint="0–1 (e.g. 0.2 = 20%)"
								htmlFor="ota-comm"
							>
								<Input
									id="ota-comm"
									type="number"
									min={0}
									max={1}
									step={0.01}
									value={commissionRate}
									onChange={(e) => setCommissionRate(e.target.value)}
								/>
							</FormField>
							{editId ? (
								<FormField label="Sync status" htmlFor="ota-sync">
									<Select value={syncStatus} onValueChange={setSyncStatus}>
										<SelectTrigger id="ota-sync">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="synced">synced</SelectItem>
											<SelectItem value="pending">pending</SelectItem>
											<SelectItem value="error">error</SelectItem>
											<SelectItem value="disabled">disabled</SelectItem>
										</SelectContent>
									</Select>
								</FormField>
							) : null}
						</div>
						<div className="flex gap-2 justify-end">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setOpen(false);
									setEditId(null);
								}}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={pending}>
								{pending
									? "Saving…"
									: editId
										? "Save changes"
										: "Create product"}
							</Button>
						</div>
					</form>
				)}
			</CardContent>
		</Card>
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
							autoComplete="off"
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
							autoComplete="off"
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
							autoComplete="off"
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

					{error && <ErrorBanner message={error} />}

					<FormActions pending={pending} submitLabel="Create integration" />
				</form>
			</CardContent>
		</Card>
	);
}

function WebhookDeliveriesSection() {
	const { data: deliveries, isPending } = useQuery(
		convexQuery(api.webhookDeliveries.listRecent, { limit: 40 }),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent webhook deliveries</CardTitle>
				<CardDescription>
					OTA and Stripe webhook attempts for this organization
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isPending ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : !deliveries || deliveries.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No webhook deliveries recorded yet.
					</p>
				) : (
					<ul className="divide-y rounded-md border">
						{deliveries.map((d) => (
							<li
								key={d._id}
								className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
							>
								<div className="min-w-0">
									<p className="font-medium truncate">
										{d.source} · {d.eventType}
									</p>
									<p className="text-muted-foreground text-xs truncate font-mono">
										{d.eventId}
										{d.errorMessage ? ` — ${d.errorMessage}` : ""}
										{d.skipReason ? ` — ${d.skipReason}` : ""}
									</p>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<StatusBadge status={d.status} />
									<span className="text-muted-foreground text-xs font-mono">
										{new Date(d.receivedAt).toLocaleString()}
									</span>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
