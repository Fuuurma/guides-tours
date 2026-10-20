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

  it("every declared role is accounted for", () => {
    for (const role of ALL_ROLES) {
      expect(roles[role]).toBeDefined()
    }
  })
})

// GT-AUDIT-10: the assignment resource is now permission-bound too
// (assignments.ts gates via requirePermission("assignment", action)).
describe("declared RBAC matrix (assignment resource)", () => {
  const can = (role: string, action: "create" | "read" | "update" | "delete") =>
    roles[role as keyof typeof roles]?.authorize({ assignment: [action] }).success

  it("owner and admin have full assignment CRUD", () => {
    for (const role of ["owner", "admin"]) {
      for (const action of ["create", "read", "update", "delete"] as const) {
        expect(can(role, action), `${role}:${action}`).toBe(true)
      }
    }
  })

  it("member is read-only on assignments (members lost the old literal write gate)", () => {
    expect(can("member", "read")).toBe(true)
    for (const action of ["create", "update", "delete"] as const) {
      expect(can("member", action), `member:${action}`).toBe(false)
    }
  })

  it("guide can complete assignments (update) but not create or delete", () => {
    // Field staff close the assignments they are rostered on — the one
    // operational grant kept through the binding migration (GT-AUDIT-10).
    expect(can("guide", "read")).toBe(true)
    expect(can("guide", "update")).toBe(true)
    expect(can("guide", "create")).toBe(false)
    expect(can("guide", "delete")).toBe(false)
  })

  it("driver is read-only on assignments", () => {
    expect(can("driver", "read")).toBe(true)
    expect(can("driver", "update")).toBe(false)
  })
})
