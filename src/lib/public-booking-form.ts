import { z } from "zod";
import {
	EMAIL_REGEX,
	MAX_EMAIL_LEN,
	MAX_NAME_LEN,
	MAX_NOTES_LEN,
	MAX_PHONE_LEN,
} from "@/lib/validation";

export const publicBookingSchema = z.object({
	tourId: z.string().min(1, "Please select a tour"),
	date: z.string().min(1, "Please pick a date"),
	startTime: z.string(),
	scheduleId: z.string(),
	guests: z
		.string()
		.min(1, "Guests must be at least 1")
		.refine((v) => {
			const n = Number(v);
			return Number.isFinite(n) && n >= 1;
		}, "Guests must be at least 1"),
	name: z
		.string()
		.trim()
		.min(2, "Please enter your full name")
		.max(MAX_NAME_LEN, `Name is too long (max ${MAX_NAME_LEN} characters)`),
	email: z
		.string()
		.trim()
		.min(1, "Email is required")
		.max(MAX_EMAIL_LEN, "Email is too long")
		.refine((v) => EMAIL_REGEX.test(v), "Please enter a valid email address"),
	phone: z
		.string()
		.max(MAX_PHONE_LEN)
		.refine((v) => {
			const trimmed = v.trim();
			if (!trimmed) return true;
			const digits = trimmed.replace(/\D/g, "");
			return digits.length >= 6 && digits.length <= 20;
		}, "Please enter a valid phone number (6-20 digits) or leave it empty"),
	notes: z
		.string()
		.max(MAX_NOTES_LEN, `Notes are too long (max ${MAX_NOTES_LEN} characters)`),
	emailConsent: z.boolean(),
	smsConsent: z.boolean(),
});

export type PublicBookingForm = z.infer<typeof publicBookingSchema>;

export const publicBookingDefaults: PublicBookingForm = {
	tourId: "",
	date: "",
	startTime: "",
	scheduleId: "",
	guests: "1",
	name: "",
	email: "",
	phone: "",
	notes: "",
	emailConsent: true,
	smsConsent: false,
};
