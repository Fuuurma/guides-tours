// Access-control statements for the organization plugin.
//
// Defines the 5 roles our app uses (overriding Better Auth's default
// owner/admin/member to add guide and driver) and the resources +
// actions each role can perform.
//
// Used by better-auth's `organization({ ac, roles })` config and
// surfaced on the client via `organizationClient({ ac, roles })`.
//
// Source: reservations-automation had 3 roles (GUIDE/STAFF/DRIVER).
// We map them onto Better Auth's RBAC:
//   - owner  -> created the org, full control
//   - admin  -> full control except delete org + change owner
//   - member -> read-only on org data
//   - guide  -> read-only + can update own availability/vacations
//   - driver -> read-only + can update own availability/notes
//
// Adding `tour`, `booking`, etc. as resources is Phase 3.5 work; for
// now we declare the org-level actions and a generic "document"
// namespace that we'll fill out as we port each module.

import { createAccessControl } from "better-auth/plugins/access";
import {
	defaultStatements,
	adminAc,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

// Each statement is a resource -> list of actions. `defaultStatements`
// is what Better Auth ships (organization, member, invitation, team).
// We extend with our app resources.
export const statement = {
	...defaultStatements,
	tour: ["create", "read", "update", "delete"],
	booking: ["create", "read", "update", "delete"],
	customer: ["create", "read", "update", "delete"],
	vehicle: ["create", "read", "update", "delete"],
	driver: ["create", "read", "update", "delete"],
	assignment: ["create", "read", "update", "delete"],
	otaIntegration: ["create", "read", "update", "delete"],
	payment: ["create", "read", "refund"],
	notification: ["create", "read", "send"],
	// Per-user self-service: a guide updating their own availability
	// or vacation request is always allowed regardless of role, but
	// the API surface for "guide self" lives under these resources.
	ownAvailability: ["read", "update"],
	ownVacation: ["create", "read"],
} as const;

export const ac = createAccessControl(statement);

// --- Role definitions ---

const owner = ac.newRole({
	...ownerAc.statements,
	tour: ["create", "read", "update", "delete"],
	booking: ["create", "read", "update", "delete"],
	customer: ["create", "read", "update", "delete"],
	vehicle: ["create", "read", "update", "delete"],
	driver: ["create", "read", "update", "delete"],
	assignment: ["create", "read", "update", "delete"],
	otaIntegration: ["create", "read", "update", "delete"],
	payment: ["create", "read", "refund"],
	notification: ["create", "read", "send"],
});

const admin = ac.newRole({
	...adminAc.statements,
	tour: ["create", "read", "update", "delete"],
	booking: ["create", "read", "update", "delete"],
	customer: ["create", "read", "update", "delete"],
	vehicle: ["create", "read", "update", "delete"],
	driver: ["create", "read", "update", "delete"],
	assignment: ["create", "read", "update", "delete"],
	otaIntegration: ["create", "read", "update", "delete"],
	payment: ["create", "read", "refund"],
	notification: ["create", "read", "send"],
});

const member = ac.newRole({
	...memberAc.statements,
	tour: ["read"],
	booking: ["read"],
	customer: ["read"],
	vehicle: ["read"],
	driver: ["read"],
	assignment: ["read"],
	otaIntegration: ["read"],
	payment: ["read"],
	notification: ["read"],
});

// Guide — same read as member, plus can update own availability + file
// vacation requests. Cannot create tours/bookings.
const guide = ac.newRole({
	...memberAc.statements,
	tour: ["read"],
	booking: ["read"],
	customer: ["read"],
	vehicle: ["read"],
	driver: ["read"],
	assignment: ["read"],
	otaIntegration: ["read"],
	notification: ["read"],
	ownAvailability: ["read", "update"],
	ownVacation: ["create", "read"],
});

// Driver — same as guide but typically no vacation requests handled
// here (they're separate from the company). Reads + own availability.
const driver = ac.newRole({
	...memberAc.statements,
	tour: ["read"],
	booking: ["read"],
	customer: ["read"],
	vehicle: ["read"],
	driver: ["read"],
	assignment: ["read"],
	otaIntegration: ["read"],
	notification: ["read"],
	ownAvailability: ["read", "update"],
});

export const roles = { owner, admin, member, guide, driver };

// Convenience: list of role names for runtime checks.
export type RoleName = keyof typeof roles;
export const ALL_ROLES: readonly RoleName[] = [
	"owner",
	"admin",
	"member",
	"guide",
	"driver",
] as const;
