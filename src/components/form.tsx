import type { ReactNode } from "react";
import { Children, cloneElement, isValidElement } from "react";
import { Button } from "@/components/ui/button";

interface FormActionsProps {
	onCancel?: () => void;
	submitLabel?: string;
	pending?: boolean;
	className?: string;
	children?: ReactNode;
}

export function FormActions({
	onCancel,
	submitLabel = "Save",
	pending = false,
	className,
	children,
}: FormActionsProps) {
	return (
		<div className={`flex justify-end gap-2 ${className ?? ""}`}>
			{children}
			{onCancel && (
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			)}
			<Button type="submit" disabled={pending}>
				{pending ? "Saving…" : submitLabel}
			</Button>
		</div>
	);
}

interface FormFieldProps {
	label: string;
	hint?: string;
	error?: string;
	htmlFor?: string;
	children: ReactNode;
}

export function FormField({
	label,
	hint,
	error,
	htmlFor,
	children,
}: FormFieldProps) {
	const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
	const errorId = htmlFor ? `${htmlFor}-error` : undefined;

	// Auto-inject aria-invalid and aria-describedby on the child input
	// when htmlFor is provided. This ensures every FormField-backed
	// input is accessible without manual wiring in each page.
	const enhancedChildren = htmlFor
		? Children.map(children, (child) => {
				if (isValidElement(child)) {
					return cloneElement(child, {
						"aria-invalid": Boolean(error) || undefined,
						"aria-describedby": error ? errorId : hint ? hintId : undefined,
					} as Record<string, unknown>);
				}
				return child;
			})
		: children;

	return (
		<div className="space-y-1">
			<label htmlFor={htmlFor} className="text-sm font-medium">
				{label}
			</label>
			{enhancedChildren}
			{hint && !error && (
				<p id={hintId} className="text-muted-foreground text-xs">
					{hint}
				</p>
			)}
			{error && (
				<p id={errorId} role="alert" className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
