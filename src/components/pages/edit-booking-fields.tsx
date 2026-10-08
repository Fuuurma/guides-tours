import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ScheduleLite = {
	_id: string;
	startTime: string;
	endTime: string;
	capacityTotal: number;
	capacityBooked: number;
	status: string;
};

/**
 * TanStack field state bound to plain props so section components stay
 * decoupled from the form's generic types (same pattern as TourTypeField).
 */
export type BookingFieldBinding = {
	value: string;
	onChange: (value: string) => void;
	onBlur: () => void;
	invalid: boolean;
	errors: Array<{ message?: string }>;
};

type LabeledBinding = {
	id: string;
	label: string;
	binding: BookingFieldBinding;
};

export function BookingTextField({
	id,
	label,
	placeholder,
	maxLength,
	description,
	binding,
}: LabeledBinding & {
	placeholder?: string;
	maxLength?: number;
	description?: string;
}) {
	return (
		<Field data-invalid={binding.invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				maxLength={maxLength}
				value={binding.value}
				onBlur={binding.onBlur}
				onChange={(e) => binding.onChange(e.target.value)}
				placeholder={placeholder}
				aria-invalid={binding.invalid}
			/>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError errors={binding.errors} />
		</Field>
	);
}

export function BookingNumberField({
	id,
	label,
	min,
	step,
	required,
	binding,
}: LabeledBinding & { min?: string; step?: string; required?: boolean }) {
	return (
		<Field data-invalid={binding.invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				type="number"
				min={min}
				step={step}
				required={required}
				value={binding.value}
				onBlur={binding.onBlur}
				onChange={(e) => binding.onChange(e.target.value)}
				aria-invalid={binding.invalid}
			/>
			<FieldError errors={binding.errors} />
		</Field>
	);
}

export function BookingDateTimeField({
	id,
	label,
	type,
	binding,
}: LabeledBinding & { type: "date" | "time" }) {
	return (
		<Field data-invalid={binding.invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				type={type}
				required
				value={binding.value}
				onBlur={binding.onBlur}
				onChange={(e) => binding.onChange(e.target.value)}
				aria-invalid={binding.invalid}
			/>
			<FieldError errors={binding.errors} />
		</Field>
	);
}

export function BookingNotesField({
	id,
	label,
	placeholder,
	maxLength,
	counter,
	binding,
}: LabeledBinding & {
	placeholder?: string;
	maxLength: number;
	counter: string;
}) {
	return (
		<Field data-invalid={binding.invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Textarea
				id={id}
				value={binding.value}
				onBlur={binding.onBlur}
				onChange={(e) => binding.onChange(e.target.value)}
				rows={3}
				maxLength={maxLength}
				placeholder={placeholder}
				aria-invalid={binding.invalid}
			/>
			<FieldDescription>{counter}</FieldDescription>
			<FieldError errors={binding.errors} />
		</Field>
	);
}

export function BookingSlotField({
	id,
	label,
	slots,
	onSelect,
	binding,
}: LabeledBinding & {
	slots: ScheduleLite[];
	onSelect: (slotId: string) => void;
}) {
	return (
		<Field data-invalid={binding.invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Select value={binding.value || undefined} onValueChange={onSelect}>
				<SelectTrigger id={id}>
					<SelectValue placeholder="Select a time…" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{slots.map((s) => (
							<SelectItem key={s._id} value={s._id}>
								{s.startTime}–{s.endTime} · {s.capacityTotal - s.capacityBooked}{" "}
								left
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<FieldError errors={binding.errors} />
		</Field>
	);
}
