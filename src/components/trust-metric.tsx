// Shared trust-metric trio (extracted from src/routes/index.tsx so the
// public booking hero reuses the exact component — no raw markup
// duplication). CountUp honors prefers-reduced-motion by rendering
// the final value with no animation.
import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	const inView = useInView(ref, { once: true, margin: "-60px" });
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		const node = ref.current;
		if (!inView || !node) {
			return;
		}
		if (reduceMotion) {
			node.textContent = `${to}${suffix}`;
			return;
		}
		const controls = animate(0, to, {
			duration: 1.5,
			ease: "easeOut",
			onUpdate: (value) => {
				node.textContent = `${Math.round(value)}${suffix}`;
			},
		});
		return () => controls.stop();
	}, [inView, to, suffix, reduceMotion]);

	return <span ref={ref}>0{suffix}</span>;
}

export type TrustMetricProps = { label: string } & (
	| { value: number; suffix?: string; valueText?: never }
	| { valueText: string; value?: never; suffix?: never }
);

export function TrustMetric(props: TrustMetricProps) {
	const { label } = props;
	return (
		<div className="flex flex-col items-center gap-1 px-3 text-center first:pl-0 last:pr-0">
			<p className="font-display text-2xl font-medium tracking-[-0.04em] tabular-nums sm:text-3xl">
				{props.valueText !== undefined ? (
					props.valueText
				) : (
					<CountUp to={props.value} suffix={props.suffix} />
				)}
			</p>
			<p className="max-w-32 text-xs text-muted-foreground sm:text-sm">
				{label}
			</p>
		</div>
	);
}
