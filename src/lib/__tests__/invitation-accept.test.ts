// Tests for the post-sign-in invitation helpers (F148).
//
// Pins three reviewed behaviors:
//   - acceptInvitationForSession returns the accept error instead of
//     letting callers navigate on a failed join (expired/mismatched
//     invites must surface, not silently land on /dashboard).
//   - On success it returns the post-accept org list so callers apply
//     the standard destination split (no org → /onboarding).
//   - googleCallbackUrl routes invite sign-ins through /auth/callback
//     carrying invitationId, so OAuth users can actually accept.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	acceptInvitation: vi.fn(),
	list: vi.fn(),
	setActive: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		organization: {
			acceptInvitation: mocks.acceptInvitation,
			list: mocks.list,
			setActive: mocks.setActive,
		},
	},
}));

import { acceptInvitationForSession, googleCallbackUrl } from "../invitations";

describe("acceptInvitationForSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.setActive.mockResolvedValue({ data: {}, error: null });
	});

	it("returns the accept error instead of swallowing it", async () => {
		mocks.acceptInvitation.mockResolvedValue({
			data: null,
			error: { message: "Invitation expired" },
		});
		const result = await acceptInvitationForSession("inv-1");
		expect(result).toEqual({ ok: false, message: "Invitation expired" });
		expect(mocks.list).not.toHaveBeenCalled();
		expect(mocks.setActive).not.toHaveBeenCalled();
	});

	it("falls back to a generic message when the error has none", async () => {
		mocks.acceptInvitation.mockResolvedValue({
			data: null,
			error: {},
		});
		const result = await acceptInvitationForSession("inv-1");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toBe("Could not accept invitation");
	});

	it("pins the single joined org and returns the org list", async () => {
		mocks.acceptInvitation.mockResolvedValue({ data: {}, error: null });
		mocks.list.mockResolvedValue({ data: [{ id: "org-1" }], error: null });
		const result = await acceptInvitationForSession("inv-1");
		expect(result).toEqual({ ok: true, orgs: [{ id: "org-1" }] });
		expect(mocks.setActive).toHaveBeenCalledWith({
			organizationId: "org-1",
		});
	});

	it("does not pin when the user belongs to multiple orgs", async () => {
		mocks.acceptInvitation.mockResolvedValue({ data: {}, error: null });
		mocks.list.mockResolvedValue({
			data: [{ id: "org-1" }, { id: "org-2" }],
			error: null,
		});
		const result = await acceptInvitationForSession("inv-1");
		expect(result.ok).toBe(true);
		expect(mocks.setActive).not.toHaveBeenCalled();
	});

	it("returns an empty org list when list() has no data", async () => {
		mocks.acceptInvitation.mockResolvedValue({ data: {}, error: null });
		mocks.list.mockResolvedValue({ data: null, error: null });
		const result = await acceptInvitationForSession("inv-1");
		expect(result).toEqual({ ok: true, orgs: [] });
	});
});

describe("googleCallbackUrl", () => {
	it("routes invite sign-ins through /auth/callback with the id", () => {
		expect(googleCallbackUrl({ invitationId: "inv-9" })).toBe(
			"/auth/callback?invitationId=inv-9",
		);
	});

	it("carries redirect alongside invitationId", () => {
		const url = googleCallbackUrl({
			invitationId: "inv-9",
			redirect: "/dashboard/guides",
		});
		expect(url).toBe(
			"/auth/callback?invitationId=inv-9&redirect=%2Fdashboard%2Fguides",
		);
	});

	it("keeps the absolute-destination behavior without an invite", () => {
		expect(
			googleCallbackUrl({
				redirect: "/dashboard",
				origin: "https://app.example.com",
			}),
		).toBe("https://app.example.com/dashboard");
	});

	it("defaults to /dashboard", () => {
		expect(googleCallbackUrl({})).toBe("/dashboard");
	});
});
