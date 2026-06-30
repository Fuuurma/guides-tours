import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { getErrorMessage } from "@/lib/utils";

/**
 * Hook for entity create/edit form state. Eliminates the
 * useState + pending + error + try/catch boilerplate that was
 * duplicated across 12 form pages.
 *
 * @example
 *   const form = useEntityForm({
 *     mutation: api.tours.create,
 *     redirectTo: (id) => `/dashboard/tours/${id}` as const,
 *   });
 *
 *   return (
 *     <EntityFormPage form={form} title="New tour" ... >
 *       <FormField label="Name" htmlFor="name" error={form.fieldErrors.name}>
 *         <Input
 *           id="name"
 *           required
 *           value={form.values.name}
 *           onChange={(e) => form.set("name", e.target.value)}
 *         />
 *       </FormField>
 *     </EntityFormPage>
 *   );
 */
export interface UseEntityFormOptions<TValues, TResult> {
	/** The Convex mutation to call. */
	mutation: (args: TValues) => Promise<TResult>;
	/** Called with the mutation's return value to determine redirect path. */
	redirectTo: (result: TResult) => string;
	/**
	 * Optional per-field validate hook — return a map of field name →
	 * error message to block submit and show inline errors. Return null
	 * to allow submit.
	 */
	validate?: (values: TValues) => Record<string, string> | null;
	/** Optional success toast (default: "{title} saved"). */
	successMessage?: string;
	/** Optional error toast prefix. */
	errorPrefix?: string;
}

export interface EntityFormHandle<TValues, TResult> {
	/** Current form values — pass into the mutation on submit. */
	values: TValues;
	/** Patch a single field. Also clears that field's error. */
	set: <K extends keyof TValues>(key: K, value: TValues[K]) => void;
	/** Patch many fields. Also clears errors for patched fields. */
	setMany: (patch: Partial<TValues>) => void;
	/** True while the mutation is in flight. */
	pending: boolean;
	/** Last global error message (null when none). */
	error: string | null;
	/** Per-field error map (empty when no errors). */
	fieldErrors: Record<string, string>;
	/** Submit the form — runs validate, calls mutation, navigates on success. */
	submit: (e?: React.FormEvent) => Promise<void>;
	/** The mutation result (set after success). */
	result: TResult | null;
}

export function useEntityForm<TValues extends object, TResult>(opts: {
	mutation: (args: TValues) => Promise<TResult>;
	redirectTo: (result: TResult) => string;
	initialValues: TValues;
	validate?: (values: TValues) => Record<string, string> | null;
	successMessage?: string;
	errorPrefix?: string;
}): EntityFormHandle<TValues, TResult> {
	const navigate = useNavigate();
	const [values, setValues] = React.useState<TValues>(opts.initialValues);
	const [pending, setPending] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
		{},
	);
	const [result, setResult] = React.useState<TResult | null>(null);

	const set = React.useCallback(
		<K extends keyof TValues>(key: K, value: TValues[K]) => {
			setValues((prev) => ({ ...prev, [key]: value }));
			// Clear the field error when the user edits the field.
			setFieldErrors((prev) => {
				if (!((key as string) in prev)) return prev;
				const next = { ...prev };
				delete next[key as string];
				return next;
			});
		},
		[],
	);

	const setMany = React.useCallback((patch: Partial<TValues>) => {
		setValues((prev) => ({ ...prev, ...patch }));
		// Clear errors for all patched fields.
		setFieldErrors((prev) => {
			const keys = Object.keys(patch);
			if (!keys.some((k) => k in prev)) return prev;
			const next = { ...prev };
			for (const k of keys) delete next[k];
			return next;
		});
	}, []);

	const submit = React.useCallback(
		async (e?: React.FormEvent) => {
			e?.preventDefault();
			setError(null);
			setFieldErrors({});

			if (opts.validate) {
				const errs = opts.validate(values);
				if (errs) {
					setFieldErrors(errs);
					// Also set the global error to the first field error
					// so the ErrorBanner at the bottom shows something.
					const first = Object.values(errs)[0];
					if (first) setError(first);
					return;
				}
			}

			setPending(true);
			try {
				const r = await opts.mutation(values);
				setResult(r);
				toast.success(opts.successMessage ?? "Saved");
				void navigate({ to: opts.redirectTo(r) as never });
			} catch (err) {
				const message = getErrorMessage(err);
				setError(message);
				toast.error(message);
			} finally {
				setPending(false);
			}
		},
		[values, navigate, opts],
	);

	return { values, set, setMany, pending, error, fieldErrors, submit, result };
}

/**
 * Standard shell for entity create/edit pages. Pairs with
 * useEntityForm. Eliminates the duplicated Card + header + cancel
 * + submit button pattern.
 *
 * @example
 *   <EntityFormPage
 *     form={form}
 *     title="New tour"
 *     description="Create a new tour that customers can book"
 *     backTo="/dashboard/tours"
 *     submitLabel="Create tour"
 *   >
 *     <FormField label="Name" htmlFor="name" error={form.fieldErrors.name}>
 *       ...
 *     </FormField>
 *   </EntityFormPage>
 */
export interface EntityFormPageProps<TValues extends object, TResult> {
	form: EntityFormHandle<TValues, TResult>;
	title: string;
	description?: string;
	backTo: string;
	backLabel?: string;
	submitLabel?: string;
	children: React.ReactNode;
}

export function EntityFormPage<
	TValues extends Record<string, unknown>,
	TResult,
>({
	form,
	title,
	description,
	backTo,
	backLabel = "Cancel",
	submitLabel = "Save",
	children,
}: EntityFormPageProps<TValues, TResult>) {
	return (
		<div className="mx-auto max-w-2xl">
			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							void form.submit(e);
						}}
						className="space-y-4"
					>
						{children}
						<div className="flex flex-col gap-3">
							{form.error && <ErrorBanner message={form.error} />}
							<div className="flex justify-end gap-2">
								<Button type="button" variant="outline" asChild>
									<Link to={backTo}>{backLabel}</Link>
								</Button>
								<Button type="submit" disabled={form.pending}>
									{form.pending ? "Saving…" : submitLabel}
								</Button>
							</div>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
