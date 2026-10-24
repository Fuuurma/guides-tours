import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TOUR_TYPES } from "@/lib/staffing";

/**
 * Shared tourType ToggleGroup block (tour-form + tour-template-form).
 * Takes the bound TanStack field (state.value + handleChange only) so the
 * component stays decoupled from either form's schema — both call sites
 * keep their own `<form.Field name="tourType">` wrapper.
 */
export function TourTypeField({
	field,
	id,
}: {
	field: {
		state: { value: string };
		handleChange: (value: string) => void;
	};
	id: (suffix: string) => string;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id("type")}>Type</FieldLabel>
			<ToggleGroup
				id={id("type")}
				type="single"
				variant="outline"
				size="sm"
				value={field.state.value}
				onValueChange={(v) => {
					if (v) field.handleChange(v);
				}}
				className="flex-wrap"
			>
				{TOUR_TYPES.map((t) => (
					<ToggleGroupItem key={t} value={t}>
						{t}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<FieldDescription>
				Transport types default to needing a vehicle and driver.
			</FieldDescription>
		</Field>
	);
}
