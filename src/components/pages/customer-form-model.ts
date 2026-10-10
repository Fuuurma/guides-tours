export type CustomerFormValues = {
	name: string;
	email: string;
	phone: string;
	preferredLanguage: string;
	notes: string;
	vipStatus: boolean;
	emailConsent: boolean;
	smsConsent: boolean;
};

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
	name: "",
	email: "",
	phone: "",
	preferredLanguage: "en",
	notes: "",
	vipStatus: false,
	emailConsent: false,
	smsConsent: false,
};

export type CustomerDoc = {
	name: string;
	email: string;
	phone?: string;
	preferredLanguage?: string;
	notes?: string;
	vipStatus?: boolean;
	emailConsent?: boolean;
	smsConsent?: boolean;
};

export function customerDocToFormValues(
	customer: CustomerDoc,
): CustomerFormValues {
	return {
		name: customer.name,
		email: customer.email,
		phone: customer.phone ?? "",
		preferredLanguage: customer.preferredLanguage ?? "en",
		notes: customer.notes ?? "",
		vipStatus: Boolean(customer.vipStatus),
		emailConsent: customer.emailConsent === true,
		smsConsent: customer.smsConsent === true,
	};
}

