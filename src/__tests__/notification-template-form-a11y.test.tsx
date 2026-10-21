// Pins two reviewed verdicts on the notification-template and password
// components (react-doctor batch, WORK.md work:230).
//
// 1. TemplateEditFields had a <form> nested inside its own <form>. HTML does
//    not allow it: the outer form's only child was the inner one, and both
//    carried a byte-identical onSubmit. On the server-rendered path the
//    browser's parser drops the inner <form> element outright, so its
//    onSubmit could never fire. This asserts exactly one form exists and
//    that no form contains another.
//
// 2. PasswordInput renders no <label> itself, and react-doctor reported that
//    as an unlabelled input. It is not a defect: every call site wraps it in
//    <FormField label="...">, which renders <FieldLabel htmlFor={field.name}>,
//    and each call site names the field `password` and passes id="password",
//    so the association resolves. The assertion below is the proof — it is
//    what the static rule cannot follow through the FormField indirection.

// @vitest-environment jsdom

import { useField, useForm } from "@tanstack/react-form";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { PasswordInput } from "@/components/auth/password-field";
import { FormField } from "@/components/forms/form-field";
import { TemplateEditFields } from "@/components/pages/notification-template-sections";

class ResizeObserverStub {
	observe() {
		/* jsdom stub — no-op */
	}
	unobserve() {
		/* jsdom stub — no-op */
	}
	disconnect() {
		/* jsdom stub — no-op */
	}
}
beforeAll(() => {
	window.ResizeObserver =
		ResizeObserverStub as unknown as typeof ResizeObserver;
	window.HTMLElement.prototype.scrollIntoView = () => {
		// jsdom stub — no-op
	};
	window.HTMLElement.prototype.hasPointerCapture = () => false;
	window.HTMLElement.prototype.releasePointerCapture = () => {
		// jsdom stub — no-op
	};
});

const EDIT_DEFAULTS = {
	name: "Booking confirmed",
	isActive: true,
	emailSubject: "Your booking",
	emailBodyText: "Thanks for booking",
	emailBodyHtml: "<p>Thanks for booking</p>",
	smsBody: "Booked",
};

function TemplateEditHarness() {
	const form = useForm({
		defaultValues: EDIT_DEFAULTS,
		onSubmit: async () => {
			/* test submit — no-op */
		},
	});
	return <TemplateEditFields form={form as never} saveErr={null} />;
}

describe("TemplateEditFields form structure", () => {
	it("renders exactly one form element", () => {
		const { container } = render(<TemplateEditHarness />);
		expect(container.querySelectorAll("form")).toHaveLength(1);
	});

	it("never nests a form inside a form", () => {
		const { container } = render(<TemplateEditHarness />);
		expect(container.querySelectorAll("form form")).toHaveLength(0);
	});

	it("keeps the fields inside the surviving form", () => {
		// Deleting the wrong one of the two wrappers would orphan the fields
		// outside any form, which silently breaks Enter-to-submit.
		const { container } = render(<TemplateEditHarness />);
		const form = container.querySelector("form");
		expect(form).not.toBeNull();
		expect(form?.querySelector("#tpl-name")).not.toBeNull();
		expect(form?.querySelector("#tpl-active")).not.toBeNull();
	});
});

describe("PasswordInput accessible name", () => {
	function PasswordHarness() {
		const form = useForm({
			defaultValues: { password: "" },
			onSubmit: async () => {
				/* test submit — no-op */
			},
		});
		const vm = useField({
			name: "password",
			form,
		});
		return (
			<FormField
				field={vm as never}
				label="Password"
				hint="At least 8 characters"
			>
				<PasswordInput
					id="password"
					name="password"
					value=""
					onChange={() => {
						/* test change — no-op */
					}}
				/>
			</FormField>
		);
	}

	it("is reachable by its visible label text", () => {
		render(<PasswordHarness />);
		// getByLabelText only succeeds if <label for> and the input's id
		// actually associate, which is the whole question.
		const input = screen.getByLabelText("Password");
		expect(input.tagName).toBe("INPUT");
		expect(input.getAttribute("type")).toBe("password");
	});

	it("exposes the toggle as a named button", () => {
		render(<PasswordHarness />);
		expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();
	});
});
