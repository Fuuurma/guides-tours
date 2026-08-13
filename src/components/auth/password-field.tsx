import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Password input with a visibility toggle and a live strength meter.
// Used by sign-up, invite-accept, and reset-password — anywhere a new
// password is chosen. Sign-in keeps the plain input (no meter needed).

export function PasswordInput({
	value,
	onChange,
	onBlur,
	id,
	name,
	autoComplete,
	showStrength = false,
	disabled = false,
	invalid = false,
	"aria-invalid": ariaInvalid,
	"aria-describedby": ariaDescribedby,
}: {
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	id?: string;
	name?: string;
	autoComplete?: string;
	showStrength?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	"aria-invalid"?: boolean;
	"aria-describedby"?: string;
}) {
	const [visible, setVisible] = useState(false);
	const strength = passwordStrength(value);

	return (
		<div className="flex flex-col gap-2">
			<div className="relative">
				<input
					id={id}
					name={name}
					type={visible ? "text" : "password"}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
					autoComplete={autoComplete}
					disabled={disabled}
					aria-invalid={ariaInvalid ?? invalid}
					aria-describedby={ariaDescribedby}
					className={cn(
						"h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 pr-10 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
						"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
					)}
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="absolute inset-y-0 right-0 h-full w-9 rounded-l-none text-muted-foreground hover:text-foreground"
					onClick={() => setVisible((v) => !v)}
					aria-label={visible ? "Hide password" : "Show password"}
					tabIndex={-1}
				>
					{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</Button>
			</div>

			{showStrength && value.length > 0 ? (
				<PasswordStrength strength={strength} />
			) : null}
		</div>
	);
}

type Strength = "weak" | "fair" | "good" | "strong";

function passwordStrength(value: string): Strength {
	let score = 0;
	if (value.length >= 8) score += 1;
	if (value.length >= 12) score += 1;
	if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
	if (/\d/.test(value)) score += 1;
	if (/[^A-Za-z0-9]/.test(value)) score += 1;
	if (score <= 1) return "weak";
	if (score <= 2) return "fair";
	if (score <= 4) return "good";
	return "strong";
}

const STRENGTH_META: Record<
	Strength,
	{ label: string; color: string; segments: number }
> = {
	weak: { label: "Weak", color: "bg-destructive", segments: 1 },
	fair: { label: "Fair", color: "bg-chart-4", segments: 2 },
	good: { label: "Good", color: "bg-chart-2", segments: 3 },
	strong: { label: "Strong", color: "bg-chart-2", segments: 4 },
};

function PasswordStrength({ strength }: { strength: Strength }) {
	const meta = STRENGTH_META[strength];
	return (
		<div className="flex items-center gap-2.5" aria-live="polite">
			<div className="flex flex-1 gap-1">
				{[0, 1, 2, 3].map((i) => (
					<span
						key={i}
						className={cn(
							"h-1 flex-1 rounded-full bg-border",
							i < meta.segments && meta.color,
						)}
					/>
				))}
			</div>
			<span className="w-10 text-right text-xs text-muted-foreground">
				{meta.label}
			</span>
		</div>
	);
}
