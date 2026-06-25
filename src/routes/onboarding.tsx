import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

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
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors },
	} = useForm<OrgForm>({
		resolver: zodResolver(orgSchema),
	});

	// Auto-derive slug from company name (lowercase, replace spaces with dashes).
	const name = watch("name");
	useEffect(() => {
		if (name && !watch("slug")) {
			setValue(
				"slug",
				name
					.toLowerCase()
					.trim()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.slice(0, 40),
			);
		}
	}, [name, setValue, watch]);

	const createOrg = useMutation({
		mutationFn: async (values: OrgForm) => {
			const { data, error } = await authClient.organization.create({
				name: values.name,
				slug: values.slug,
				keepCurrentActiveOrganization: false,
			});
			if (error) throw new Error(error.message);
			return data;
		},
	});

	const onSubmit = handleSubmit(async (values) => {
		setError(null);
		try {
			await createOrg.mutateAsync(values);
			// Force-refresh so the dashboard's tenant-scoped queries
			// pick up the new active org from session.
			window.location.assign("/dashboard");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Failed to create organization",
			);
		}
	});

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
				<form onSubmit={onSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Company name</Label>
							<Input
								id="name"
								type="text"
								placeholder="Acme Tours Barcelona"
								{...register("name")}
							/>
							{errors.name ? (
								<p className="text-destructive text-sm">
									{errors.name.message}
								</p>
							) : null}
						</div>
						<div className="space-y-2">
							<Label htmlFor="slug">URL slug</Label>
							<Input
								id="slug"
								type="text"
								placeholder="acme-tours"
								{...register("slug")}
							/>
							<p className="text-muted-foreground text-xs">
								Used in invite links and your public booking page.
							</p>
							{errors.slug ? (
								<p className="text-destructive text-sm">
									{errors.slug.message}
								</p>
							) : null}
						</div>
						{error ? (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						) : null}
					</CardContent>
					<CardFooter>
						<Button
							type="submit"
							disabled={createOrg.isPending}
							className="w-full"
						>
							{createOrg.isPending ? "Creating..." : "Create organization"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</main>
	);
}
