import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "../form";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";

interface FormValues extends Record<string, unknown> {
	userId: string;
	licenseInfo: string;
	notes: string;
}

const INITIAL: FormValues = {
	userId: "",
	licenseInfo: "",
	notes: "",
};

export function NewDriverPage() {
	const create = useMutation(api.drivers.create);
	const form = useEntityForm<FormValues, string>({
		mutation: async (v) => {
			const id = await create({
				userId: v.userId,
				licenseInfo: v.licenseInfo,
				notes: v.notes || undefined,
			});
			return id;
		},
		initialValues: INITIAL,
		redirectTo: (id) => `/dashboard/drivers/${id}`,
		successMessage: "Driver created",
	});

	return (
		<EntityFormPage
			form={form}
			title="New driver"
			description="Add a driver to your fleet"
			backTo="/dashboard/drivers"
			submitLabel="Create driver"
		>
			<FormField label="User ID *" hint="Better Auth user ID of the driver" htmlFor="userId">
				<Input
					id="userId"
					required
					value={form.values.userId}
					onChange={(e) => form.set("userId", e.target.value)}
					placeholder="user_abc123"
				/>
			</FormField>

			<FormField label="License info *" hint="License number, class, expiration" htmlFor="license">
				<Input
					id="license"
					required
					value={form.values.licenseInfo}
					onChange={(e) => form.set("licenseInfo", e.target.value)}
					placeholder="Class B, expires 2027-06-30"
				/>
			</FormField>

			<FormField label="Notes" htmlFor="notes">
				<Textarea
					id="notes"
					value={form.values.notes}
					onChange={(e) => form.set("notes", e.target.value)}
					rows={3}
					placeholder="Optional"
				/>
			</FormField>
		</EntityFormPage>
	);
}
