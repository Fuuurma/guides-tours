import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Props = {
	backLink: ReactElement;
	canSubmit: boolean;
	isSubmitting: boolean;
	submitLabel: string;
};

export function FormSubmitActions({
	backLink,
	canSubmit,
	isSubmitting,
	submitLabel,
}: Props) {
	return (
		<div className="flex justify-end gap-2 pt-2">
			<Button type="button" variant="outline" asChild>
				{backLink}
			</Button>
			<Button type="submit" disabled={!canSubmit || isSubmitting}>
				{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
				{isSubmitting ? "Saving…" : submitLabel}
			</Button>
		</div>
	);
}
