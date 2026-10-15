import { describe, expect, it } from "vitest"
import { roles, ALL_ROLES } from "../authz"

// FO-02/devin-09-01-P1: the DECLARED per-resource RBAC matrix, asserted as
// executable truth. convex/lib/authz.ts requirePermission() enforces exactly
// this via roles[role].authorize(). If you change who may do what, change it
// in authz.ts statements AND this matrix.
describe("declared RBAC matrix (booking resource)", () => {
  const can = (role: string, action: "create" | "read" | "update" | "delete") =>
    roles[role as keyof typeof roles]?.authorize({ booking: [action] }).success

  it("owner and admin have full booking CRUD", () => {
    for (const role of ["owner", "admin"]) {
      for (const action of ["create", "read", "update", "delete"] as const) {
        expect(can(role, action), `${role}:${action}`).toBe(true)
      }
    }
  })

  it("member is read-only on bookings (declared intent, now enforced)", () => {
    expect(can("member", "read")).toBe(true)
    for (const action of ["create", "update", "delete"] as const) {
      expect(can("member", action)).toBe(false)
    }
  })

  it("guide and driver are read-only on bookings", () => {
    for (const role of ["guide", "driver"]) {
      expect(can(role, "read")).toBe(true)
      for (const action of ["create", "update", "delete"] as const) {
        expect(can(role, action), `${role}:${action}`).toBe(false)
      }
    }
  })

  it("ALL_ROLES lists exactly the roles the matrix defines", () => {
    // ALL_ROLES is typed RoleName[], so tsc already proves every entry
    // exists in `roles`. The drift tsc misses is the other direction: a
    // role added to `roles` but left out of the runtime list.
    expect([...ALL_ROLES].sort()).toEqual(Object.keys(roles).sort())
  })
})
