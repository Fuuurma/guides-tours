// Access-control statement tests.
//
// The roles/statement we wire into Better Auth's org plugin must
// remain consistent — silent changes (e.g. removing a role, changing
// its permissions) would break the multi-tenancy guarantee. These
// tests pin down the contract.
//
// Phase 3.5 (tour CRUD) and Phase 9 (other modules) will use these
// roles via authClient.organization.hasPermission() — that runtime
// check is enforced by Better Auth itself.

import { describe, expect, it } from "vitest";
import { ac, roles, statement, ALL_ROLES, type RoleName } from "../authz";
import { adminAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";

describe("convex/authz — access control", () => {
	it("exposes all 5 roles", () => {
		expect(ALL_ROLES).toEqual([
			"owner",
			"admin",
			"member",
			"guide",
			"driver",
		]);
		expect(Object.keys(roles).sort()).toEqual(ALL_ROLES.slice().sort());
	});

	it("extends Better Auth's default statements with app resources", () => {
		// Resources we added
		expect(statement).toHaveProperty("tour");
		expect(statement).toHaveProperty("booking");
		expect(statement).toHaveProperty("customer");
		expect(statement).toHaveProperty("vehicle");
		expect(statement).toHaveProperty("driver");
		expect(statement).toHaveProperty("assignment");
		expect(statement).toHaveProperty("otaIntegration");
		expect(statement).toHaveProperty("payment");
		expect(statement).toHaveProperty("notification");
		expect(statement).toHaveProperty("ownAvailability");
		expect(statement).toHaveProperty("ownVacation");
		// Better Auth's defaults still present
		expect(statement).toHaveProperty("organization");
		expect(statement).toHaveProperty("member");
		expect(statement).toHaveProperty("invitation");
	});

	describe("role permission matrix", () => {
		const actionCases: Array<{
			role: RoleName;
			resource: keyof typeof statement;
			action: string;
			shouldAllow: boolean;
		}> = [
			// Owner: full control on everything
			{ role: "owner", resource: "tour", action: "delete", shouldAllow: true },
			{ role: "owner", resource: "payment", action: "refund", shouldAllow: true },
			// Admin: same as owner for app resources (org delete / owner
			// change is gated by Better Auth's defaults, not our statement)
			{ role: "admin", resource: "tour", action: "create", shouldAllow: true },
			{ role: "admin", resource: "tour", action: "delete", shouldAllow: true },
			// Member: read-only
			{ role: "member", resource: "tour", action: "read", shouldAllow: true },
			{ role: "member", resource: "tour", action: "create", shouldAllow: false },
			// Guide: read + own availability/vacation
			{ role: "guide", resource: "tour", action: "read", shouldAllow: true },
			{ role: "guide", resource: "tour", action: "create", shouldAllow: false },
			{
				role: "guide",
				resource: "ownAvailability",
				action: "update",
				shouldAllow: true,
			},
			{
				role: "guide",
				resource: "ownVacation",
				action: "create",
				shouldAllow: true,
			},
			// Driver: same read surface as guide, no vacation self-service
			{
				role: "driver",
				resource: "ownAvailability",
				action: "update",
				shouldAllow: true,
			},
			{
				role: "driver",
				resource: "ownVacation",
				action: "create",
				shouldAllow: false,
			},
		];

		for (const c of actionCases) {
			it(`${c.role} ${c.shouldAllow ? "CAN" : "CANNOT"} ${c.action} ${c.resource}`, () => {
				const result = ac
					.newRole(roles[c.role].statements)
					.authorize({ [c.resource]: [c.action] } as never);
				expect(result.success).toBe(c.shouldAllow);
			});
		}
	});

	describe("owner / admin distinction (org delete + owner change)", () => {
		it("only owner can delete an organization", () => {
			// Default Better Auth statements (org delete gated to owner only)
			const ownerCanDelete = ac
				.newRole(ownerAc.statements)
				.authorize({ organization: ["delete"] } as never);
			const adminCanDelete = ac
				.newRole(adminAc.statements)
				.authorize({ organization: ["delete"] } as never);
			expect(ownerCanDelete.success).toBe(true);
			expect(adminCanDelete.success).toBe(false);
		});
	});

	describe("invitation permissions", () => {
		it("owner can create and cancel invitations", () => {
			const owner = ac
				.newRole(ownerAc.statements)
				.authorize({ invitation: ["create", "cancel"] } as never);
			expect(owner.success).toBe(true);
		});

		it("member cannot create invitations", () => {
			// memberAc only has read access on invitation.
			const member = ac
				.newRole(memberAc.statements)
				.authorize({ invitation: ["create"] } as never);
			expect(member.success).toBe(false);
		});
	});

	it("is built from createAccessControl (Better Auth wiring invariant)", () => {
		// If createAccessControl ever changes its export, this fails.
		expect(typeof ac.newRole).toBe("function");
		// `ac.authorize` exists at the type level but isn't always
		// callable directly on the singleton — Better Auth calls it
		// through role instances. Just assert it's present on a role.
		const probe = ac.newRole({ tour: ["read"] });
		expect(typeof probe.authorize).toBe("function");
	});
});
