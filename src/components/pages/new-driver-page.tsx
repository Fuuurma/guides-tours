import { useMutation } from "convex/react";
import { EntityFormPage, useEntityForm } from "@/components/entity-form";
import { MemberSelect } from "@/components/member-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTES_LEN, validateNotesOptional } from "@/lib/validation";
import { api } from "../../../convex/_generated/api";
import { FormField } from "../form";

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
				userId: v.userId.trim(),
				licenseInfo: v.licenseInfo.trim(),
				notes: v.notes.trim() || undefined,
			});
			return id;
		},
		validate: (v) => {
			const errs: Record<string, string> = {};
			if (!v.userId.trim()) errs.userId = "Please select a member";
			const notesErr = validateNotesOptional(v.notes);
			if (notesErr) errs.notes = notesErr;
			return Object.keys(errs).length > 0 ? errs : null;
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
			<FormField
				label="Member *"
				hint="Organization member linked to this driver record"
				htmlFor="userId"
				error={form.fieldErrors.userId}
			>
				<MemberSelect
					id="userId"
					value={form.values.userId}
					onValueChange={(v) => form.set("userId", v)}
					placeholder="Select a member…"
				/>
			</FormField>

			<FormField
				label="License info *"
				hint="License number, class, expiration"
				htmlFor="license"
			>
				<Input
					id="license"
					required
					maxLength={500}
					value={form.values.licenseInfo}
					onChange={(e) => form.set("licenseInfo", e.target.value)}
					placeholder="Class B, expires 2027-06-30"
				/>
			</FormField>

			<FormField label="Notes" htmlFor="notes" error={form.fieldErrors.notes}>
				<Textarea
					id="notes"
					value={form.values.notes}
					onChange={(e) => form.set("notes", e.target.value)}
					rows={3}
					maxLength={MAX_NOTES_LEN}
					placeholder="Optional"
				/>
			</FormField>
		</EntityFormPage>
	);
}
