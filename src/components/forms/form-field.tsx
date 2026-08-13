// TanStack Form field shell.
//
// Wraps shadcn Field so auth and public-booking forms share the same
// control vocabulary as the operator console (FieldLabel, FieldError,
// FieldDescription). IDs stay `field.name` so e2e locators (#email,
// #password, #name) keep working.

import type * as React from "react";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type FormFieldVm = {
	name: string;
	state: {
		value: unknown;
		meta: { errors: ReadonlyArray<unknown>; isValid: boolean };
	};
	handleBlur: () => void;
	handleChange: (...args: never[]) => void;
};

type FormFieldProps = {
	field: FormFieldVm;
	label: string;
	hint?: string;
	inputProps?: Omit<
		React.ComponentProps<typeof Input>,
		"id" | "name" | "value" | "onChange" | "onBlur" | "aria-invalid"
	>;
	children?: React.ReactNode;
};

function errorMessage(err: unknown): string {
	if (typeof err === "string") return err;
	if (err && typeof err === "object" && "message" in err) {
		const m = (err as { message?: unknown }).message;
		if (typeof m === "string") return m;
	}
	return JSON.stringify(err);
}

export function FormField({
	field,
	label,
	hint,
	inputProps,
	children,
}: FormFieldProps) {
	const hasError = field.state.meta.errors.length > 0;
	return (
		<Field data-invalid={hasError || !field.state.meta.isValid}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			{children ? (
				children
			) : (
				<Input
					id={field.name}
					name={field.name}
					value={(field.state.value as string | number | undefined) ?? ""}
					onBlur={field.handleBlur}
					onChange={(e) =>
						(field.handleChange as (v: unknown) => void)(e.target.value)
					}
					aria-invalid={!field.state.meta.isValid}
					{...inputProps}
				/>
			)}
			{hint && !hasError ? <FieldDescription>{hint}</FieldDescription> : null}
			{hasError ? (
				<FieldError
					errors={field.state.meta.errors.map((err) => ({
						message: errorMessage(err),
					}))}
				/>
			) : null}
		</Field>
	);
}
