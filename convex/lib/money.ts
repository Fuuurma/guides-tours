// Money helpers for OTA payload normalization.
//
// Providers send paid amounts in MAJOR units (dollars/euros/yen), which
// we store as integer minor units (cents). The conversion is per-currency:
// hardcoding `amount * 100` silently inflates zero-decimal currencies
// (JPY ¥1,200 → 120,000 stored cents) and truncates three-decimal ones
// (KWD 1.234 → 123 fils instead of 1,234).

// ISO 4217 exponent for codes that differ from the 2-decimal default.
// Absent and unrecognized codes use 2 — the dominant case for OTA flows.
const MINOR_UNIT_EXPONENTS: Record<string, number> = {
	// Zero-decimal currencies (no minor unit)
	BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
	PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
	// Three-decimal currencies (1 unit = 1,000 minor units)
	BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
	// Four-decimal currencies (fund/unit-reporting codes)
	CLF: 4, UYW: 4,
};

/**
 * Canonicalize a provider currency code: uppercase, and only the ISO
 * 3-letter shape survives — anything else (missing, numeric, junk)
 * returns undefined instead of polluting stored rows. Aggregation
 * queries group on this field, so "eur" and "EUR" must not coexist.
 */
export function normalizeCurrency(code: string | undefined): string | undefined {
	const normalized = code?.trim().toUpperCase();
	return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
}

/** Major-unit amount → integer minor units, honoring the currency's exponent. */
export function toMinorUnits(amount: number, currency?: string): bigint {
	const exponent = MINOR_UNIT_EXPONENTS[normalizeCurrency(currency) ?? ""] ?? 2;
	return BigInt(Math.round(amount * 10 ** exponent));
}
