import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { resolveTourStaffing, VEHICLE_TYPES } from "@/lib/staffing";
import { FormField } from "./form";

export type StaffingFormValues = {
	tourType: string;
	requiredGuides: string;
	requiresVehicle: boolean;
	requiresDriver: boolean;
	requiredVehicleType: string;
	staffingOverride: boolean;
};

type Props = {
	values: StaffingFormValues;
	set: (key: keyof StaffingFormValues, value: string | boolean) => void;
	idPrefix?: string;
};

/** Shared tour/template staffing controls. */
export function StaffingFormSection({ values, set, idPrefix = "" }: Props) {
	const guidesId = `${idPrefix}req-guides`;
	const vtypeId = `${idPrefix}req-vtype`;
	const staffingOverrideId = `${idPrefix}staffing-override`;
	const requiresVehicleId = `${idPrefix}requires-vehicle`;
	const requiresDriverId = `${idPrefix}requires-driver`;

	return (
		<div className="space-y-4 rounded-md border p-4">
			<div>
				<p className="text-sm font-medium">Staffing</p>
				<p className="text-muted-foreground text-xs">
					How many guides and whether this needs a vehicle/driver. Transport
					types default to requiring both.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<FormField label="Required guides" htmlFor={guidesId}>
					<Input
						id={guidesId}
						type="number"
						min="1"
						max="10"
						value={values.requiredGuides}
						onChange={(e) => set("requiredGuides", e.target.value)}
					/>
				</FormField>
				<label
					htmlFor={staffingOverrideId}
					className="flex items-center gap-2 text-sm pt-6"
				>
					<Checkbox
						id={staffingOverrideId}
						checked={values.staffingOverride}
						onCheckedChange={(c) => {
							const on = c === true;
							set("staffingOverride", on);
							if (!on) return;
							const inferred = resolveTourStaffing({
								tourType: values.tourType,
							});
							set("requiresVehicle", inferred.requiresVehicle);
							set("requiresDriver", inferred.requiresDriver);
							set("requiredVehicleType", inferred.requiredVehicleType ?? "");
						}}
					/>
					Customize vehicle/driver rules
				</label>
			</div>
			{values.staffingOverride ? (
				<div className="grid gap-4 md:grid-cols-3">
					<label
						htmlFor={requiresVehicleId}
						className="flex items-center gap-2 text-sm"
					>
						<Checkbox
							id={requiresVehicleId}
							checked={values.requiresVehicle}
							onCheckedChange={(c) => set("requiresVehicle", c === true)}
						/>
						Requires vehicle
					</label>
					<label
						htmlFor={requiresDriverId}
						className="flex items-center gap-2 text-sm"
					>
						<Checkbox
							id={requiresDriverId}
							checked={values.requiresDriver}
							onCheckedChange={(c) => set("requiresDriver", c === true)}
						/>
						Requires driver
					</label>
					<FormField label="Required vehicle type" htmlFor={vtypeId}>
						<Select
							value={values.requiredVehicleType || "__any__"}
							onValueChange={(v) =>
								set("requiredVehicleType", v === "__any__" ? "" : v)
							}
						>
							<SelectTrigger id={vtypeId}>
								<SelectValue placeholder="Any" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__any__">Any</SelectItem>
								{VEHICLE_TYPES.map((t) => (
									<SelectItem key={t} value={t}>
										{t}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FormField>
				</div>
			) : (
				<p className="text-muted-foreground text-xs">
					{(() => {
						const r = resolveTourStaffing({ tourType: values.tourType });
						return r.requiresVehicle
							? `Inferred: needs ${r.requiredVehicleType ?? "a vehicle"} + driver`
							: "Inferred: walking / no fleet required";
					})()}
				</p>
			)}
		</div>
	);
}
