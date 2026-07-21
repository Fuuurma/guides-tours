import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/utils";

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

function stripePromiseFor(publishableKey: string): Promise<Stripe | null> {
	let p = stripePromiseCache.get(publishableKey);
	if (!p) {
		p = loadStripe(publishableKey);
		stripePromiseCache.set(publishableKey, p);
	}
	return p;
}

type InnerProps = {
	returnUrl: string;
	amountLabel: string;
	onPaid: () => void;
	onCancel?: () => void;
};

function PaymentElementForm({
	returnUrl,
	amountLabel,
	onPaid,
	onCancel,
}: InnerProps) {
	const stripe = useStripe();
	const elements = useElements();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!stripe || !elements) return;
		setPending(true);
		setError(null);
		try {
			const { error: confirmError, paymentIntent } =
				await stripe.confirmPayment({
					elements,
					confirmParams: { return_url: returnUrl },
					redirect: "if_required",
				});
			if (confirmError) {
				setError(confirmError.message ?? "Payment failed");
				return;
			}
			if (
				paymentIntent?.status === "succeeded" ||
				paymentIntent?.status === "processing"
			) {
				onPaid();
			}
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setPending(false);
		}
	};

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<PaymentElement
				options={{
					layout: "tabs",
				}}
			/>
			{error ? (
				<p className="text-destructive text-sm" role="alert">
					{error}
				</p>
			) : null}
			<div className="flex flex-wrap gap-2">
				<Button type="submit" disabled={!stripe || !elements || pending}>
					{pending ? "Processing…" : `Pay ${amountLabel}`}
				</Button>
				{onCancel ? (
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={onCancel}
					>
						Cancel
					</Button>
				) : null}
			</div>
		</form>
	);
}

export type StripePaymentElementProps = {
	publishableKey: string;
	clientSecret: string;
	returnUrl: string;
	amountLabel: string;
	onPaid: () => void;
	onCancel?: () => void;
};

/** Embeds Stripe Payment Element for an existing PaymentIntent client secret. */
export function StripePaymentElement({
	publishableKey,
	clientSecret,
	returnUrl,
	amountLabel,
	onPaid,
	onCancel,
}: StripePaymentElementProps) {
	const stripePromise = useMemo(
		() => stripePromiseFor(publishableKey),
		[publishableKey],
	);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;
		stripePromise.then((s) => {
			if (!cancelled) setReady(Boolean(s));
		});
		return () => {
			cancelled = true;
		};
	}, [stripePromise]);

	if (!ready) {
		return (
			<p className="text-muted-foreground text-sm">Loading payment form…</p>
		);
	}

	return (
		<Elements
			stripe={stripePromise}
			options={{
				clientSecret,
				appearance: {
					theme: "stripe",
					variables: {
						borderRadius: "6px",
					},
				},
			}}
		>
			<PaymentElementForm
				returnUrl={returnUrl}
				amountLabel={amountLabel}
				onPaid={onPaid}
				onCancel={onCancel}
			/>
		</Elements>
	);
}
