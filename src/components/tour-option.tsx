import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TourOptionTour {
	_id: string;
	name: string;
	description?: string | null;
	durationHours: number;
	maxGuests: number;
	currency: string;
	basePriceCents?: bigint | number;
	primaryImageUrl?: string | null;
	primaryImageAlt?: string | null;
}

interface TourOptionProps {
	tour: TourOptionTour;
	fieldName: string;
	checked: boolean;
	onSelect: () => void;
	onBlur: () => void;
}

/**
 * One selectable tour on the public booking page: cover thumb (or a
 * serif monogram fallback that holds the same slot), name, duration /
 * capacity, and the per-person rate as its own tabular figure.
 */
export function TourOption({
	tour: t,
	fieldName,
	checked,
	onSelect,
	onBlur,
}: TourOptionProps) {
	return (
		<label
			htmlFor={`tour-${t._id}`}
			className={cn(
				"block cursor-pointer rounded-lg border p-4 transition-colors",
				checked ? "border-primary bg-accent" : "hover:bg-muted/40",
			)}
		>
			<div className="flex items-start gap-3">
				<input
					id={`tour-${t._id}`}
					type="radio"
					name={fieldName}
					value={t._id}
					checked={checked}
					onBlur={onBlur}
					onChange={onSelect}
					className="mt-1"
				/>
				{t.primaryImageUrl ? (
					<img
						src={t.primaryImageUrl}
						alt={t.primaryImageAlt || `${t.name} cover photo`}
						loading="lazy"
						className="aspect-[4/3] w-20 shrink-0 rounded-md object-cover sm:w-24"
					/>
				) : (
					<div
						aria-hidden="true"
						className="flex aspect-[4/3] w-20 shrink-0 items-center justify-center rounded-md bg-accent sm:w-24"
					>
						<span className="font-display text-2xl italic text-accent-foreground">
							{t.name.charAt(0).toUpperCase()}
						</span>
					</div>
				)}
				<div className="min-w-0 flex-1">
					<p className="font-medium">{t.name}</p>
					<p className="text-sm text-muted-foreground tabular-nums">
						{t.durationHours}h · up to {t.maxGuests} guests
					</p>
					{t.basePriceCents !== undefined && (
						<p className="mt-1 text-sm font-semibold tabular-nums">
							{formatPrice(Number(t.basePriceCents) / 100, t.currency)}{" "}
							<span className="font-normal text-muted-foreground">
								per person
							</span>
						</p>
					)}
					{t.description && <p className="mt-2 text-sm">{t.description}</p>}
				</div>
			</div>
		</label>
	);
}
