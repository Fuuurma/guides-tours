import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
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
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage, getSafeDisplayMessage } from "@/lib/utils";
import { validateNonNegativeNumber } from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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
	const confirm = useConfirm();
	const [pending, setPending] = useState<{
		id: string;
		kind: "toggle" | "delete";
	} | null>(null);

	const toggleActive = async (id: string, currentActive: boolean) => {
		setPending({ id, kind: "toggle" });
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
			setPending(null);
		}
	};
	const onRemove = async (id: string, label: string) => {
		const ok = await confirm({
			title: `Delete the ${label} integration?`,
			description: "Webhooks will stop being accepted.",
			variant: "destructive",
		});
		if (!ok) {
			return;
		}
		setPending({ id, kind: "delete" });
		try {
			await removeIntegration({ integrationId: id as Id<"otaIntegrations"> });
			toast.success("Integration deleted");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setPending(null);
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
		<div className="flex flex-col gap-6">
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
						<div className="flex flex-col gap-2">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : items.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No integrations yet. Add one below to receive OTA reservations.
						</p>
					) : (
						<ul className="flex flex-col gap-3">
							{items.map((i, index) => {
								const label =
									ALL_PROVIDERS.find((p) => p.id === i.provider)?.label ??
									i.provider;
								const isBusy = pending?.id === i._id;
								return (
									<motion.li
										key={i._id}
										className="flex items-center justify-between gap-3 rounded-lg border p-3"
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
										<div className="flex flex-shrink-0 items-center gap-2">
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
												{isBusy && pending?.kind === "toggle" ? (
													<Spinner data-icon="inline-start" />
												) : null}
												{i.isActive ? "Disable" : "Enable"}
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() => onRemove(i._id, label)}
												disabled={isBusy}
											>
												{isBusy && pending?.kind === "delete" ? (
													<Spinner data-icon="inline-start" />
												) : null}
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
				<NewIntegrationForm
					key={available.join(",")}
					available={available.map((p) => p.id)}
				/>
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
					<ul className="flex flex-col gap-2 font-mono text-sm">
						{ALL_PROVIDERS.map((p) => (
							<li key={p.id} className="flex items-center gap-2">
								<span className="w-24 not-italic">{p.label}:</span>
								<code className="rounded bg-muted px-2 py-0.5 text-xs">
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

type ProductDraft = {
	tourId: string;
	integrationId: string;
	otaProductId: string;
	otaProductCode: string;
	commissionRate: string;
	syncStatus: string;
};

function OtaProductsSection({
	integrations,
}: {
	integrations: Array<{ _id: string; provider: string }>;
}) {
	const { data: products, isPending } = useQuery(
		convexQuery(api.otaProducts.list, {}),
	);
	const { data: tours } = useQuery(convexQuery(api.tours.list, {}));
	const removeProduct = useMutation(api.otaProducts.remove);
	const confirm = useConfirm();
	const [open, setOpen] = useState(false);
	const [editId, setEditId] = useState<Id<"otaProducts"> | null>(null);
	const [draft, setDraft] = useState<ProductDraft>({
		tourId: "",
		integrationId: "",
		otaProductId: "",
		otaProductCode: "",
		commissionRate: "0.2",
		syncStatus: "synced",
	});
	const [deletingId, setDeletingId] = useState<string | null>(null);

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

	const openCreate = () => {
		setEditId(null);
		setDraft({
			tourId: (tours ?? [])[0]?._id ?? "",
			integrationId: integrations[0]?._id ?? "",
			otaProductId: "",
			otaProductCode: "",
			commissionRate: "0.2",
			syncStatus: "synced",
		});
		setOpen(true);
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
		setDraft({
			tourId: p.tourId,
			integrationId: p.integrationId,
			otaProductId: p.otaProductId,
			otaProductCode: p.otaProductCode ?? "",
			commissionRate: String(p.commissionRate),
			syncStatus: p.syncStatus || "synced",
		});
		setOpen(true);
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
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
					onClick={openCreate}
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
								<div className="min-w-0 text-sm">
									<p className="truncate font-medium">
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
										disabled={deletingId === p._id}
										onClick={async () => {
											const ok = await confirm({
												title: "Delete this OTA product link?",
												variant: "destructive",
											});
											if (!ok) {
												return;
											}
											setDeletingId(p._id);
											try {
												await removeProduct({ productId: p._id });
												toast.success("Product deleted");
											} catch (err) {
												toast.error(getErrorMessage(err));
											} finally {
												setDeletingId(null);
											}
										}}
									>
										{deletingId === p._id ? (
											<Spinner data-icon="inline-start" />
										) : null}
										Delete
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}

				{open ? (
					<OtaProductForm
						key={editId ?? "new"}
						editId={editId}
						initial={draft}
						tours={tours ?? []}
						integrations={integrations}
						providerLabel={providerLabel}
						onClose={() => {
							setOpen(false);
							setEditId(null);
						}}
					/>
				) : null}
			</CardContent>
		</Card>
	);
}

function OtaProductForm({
	editId,
	initial,
	tours,
	integrations,
	providerLabel,
	onClose,
}: {
	editId: Id<"otaProducts"> | null;
	initial: ProductDraft;
	tours: Array<{ _id: string; name: string }>;
	integrations: Array<{ _id: string; provider: string }>;
	providerLabel: (id: string) => string;
	onClose: () => void;
}) {
	const createProduct = useMutation(api.otaProducts.create);
	const updateProduct = useMutation(api.otaProducts.update);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: initial satisfies ProductDraft,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof ProductDraft, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};
			if (!value.tourId) fail("tourId", "Tour is required");
			if (!value.integrationId)
				fail("integrationId", "Integration is required");
			if (!value.otaProductId.trim()) {
				fail("otaProductId", "OTA product ID is required");
			}
			const rateErr = validateNonNegativeNumber(
				value.commissionRate,
				"Commission rate",
			);
			if (rateErr) fail("commissionRate", rateErr);
			else if (Number(value.commissionRate) > 1) {
				fail("commissionRate", "Commission rate must be between 0 and 1");
			}
			if (invalid) return;

			try {
				const rate = Number(value.commissionRate);
				if (editId) {
					await updateProduct({
						productId: editId,
						otaProductCode: value.otaProductCode.trim() || undefined,
						commissionRate: rate,
						syncStatus: value.syncStatus || undefined,
					});
					toast.success("OTA product updated");
				} else {
					await createProduct({
						tourId: value.tourId as Id<"tours">,
						integrationId: value.integrationId as Id<"otaIntegrations">,
						otaProductId: value.otaProductId.trim(),
						otaProductCode: value.otaProductCode.trim() || undefined,
						commissionRate: rate,
					});
					toast.success("OTA product linked");
				}
				onClose();
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
				toast.error(getErrorMessage(err));
			}
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
			className="mt-4 border-t pt-4"
		>
			<FieldGroup className="gap-3">
				<p className="text-sm font-medium">
					{editId ? "Edit OTA product" : "Link OTA product"}
				</p>
				<FieldGroup className="grid gap-3 md:grid-cols-2">
					<form.Field name="tourId">
						{(field) => (
							<Field data-invalid={!field.state.meta.isValid}>
								<FieldLabel htmlFor="ota-tour">Tour *</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={field.handleChange}
									disabled={Boolean(editId)}
								>
									<SelectTrigger id="ota-tour">
										<SelectValue placeholder="Select tour" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{tours.map((t) => (
												<SelectItem key={t._id} value={t._id}>
													{t.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
								<FieldError errors={metaErrors(field.state.meta.errors)} />
							</Field>
						)}
					</form.Field>
					<form.Field name="integrationId">
						{(field) => (
							<Field data-invalid={!field.state.meta.isValid}>
								<FieldLabel htmlFor="ota-integ">Integration *</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={field.handleChange}
									disabled={Boolean(editId)}
								>
									<SelectTrigger id="ota-integ">
										<SelectValue placeholder="Select integration" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{integrations.map((i) => (
												<SelectItem key={i._id} value={i._id}>
													{providerLabel(i._id)}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
								<FieldError errors={metaErrors(field.state.meta.errors)} />
							</Field>
						)}
					</form.Field>
				</FieldGroup>
				<form.Field name="otaProductId">
					{(field) => (
						<Field data-invalid={!field.state.meta.isValid}>
							<FieldLabel htmlFor="ota-pid">OTA product ID *</FieldLabel>
							<Input
								id="ota-pid"
								maxLength={500}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Provider product / activity ID"
								disabled={Boolean(editId)}
								aria-invalid={!field.state.meta.isValid}
							/>
							<FieldError errors={metaErrors(field.state.meta.errors)} />
						</Field>
					)}
				</form.Field>
				<FieldGroup className="grid gap-3 md:grid-cols-3">
					<form.Field name="otaProductCode">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="ota-code">Product code</FieldLabel>
								<Input
									id="ota-code"
									maxLength={100}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
							</Field>
						)}
					</form.Field>
					<form.Field name="commissionRate">
						{(field) => (
							<Field data-invalid={!field.state.meta.isValid}>
								<FieldLabel htmlFor="ota-comm">Commission rate</FieldLabel>
								<Input
									id="ota-comm"
									type="number"
									min={0}
									max={1}
									step={0.01}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={!field.state.meta.isValid}
								/>
								<FieldDescription>0–1 (e.g. 0.2 = 20%)</FieldDescription>
								<FieldError errors={metaErrors(field.state.meta.errors)} />
							</Field>
						)}
					</form.Field>
					{editId ? (
						<form.Field name="syncStatus">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="ota-sync">Sync status</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger id="ota-sync">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="synced">synced</SelectItem>
												<SelectItem value="pending">pending</SelectItem>
												<SelectItem value="error">error</SelectItem>
												<SelectItem value="disabled">disabled</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
					) : null}
				</FieldGroup>
				{submitErr ? <ErrorBanner message={submitErr} /> : null}
				<form.Subscribe
					selector={(state) => [state.canSubmit, state.isSubmitting] as const}
				>
					{([canSubmit, isSubmitting]) => (
						<div className="flex justify-end gap-2">
							<Button type="button" variant="outline" onClick={onClose}>
								Cancel
							</Button>
							<Button type="submit" disabled={!canSubmit || isSubmitting}>
								{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
								{isSubmitting
									? "Saving…"
									: editId
										? "Save changes"
										: "Create product"}
							</Button>
						</div>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}

function NewIntegrationForm({ available }: { available: readonly string[] }) {
	const create = useMutation(api.ota.integrations_mutations.create);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			provider: available[0] ?? "",
			apiKey: "",
			apiSecret: "",
			webhookSecret: "",
			isSandbox: true,
		},
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (
				name: "provider" | "apiKey" | "apiSecret" | "webhookSecret",
				message: string,
			) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};
			if (!value.provider) fail("provider", "Provider is required");
			if (!value.apiKey.trim()) fail("apiKey", "API key is required");
			if (invalid) return;

			try {
				await create({
					provider: value.provider,
					apiKey: value.apiKey.trim(),
					apiSecret: value.apiSecret.trim() || undefined,
					webhookSecret: value.webhookSecret.trim() || undefined,
					isSandbox: value.isSandbox,
				});
				toast.success("Integration created");
				form.reset();
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
				toast.error(getErrorMessage(err));
			}
		},
	});

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
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<FieldGroup className="gap-4">
						<form.Field name="provider">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="provider">Provider</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger id="provider">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{available.map((p) => (
													<SelectItem key={p} value={p}>
														{ALL_PROVIDERS.find((x) => x.id === p)?.label ?? p}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
						<form.Field name="apiKey">
							{(field) => (
								<Field data-invalid={!field.state.meta.isValid}>
									<FieldLabel htmlFor="apiKey">API key *</FieldLabel>
									<Input
										id="apiKey"
										type="password"
										required
										maxLength={500}
										autoComplete="off"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="abc123…"
										aria-invalid={!field.state.meta.isValid}
									/>
									<FieldDescription>
										Encrypted at rest via convex/lib/crypto
									</FieldDescription>
									<FieldError errors={metaErrors(field.state.meta.errors)} />
								</Field>
							)}
						</form.Field>
						<form.Field name="apiSecret">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="apiSecret">API secret</FieldLabel>
									<Input
										id="apiSecret"
										type="password"
										maxLength={500}
										autoComplete="off"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="(optional)"
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="webhookSecret">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="webhookSecret">
										Webhook secret
									</FieldLabel>
									<Input
										id="webhookSecret"
										type="password"
										maxLength={500}
										autoComplete="off"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="(optional)"
									/>
									<FieldDescription>
										Used to verify incoming webhook signatures
									</FieldDescription>
								</Field>
							)}
						</form.Field>
						<form.Field name="isSandbox">
							{(field) => (
								<Field orientation="horizontal">
									<FieldLabel htmlFor="ota-sandbox">
										Sandbox / test environment
									</FieldLabel>
									<Switch
										id="ota-sandbox"
										checked={field.state.value}
										onCheckedChange={field.handleChange}
									/>
								</Field>
							)}
						</form.Field>
						{submitErr ? <ErrorBanner message={submitErr} /> : null}
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<div className="flex justify-end">
									<Button type="submit" disabled={!canSubmit || isSubmitting}>
										{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
										{isSubmitting ? "Saving…" : "Create integration"}
									</Button>
								</div>
							)}
						</form.Subscribe>
					</FieldGroup>
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
									<p className="truncate font-medium">
										{d.source} · {d.eventType}
									</p>
									<p className="truncate font-mono text-muted-foreground text-xs">
										{d.eventId}
										{d.errorMessage ? ` — ${d.errorMessage}` : ""}
										{d.skipReason ? ` — ${d.skipReason}` : ""}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<StatusBadge status={d.status} />
									<span className="font-mono text-muted-foreground text-xs">
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
