export type BookingHeroTour = {
	_id: string;
	name: string;
	maxGuests: number;
	currency: string;
	basePriceCents: bigint | number | undefined;
};

export type BookingHeroStats = {
	tourCount: number;
	/** "from" price across priced tours, or null when none are priced. */
	fromPrice: string | null;
	/** Largest party any tour accepts, or null when no tours. */
	maxGroup: number | null;
};

const fromPriceFormatters = new Map<string, Intl.NumberFormat>();

function formatFromPrice(cents: number, currency: string): string {
	let fmt = fromPriceFormatters.get(currency);
	if (!fmt) {
		fmt = new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		});
		fromPriceFormatters.set(currency, fmt);
	}
	return fmt.format(cents / 100);
}

export function deriveBookingHeroStats(
	tours: BookingHeroTour[],
): BookingHeroStats {
	let minCents: number | null = null;
	let minCurrency = "USD";
	let maxGroup: number | null = null;
	for (const tour of tours) {
		if (tour.basePriceCents !== undefined) {
			const cents = Number(tour.basePriceCents);
			if (minCents === null || cents < minCents) {
				minCents = cents;
				minCurrency = tour.currency || "USD";
			}
		}
		if (maxGroup === null || tour.maxGuests > maxGroup) {
			maxGroup = tour.maxGuests;
		}
	}
	return {
		tourCount: tours.length,
		fromPrice:
			minCents === null ? null : formatFromPrice(minCents, minCurrency),
		maxGroup,
	};
}
