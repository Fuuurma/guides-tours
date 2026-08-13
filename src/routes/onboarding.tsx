import { useForm } from "@tanstack/react-form";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
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
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { name: "", slug: "" } satisfies OrgForm,
		validators: { onSubmit: orgSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.organization.create({
				name: value.name,
				slug: value.slug,
				keepCurrentActiveOrganization: false,
			});
			if (error) {
				setServerError(getErrorMessage(error));
				return;
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
		<AuthShell
			title="Set up your company"
			serifAccent=""
			description="Create the organization your dispatch desk will share."
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<FieldGroup className="gap-4">
					<form.Field name="name">
						{(field) => (
							<FormField
								field={field}
								label="Company name"
								inputProps={{
									type: "text",
									placeholder: "Harbor Walks",
									autoComplete: "organization",
									autoFocus: true,
								}}
							/>
						)}
					</form.Field>

					<form.Field name="slug">
						{(field) => (
							<FormField
								field={field}
								label="URL slug"
								hint="Used in invite links and your optional booking page."
								inputProps={{
									type: "text",
									placeholder: "harbor-walks",
									autoComplete: "url",
								}}
							/>
						)}
					</form.Field>

					{serverError ? <ErrorBanner message={serverError} /> : null}

					<form.Subscribe
						selector={(state) => [state.canSubmit, state.isSubmitting] as const}
					>
						{([canSubmit, isSubmitting]) => (
							<Button
								type="submit"
								size="lg"
								className="h-11 w-full rounded-full"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? (
									<>
										<Spinner data-icon="inline-start" /> Creating...
									</>
								) : (
									"Create organization"
								)}
							</Button>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
