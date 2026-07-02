// TanStack Form field shell.
//
// Reduces per-field boilerplate from 10 lines to 1-3 by wrapping:
//   - Label (htmlFor)
//   - Input (id, name, value, onChange, onBlur, aria-invalid, aria-describedby)
//   - Error message (role="alert", deterministic id for aria-describedby)
//   - Optional hint (deterministic id for aria-describedby)
//
// Usage:
//   <form.Field name="email">
//     {(field) => (
//       <FormField
//         field={field}
//         label="Email"
//         inputProps={{ type: "email", autoComplete: "email" }}
//       />
//     )}
//   </form.Field>
//
// For custom controls (Select, Textarea), pass children and wire the
// value/onChange/blur manually:
//
//   <form.Field name="plan">
//     {(field) => (
//       <FormField field={field} label="Plan">
//         <Select
//           value={field.state.value as string}
//           onValueChange={field.handleChange}
//         >
//           <SelectTrigger />
//           <SelectContent>...</SelectContent>
//         </Select>
//       </FormField>
//     )}
//   </form.Field>

import type * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Looser shape than TanStack's actual FieldApi so we don't have to thread
// the form's generic types through every call site. We only use name,
// value, errors, isValid, handleBlur, handleChange.
export type FormFieldVm = {
	name: string;
	state: {
		value: unknown;
		meta: { errors: ReadonlyArray<unknown>; isValid: boolean };
	};
	handleBlur: () => void;
	// `...args: never[]` is structurally compatible with TanStack's
	// `(updater: Updater<TData>) => void` overload.
	handleChange: (...args: never[]) => void;
};

type FormFieldProps = {
	field: FormFieldVm;
	label: string;
	hint?: string;
	// Spread onto the underlying <Input> when used with no children.
	inputProps?: Omit<
		React.ComponentProps<typeof Input>,
		"id" | "name" | "value" | "onChange" | "onBlur" | "aria-invalid"
	>;
	// When provided, the shell renders the children instead of an <Input>.
	// Use this for select / textarea / custom controls. Caller is responsible
	// for wiring value/onChange/blur to the field.
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
	const errorId = `${field.name}-error`;
	const hintId = `${field.name}-hint`;
	return (
		<div className="space-y-2">
			<Label htmlFor={field.name}>{label}</Label>
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
					aria-describedby={hasError ? errorId : hint ? hintId : undefined}
					{...inputProps}
				/>
			)}
			{hint && !hasError && (
				<p id={hintId} className="text-sm text-muted-foreground">
					{hint}
				</p>
			)}
			{hasError && (
				<p id={errorId} role="alert" className="text-sm text-destructive">
					{field.state.meta.errors.map(errorMessage).join(", ")}
				</p>
			)}
		</div>
	);
}
