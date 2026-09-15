// Tests for PendingInvitesSection — the dashboard recovery path for
// pending org invitations.
//
// Pins two reviewed behaviors:
//   - Resending an EXPIRED invite first cancels the stale row(s) so
//     Better Auth's resend fallthrough to createInvitation can't leave
//     duplicate pending rows for the same email.
//   - Success toasts claim only what the client can confirm ("created"
//     / "requested") — email delivery runs server-side and is
//     unconfirmable from here.

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listInvitations: vi.fn(),
	inviteMember: vi.fn(),
	cancelInvitation: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	organization: {
		listInvitations: mocks.listInvitations,
		inviteMember: mocks.inviteMember,
		cancelInvitation: mocks.cancelInvitation,
	},
}));

vi.mock("sonner", () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { PendingInvitesSection } from "../components/pending-invites-section";

const LIVE = {
	id: "inv-live",
	email: "live@example.com",
	role: "guide",
	status: "pending",
	expiresAt: "2099-01-01T00:00:00Z",
};

const EXPIRED = {
	id: "inv-expired",
	email: "stale@example.com",
	role: "guide",
	status: "pending",
	expiresAt: "2020-01-01T00:00:00Z",
};

function row(email: string): HTMLLIElement {
	const li = screen.getByText(email).closest("li");
	if (!li) throw new Error(`no <li> row found for ${email}`);
	return li as HTMLLIElement;
}

async function clickResend(email: string) {
	const btn = row(email).querySelectorAll("button")[0];
	if (!btn) throw new Error(`no buttons in row for ${email}`);
	fireEvent.click(btn);
	await waitFor(() => expect(mocks.inviteMember).toHaveBeenCalled());
}

describe("PendingInvitesSection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.cancelInvitation.mockResolvedValue({ data: {}, error: undefined });
		mocks.inviteMember.mockResolvedValue({ data: {}, error: undefined });
	});

	it("marks expired invitations as expired in the list", async () => {
		mocks.listInvitations.mockResolvedValue({
			data: [LIVE, EXPIRED],
			error: undefined,
		});
		render(<PendingInvitesSection />);
		expect(await screen.findByText("stale@example.com")).toBeTruthy();
		expect(row("stale@example.com").textContent).toMatch(/expired/);
		expect(row("live@example.com").textContent).toMatch(/expires/);
	});

	it("resends a live invite in place without cancelling anything", async () => {
		mocks.listInvitations.mockResolvedValue({ data: [LIVE], error: undefined });
		render(<PendingInvitesSection />);
		await screen.findByText("live@example.com");
		await clickResend("live@example.com");
		expect(mocks.inviteMember).toHaveBeenCalledWith({
			email: "live@example.com",
			role: "guide",
			resend: true,
		});
		expect(mocks.cancelInvitation).not.toHaveBeenCalled();
	});

	it("cancels the stale row before resending an expired invite", async () => {
		const order: string[] = [];
		mocks.cancelInvitation.mockImplementation(() => {
			order.push("cancel");
			return Promise.resolve({ data: {}, error: undefined });
		});
		mocks.inviteMember.mockImplementation(() => {
			order.push("invite");
			return Promise.resolve({ data: {}, error: undefined });
		});
		mocks.listInvitations.mockResolvedValue({
			data: [EXPIRED],
			error: undefined,
		});
		render(<PendingInvitesSection />);
		await screen.findByText("stale@example.com");
		await clickResend("stale@example.com");
		expect(mocks.cancelInvitation).toHaveBeenCalledWith({
			invitationId: "inv-expired",
		});
		expect(mocks.inviteMember).toHaveBeenCalledWith({
			email: "stale@example.com",
			role: "guide",
			resend: true,
		});
		expect(order).toEqual(["cancel", "invite"]);
	});

	it("cancels every expired duplicate for the same email", async () => {
		const dup = { ...EXPIRED, id: "inv-expired-2" };
		mocks.listInvitations.mockResolvedValue({
			data: [EXPIRED, dup],
			error: undefined,
		});
		render(<PendingInvitesSection />);
		const cells = await screen.findAllByText("stale@example.com");
		const btn = cells[0]?.closest("li")?.querySelectorAll("button")[0];
		if (!btn) throw new Error("no resend button in first stale row");
		fireEvent.click(btn);
		await waitFor(() => expect(mocks.inviteMember).toHaveBeenCalled());
		expect(mocks.cancelInvitation).toHaveBeenCalledTimes(2);
		expect(mocks.inviteMember).toHaveBeenCalledTimes(1);
	});

	it("reports a requested resend — never a sent one", async () => {
		mocks.listInvitations.mockResolvedValue({ data: [LIVE], error: undefined });
		render(<PendingInvitesSection />);
		await screen.findByText("live@example.com");
		await clickResend("live@example.com");
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
		const title = mocks.toastSuccess.mock.calls.at(0)?.[0];
		expect(title).toMatch(/requested/i);
		expect(title).not.toMatch(/\b(re)?sent\b/i);
	});

	it("surfaces inviteMember errors instead of claiming success", async () => {
		mocks.inviteMember.mockResolvedValue({
			data: undefined,
			error: { message: "invite exploded" },
		});
		mocks.listInvitations.mockResolvedValue({ data: [LIVE], error: undefined });
		render(<PendingInvitesSection />);
		await screen.findByText("live@example.com");
		await clickResend("live@example.com");
		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				expect.stringMatching(/invite exploded/),
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});
});
