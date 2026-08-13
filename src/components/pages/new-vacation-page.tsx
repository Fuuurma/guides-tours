import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
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
import { MAX_NOTES_LEN, validateNotesOptional } from "@/lib/validation";
import { api } from "../../../convex/_generated/api";

type VacationValues = {
	userId: string;
	startDate: string;
	endDate: string;
	reason: string;
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

export function NewVacationPage() {
	const { data: org, isPending: orgPending } = useQuery(
		convexQuery(api.organizations.activeOrganization, {}),
	);
	const { data: me, isPending: mePending } = useQuery(
		convexQuery(api.auth.getCurrentUser, {}),
	);
	const isAdmin = org?.role === "owner" || org?.role === "admin";
	const myId = typeof me?._id === "string" ? me._id : "";

	if (orgPending || mePending) {
		return (
			<div className="mx-auto max-w-2xl text-muted-foreground text-sm">
				Loading…
			</div>
		);
	}

	return <NewVacationForm isAdmin={isAdmin} myId={myId} />;
}

function NewVacationForm({
	isAdmin,
	myId,
}: {
	isAdmin: boolean;
	myId: string;
}) {
	const navigate = useNavigate();
	const create = useMutation(api.vacationRequests.create);
	const [submitErr, setSubmitErr] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			userId: myId,
			startDate: "",
			endDate: "",
			reason: "",
		} satisfies VacationValues,
		onSubmit: async ({ value }) => {
			setSubmitErr(null);
			let invalid = false;
			const fail = (name: keyof VacationValues, message: string) => {
				form.setFieldMeta(name, (prev) => ({
					...prev,
					errorMap: { ...prev.errorMap, onSubmit: message },
				}));
				invalid = true;
			};

			if (isAdmin && !value.userId) fail("userId", "Choose who this is for");
			if (!value.startDate) fail("startDate", "Start date is required");
			if (!value.endDate) fail("endDate", "End date is required");
			if (
				value.startDate &&
				value.endDate &&
				Date.parse(value.endDate) < Date.parse(value.startDate)
			) {
				fail("endDate", "End date cannot be before start date");
			}
			const reasonErr = validateNotesOptional(value.reason);
			if (reasonErr) fail("reason", reasonErr);
			if (invalid) return;

			const onBehalf = isAdmin && value.userId && value.userId !== myId;
			try {
				const id = await create({
					startDate: value.startDate,
					endDate: value.endDate,
					reason: value.reason.trim() || undefined,
					userId: onBehalf ? value.userId : undefined,
				});
				toast.success(
					onBehalf
						? "Time off recorded and approved"
						: "Vacation request submitted",
				);
				void navigate({
					to: "/dashboard/vacations/$vacationId",
					params: { vacationId: id },
				});
			} catch (err) {
				setSubmitErr(getErrorMessage(err));
			}
		},
	});

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<div>
				<PageBackLink to="/dashboard/vacations" />
				<h1 className="mt-2 text-2xl font-semibold tracking-tight">
					{isAdmin ? "Record time off" : "New vacation request"}
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					{isAdmin
						? "Your own request stays pending until reviewed. Time off for someone else is recorded as approved so assignments block immediately."
						: "Record time off for your account so assignments do not overlap days you are away."}
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
							{isAdmin ? (
								<form.Field name="userId">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="staff">Staff member</FieldLabel>
											<MemberSelect
												id="staff"
												value={field.state.value}
												onValueChange={field.handleChange}
												placeholder="Select staff…"
											/>
											<FieldDescription>
												Leave as yourself to submit a pending request. Choosing
												someone else records approved time off.
											</FieldDescription>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							) : null}

							<FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<form.Field name="startDate">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="start">Start date *</FieldLabel>
											<Input
												id="start"
												type="date"
												required
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
								<form.Field name="endDate">
									{(field) => (
										<Field data-invalid={!field.state.meta.isValid}>
											<FieldLabel htmlFor="end">End date *</FieldLabel>
											<Input
												id="end"
												type="date"
												required
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={!field.state.meta.isValid}
											/>
											<FieldError
												errors={metaErrors(field.state.meta.errors)}
											/>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<form.Field name="reason">
								{(field) => (
									<Field data-invalid={!field.state.meta.isValid}>
										<FieldLabel htmlFor="reason">Reason</FieldLabel>
										<Textarea
											id="reason"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											rows={3}
											maxLength={MAX_NOTES_LEN}
											placeholder="Optional — short note for the reviewer"
											aria-invalid={!field.state.meta.isValid}
										/>
										<form.Subscribe selector={(state) => state.values.userId}>
											{(userId) => (
												<FieldDescription>
													{isAdmin && userId && userId !== myId
														? "Recorded as approved — no extra review step."
														: "Pending until an owner or admin reviews it."}
												</FieldDescription>
											)}
										</form.Subscribe>
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
											<Link to="/dashboard/vacations">Back</Link>
										</Button>
										<Button type="submit" disabled={!canSubmit || isSubmitting}>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											{isSubmitting ? "Saving…" : "Submit request"}
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
