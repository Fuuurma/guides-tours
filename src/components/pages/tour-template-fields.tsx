import { Link } from "@tanstack/react-router";
import { PageBackLink } from "@/components/detail-page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TOUR_TYPES, VEHICLE_TYPES } from "@/lib/staffing";

type StringFieldProps = {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	onBlur: () => void;
	invalid?: boolean;
	errors?: Array<{ message?: string }>;
};

export function TemplateTextField({
	id,
	label,
	placeholder,
	maxLength,
	required,
	description,
	value,
	onChange,
	onBlur,
	invalid,
	errors,
}: StringFieldProps & {
	placeholder?: string;
	maxLength?: number;
	required?: boolean;
	description?: string;
}) {
	return (
		<Field data-invalid={invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				required={required}
				maxLength={maxLength}
				value={value}
				onBlur={onBlur}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				aria-invalid={invalid}
			/>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			{errors ? <FieldError errors={errors} /> : null}
		</Field>
	);
}

export function TemplateNumberField({
	id,
	label,
	min,
	max,
	step,
	required,
	value,
	onChange,
	onBlur,
	invalid,
	errors,
}: StringFieldProps & {
	min?: string;
	max?: string;
	step?: string;
	required?: boolean;
}) {
	return (
		<Field data-invalid={invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				type="number"
				min={min}
				max={max}
				step={step}
				required={required}
				value={value}
				onBlur={onBlur}
				onChange={(e) => onChange(e.target.value)}
				aria-invalid={invalid}
			/>
			{errors ? <FieldError errors={errors} /> : null}
		</Field>
	);
}

export function TemplateTextareaField({
	id,
	label,
	placeholder,
	maxLength,
	rows,
	description,
	value,
	onChange,
	onBlur,
	invalid,
	errors,
}: StringFieldProps & {
	placeholder?: string;
	maxLength?: number;
	rows?: number;
	description?: string;
}) {
	return (
		<Field data-invalid={invalid}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Textarea
				id={id}
				value={value}
				onBlur={onBlur}
				onChange={(e) => onChange(e.target.value)}
				rows={rows}
				maxLength={maxLength}
				placeholder={placeholder}
				aria-invalid={invalid}
			/>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			{errors ? <FieldError errors={errors} /> : null}
		</Field>
	);
}

export function TemplateFormHeader({
	backTo,
	title,
	description,
}: {
	backTo: string;
	title: string;
	description: string;
}) {
	return (
		<div>
			<PageBackLink to={backTo} />
			<h1 className="mt-2 font-display text-2xl font-medium tracking-tight">
				{title}
			</h1>
			<p className="mt-1 text-sm text-muted-foreground">{description}</p>
		</div>
	);
}

export function TemplateStaffingHint({
	requiresVehicle,
	vehicleType,
}: {
	requiresVehicle: boolean;
	vehicleType: string | undefined;
}) {
	return (
		<p className="text-xs text-muted-foreground">
			{requiresVehicle
				? `Inferred: needs ${vehicleType ?? "a vehicle"} + driver`
				: "Inferred: walking / no fleet required"}
		</p>
	);
}

export function TemplateTypeToggle({
	id,
	value,
	onChange,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>Type</FieldLabel>
			<ToggleGroup
				id={id}
				type="single"
				variant="outline"
				size="sm"
				value={value}
				onValueChange={onChange}
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

export function TemplateSwitchField({
	id,
	label,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<Field orientation="horizontal">
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Switch id={id} checked={checked} onCheckedChange={onChange} />
		</Field>
	);
}

export function TemplateCheckboxField({
	id,
	label,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<Field orientation="horizontal">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(c) => onChange(c === true)}
			/>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
		</Field>
	);
}

export function TemplateVehicleSelect({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Select
				value={value || "__any__"}
				onValueChange={(v) => onChange(v === "__any__" ? "" : v)}
			>
				<SelectTrigger id={id}>
					<SelectValue placeholder="Any" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value="__any__">Any</SelectItem>
						{VEHICLE_TYPES.map((t) => (
							<SelectItem key={t} value={t}>
								{t}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);
}
