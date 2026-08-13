import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { PageBackLink } from "@/components/detail-page";
import { MemberSelect } from "@/components/member-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/utils";
import {
	MAX_LICENSE_LEN,
	MAX_NOTES_LEN,
	validateNotesOptional,
} from "@/lib/validation";
import { api } from "../../../convex/_generated/api";

type DriverValues = {
	userId: string;
	licenseInfo: string;
	notes: string;
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

export function NewDriverPage() {
	const navigate = useNavigate();
	const create = useMutation(api.drivers.create);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			userId: "",
			licenseInfo: "",
			notes: "",
		} satisfies DriverValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof DriverValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			if (!value.userId.trim()) fail("userId", "Please select a member");
			if (!value.licenseInfo.trim()) {
				fail("licenseInfo", "License info is required");
			} else if (value.licenseInfo.trim().length > MAX_LICENSE_LEN) {
				fail(
					"licenseInfo",
					`License info is too long (max ${MAX_LICENSE_LEN} characters)`,
				);
			}
			const notesErr = validateNotesOptional(value.notes);
			if (notesErr) fail("notes", notesErr);
			if (invalid) return;

			try {
				const id = await create({
					userId: value.userId.trim(),
					licenseInfo: value.licenseInfo.trim(),
					notes: value.notes.trim() || undefined,
				});
				toast.success("Driver created");
				void navigate({
					to: "/dashboard/drivers/$driverId",
					params: { driverId: id },
				});
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<PageBackLink to="/dashboard/drivers" />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">
					New driver
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Link a member to a driver profile so you can assign them to
					vehicle-required departures.
				</p>
			</div>
			<Card>
				<CardContent className="pt-6">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void form.handleSubmit();
						}}
					>
						<FieldGroup className="gap-4">
							<form.Field name="userId">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="userId">Member *</FieldLabel>
										<MemberSelect
											id="userId"
											value={field.state.value}
											onValueChange={(v) => field.handleChange(v)}
											placeholder="Select a member…"
										/>
										<FieldDescription>
											Must already be in this organization.
										</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="licenseInfo">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="license">License info *</FieldLabel>
										<Input
											id="license"
											required
											maxLength={MAX_LICENSE_LEN}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="Class B, expires 2027-06-30"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldDescription>
											License number, class, expiration — not shown on the
											public booking page.
										</FieldDescription>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
									</Field>
								)}
							</form.Field>

							<form.Field name="notes">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="notes">Notes</FieldLabel>
										<Textarea
											id="notes"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											maxLength={MAX_NOTES_LEN}
											placeholder="Optional"
											aria-invalid={!field.state.meta.isValid}
										/>
										<FieldError errors={metaErrors(field.state.meta.errors)} />
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
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" asChild>
											<Link to="/dashboard/drivers">Back</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : "Create driver"}
										</Button>
									</div>
								)}
							</form.Subscribe>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
