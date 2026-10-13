/**
 * F758 — every public_booking.ts refusal maps to an actionable 4xx (or
 * 429), never the generic 500. The map is the extracted pure function,
 * so each refusal string is pinned directly.
 */
import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"
import { mapBookingError } from "../http"

function refusal(message: string): ConvexError<string> {
  return new ConvexError(message)
}

describe("mapBookingError (F758)", () => {
  it.each([
    [
      "Bookings must be made at least 24h before the tour",
      "Bookings must be made at least 24h before the tour",
      400,
    ],
  ])(
    "maps the cutoff refusal to 400 with the authored hours",
    (refusalText, message, status) => {
      const { message: m, status: s } = mapBookingError(refusal(refusalText))
      expect(s).toBe(status)
      expect(m).toBe(message)
    },
  )

  it("maps the guest-maximum refusal to 400 with the authored maximum", () => {
    const { message, status } = mapBookingError(
      refusal("Guest count exceeds tour maximum of 12"),
    )
    expect(status).toBe(400)
    expect(message).toBe("Guest count exceeds tour maximum of 12")
  })

  it("maps the seats refusal to 400", () => {
    const { message, status } = mapBookingError(
      refusal("Not enough seats left for this tour slot"),
    )
    expect(status).toBe(400)
    expect(message).toBe("Not enough seats left for this tour slot")
  })

  it("maps the inactive-tour refusal to 400", () => {
    const { message, status } = mapBookingError(refusal("Tour is not active"))
    expect(status).toBe(400)
    expect(message).toBe("This tour is not currently accepting bookings")
  })

  it.each([
    "Cannot book a cancelled schedule",
    "Cannot book cancelled schedule",
  ])("maps the cancelled-schedule refusal (%s) to 400", (text) => {
    const { message, status } = mapBookingError(refusal(text))
    expect(status).toBe(400)
    expect(message).toBe("This schedule has been cancelled")
  })

  it("maps the foreign-schedule refusal to 400", () => {
    const { message, status } = mapBookingError(
      refusal("Schedule does not belong to the specified tour"),
    )
    expect(status).toBe(400)
    expect(message).toBe("This schedule does not belong to the selected tour")
  })

  it("keeps the pre-existing mappings working", () => {
    expect(mapBookingError(refusal("rate limit exceeded")).status).toBe(429)
    expect(mapBookingError(refusal("Tour not found")).status).toBe(404)
    expect(
      mapBookingError(
        refusal("This date has a limited capacity that cannot be booked online."),
      ).message,
    ).toBe("This tour is fully booked")
    expect(
      mapBookingError(refusal("date is blacked out")).message,
    ).toBe("This date is not available for booking")
    expect(
      mapBookingError(refusal("Cannot book a tour in the past")).message,
    ).toBe("Cannot book tours in the past or within the cutoff period")
    expect(mapBookingError(refusal("Invalid email address")).message).toBe(
      "Invalid email address",
    )
  })

  it("falls back to the generic 500 for unknown errors", () => {
    const { message, status } = mapBookingError(
      refusal("internal stack trace details"),
    )
    expect(status).toBe(500)
    expect(message).toBe("An error occurred processing your booking")
  })

  it("maps validator rejections to 400", () => {
    const { status } = mapBookingError(
      new Error("Uncaught Error: Validator error at body.guests"),
    )
    expect(status).toBe(400)
  })
})
