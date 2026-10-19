/**
 * Constant-time byte comparison for signature verification.
 *
 * F466 fixed the OTA webhook verifier to compare over the LONGER input
 * and seed the diff with the length bit, so a length mismatch no longer
 * short-circuits the loop. F852 then found that verifier's own
 * wrong-length early return, one frame ABOVE that compare, which kept the
 * length-vs-content timing distinction the constant-time contract exists
 * to erase alive in the public verify path.
 *
 * The primitive lives here so every verifier uses ONE implementation.
 * A second hand-rolled copy in payments_stripe.ts is exactly how the two
 * drifted apart in the first place.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	// Compare over the LONGER length so execution time doesn't leak
	// whether a length mismatch occurred (F466; the RC twin of this fix
	// landed 2026-09-06). The early return also diverges from the
	// constant-time contract the OTA docs promise. The extra bytes of the
	// longer input XOR against 0 and only widen the diff — mismatch still
	// returns false.
	const max = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < max; i++) {
		diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	}
	return diff === 0;
}
