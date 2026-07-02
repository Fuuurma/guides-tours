import { useForm } from "@tanstack/react-form";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
	component: OnboardingPage,
});

const orgSchema = z.object({
	name: z.string().min(2, "Company name must be at least 2 characters"),
	slug: z
		.string()
		.min(2, "Slug must be at least 2 characters")
		.max(40, "Slug too long")
		.regex(
			/^[a-z0-9-]+$/,
			"Slug can only contain lowercase letters, digits, and dashes",
		),
});

type OrgForm = z.infer<typeof orgSchema>;

function OnboardingPage() {
	const form = useForm({
		defaultValues: { name: "", slug: "" } satisfies OrgForm,
		validators: { onSubmit: orgSchema },
		onSubmit: async ({ value }) => {
			const { error } = await authClient.organization.create({
				name: value.name,
				slug: value.slug,
				keepCurrentActiveOrganization: false,
			});
			if (error) {
				throw new Error(error.message);
			}
			// Force-refresh so the dashboard's tenant-scoped queries
			// pick up the new active org from session.
			window.location.assign("/dashboard");
		},
	});

	// Auto-derive slug from company name (lowercase, replace spaces with dashes).
	// Track the raw name in local state so we can debounce the auto-fill.
	// Without debounce, the slug re-renders on every keystroke — which
	// is wasteful and can clobber a user who manually edits the slug
	// during typing.
	const [rawName, setRawName] = useState("");
	const [debouncedName] = useDebouncedValue(rawName, {
		wait: 200,
		leading: false,
		trailing: true,
	});

	// Subscribe to form state changes to mirror the name field into
	// our local rawName state.
	useEffect(() => {
		const subscription = form.store.subscribe(() => {
			const name = form.store.state.values.name as string;
			if (name !== rawName) {
				setRawName(name);
			}
		});
		return () => {
			subscription.unsubscribe();
		};
	}, [form, rawName]);

	// When the debounced name changes, auto-fill the slug if it's empty.
	useEffect(() => {
		if (debouncedName && !(form.store.state.values.slug as string)) {
			form.setFieldValue(
				"slug",
				debouncedName
					.toLowerCase()
					.trim()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.slice(0, 40),
			);
		}
	}, [debouncedName, form]);

	return (
		<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
			<Card>
				<CardHeader>
					<CardTitle>Set up your company</CardTitle>
					<CardDescription>
						guides-tours is multi-tenant. Create the organization your team will
						share.
					</CardDescription>
				</CardHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit().catch((err: unknown) => {
							const message = getErrorMessage(err);
							// Server errors stay local — show as a banner below
							// the form (mixed semantics per the TanStack Form pattern).
							const banner = document.getElementById("server-error");
							if (banner) banner.textContent = message;
						});
					}}
				>
					<CardContent className="space-y-4">
						<form.Field name="name">
							{(field) => (
								<FormField
									field={field}
									label="Company name"
									inputProps={{
										type: "text",
										placeholder: "Acme Tours Barcelona",
									}}
								/>
							)}
						</form.Field>

						<form.Field name="slug">
							{(field) => (
								<FormField
									field={field}
									label="URL slug"
									hint="Used in invite links and your public booking page."
									inputProps={{
										type: "text",
										placeholder: "acme-tours",
									}}
								/>
							)}
						</form.Field>

						<p
							id="server-error"
							className="text-destructive text-sm"
							role="alert"
						/>
					</CardContent>
					<CardFooter>
						<form.Subscribe
							selector={(state) =>
								[state.canSubmit, state.isSubmitting] as const
							}
						>
							{([canSubmit, isSubmitting]) => (
								<Button
									type="submit"
									disabled={!canSubmit || isSubmitting}
									className="w-full"
								>
									{isSubmitting ? "Creating..." : "Create organization"}
								</Button>
							)}
						</form.Subscribe>
					</CardFooter>
				</form>
			</Card>
		</main>
	);
}
