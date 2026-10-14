---
target: Guides & Tours public booking hero (source-only)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-10-03T16-21-08Z
slug: src-components-booking-hero-tsx
---
⚠️ DEGRADED: single-context (sub-agent spawn failed: Unknown model `cx/gpt-6-luna` for spawn_agent)

## Scope and method

Source-only critique of `src/components/booking-hero.tsx` on branch `session/gt-booking-hero` at `0595e74ab7863666a60b57ed9eddb627cfa5dbd2`, against the product's `DESIGN.md` and its use on `/book/$slug`. Assessment A was completed before Assessment B. The Impeccable detector returned no findings (`[]`, exit 0). No browser automation was exposed, so the page was not visually inspected in a browser; no local server was started.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2 | Count-up metrics begin at zero in server markup; existing ledger F560. |
| 2 | Match System / Real World | 3 | Booking language is direct, but the hero price can compare unrelated currencies. |
| 3 | User Control and Freedom | 4 | The header is passive and does not trap the visitor. |
| 4 | Consistency and Standards | 3 | Instrument Serif and coral match the product system; the three metrics have equal emphasis. |
| 5 | Error Prevention | 1 | Raw cent values from mixed currencies are compared as if they share a unit. |
| 6 | Recognition Rather Than Recall | 3 | Operator name and booking expectations are visible; price reliability weakens the signal. |
| 7 | Flexibility and Efficiency | 3 | A single public booking path fits the task, though the hero has no direct jump to the form. |
| 8 | Aesthetic and Minimalist Design | 3 | Clear hierarchy, but the seeded external photo is category-generic. |
| 9 | Error Recovery | 2 | The external image has no local or designed fallback. |
| 10 | Help and Documentation | 3 | “No account required” and operator confirmation set useful expectations. |
| **Total** | | **27/40** | **Clear foundation; price and image trust need focused work.** |

## Design Specificity Verdict

The hero follows the locked Field Operator / Mediterranean Travel direction through its Instrument Serif heading, coral accent, operator name, and booking-specific reassurance. The central image is a seeded `picsum.photos` response, not an operator or destination image, so it could belong to any travel product and may imply a place that is not this operator's. The three real metrics add useful context but use a familiar equal-weight SaaS strip. The strongest next move is an actual operator cover image with an intentional no-photo state, followed by a price treatment that stays honest when tours use different currencies.

The deterministic scan found 0 issues in this target. There is no detector/browser disagreement because browser evidence was unavailable.

## Overall Impression

The copy makes the booking terms feel low-friction and clear. The heading feels aligned with the product, while the generic photo and potentially incorrect “starting price” undermine trust at the exact point where a visitor is deciding whether to book.

## What's Working

- The organization name leads the heading, making the page feel tied to the operator rather than to a generic booking engine.
- “No account required” and “The operator confirms before it is final” explain the commitment level before the form.
- The stats derive from active tours, and the hero is omitted when the operator has no published tours; the code does not fabricate social proof.

## Priority Issues

1. **[P1] Starting price compares cents across different currencies.** `deriveBookingHeroStats` selects the smallest raw cent count and labels it with that tour's currency (`booking-hero.tsx:31-52`). EUR 50 can beat USD 120 numerically without representing the cheapest amount. The free-form currency field also falls back to USD only when empty and can throw on an invalid currency code. **Fix:** never compare amounts across currencies without an exchange-rate source; show separate prices or a neutral “Prices vary” state, validate currency codes, and keep malformed data from taking down the page. This is already tracked as F556 in the hub ledger.

2. **[P2] Seeded third-party photography does not identify the operator.** The visible image is fetched eagerly from `picsum.photos` using the public slug (`booking-hero.tsx:69-79`), has no error fallback, and is intentionally not the operator's own image. It can misrepresent the destination and adds an external image dependency. **Fix:** use operator-provided cover photography when available and an on-brand local placeholder when it is not; keep the empty state visually intentional.

3. **[P2] The hero rounds all currencies to whole major units.** `maximumFractionDigits: 0` (`booking-hero.tsx:48-52`) can make the hero disagree with the precise per-tour prices in the form. For a conversion surface, “starting price” should not silently round an amount upward or erase fractional units. **Fix:** format using the selected currency's normal minor-unit precision, or label a deliberately approximate display.

4. **[P2] Metric counts can remain zero in server-rendered or no-JavaScript output.** The hero passes real counts into `TrustMetric`, whose `CountUp` emits literal `0` and replaces it only in an effect (`trust-metric.tsx:13-32`). This is already recorded as F560; render the truthful final value in initial markup, then animate only after hydration if motion is allowed.

## Persona Red Flags

- **First-time international traveler:** sees a “starting price” that may select the numerically smallest currency amount rather than the lowest price; an empty currency silently appears as USD.
- **Traveler on a phone:** the three equal metric columns leave little width for “starting price per guest” and “largest group welcome.” Static source suggests heavy wrapping; no viewport screenshot was available to confirm overflow or clipping.
- **Visitor or crawler receiving server HTML without client effects:** sees zero tours / zero largest group despite real data, matching the existing F560 finding.

## Minor Observations

- The italic organization name is a familiar editorial emphasis pattern. It may fit the serif direction, but a roman emphasis using coral or weight would feel less templated.
- The image uses `rounded-2xl` while the metric group uses `rounded-xl`; align the radius scale if these are meant to read as one visual system.
- Keep the “Direct booking” eyebrow unique to the masthead; repeating that tracked-uppercase label across sections would weaken the hierarchy.

## Questions to Consider

- Can this page use the operator's real cover image, with a deliberate branded fallback until one exists?
- Should mixed-currency operators show a price per currency, or omit a single starting-price claim altogether?
